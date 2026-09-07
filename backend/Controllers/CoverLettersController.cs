using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Examensarbete.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CoverLettersController : ControllerBase
{
    private static readonly HttpClient _http = new();
    private readonly ILogger<CoverLettersController> _logger;

    public CoverLettersController(ILogger<CoverLettersController> logger)
    {
        _logger = logger;
    }

    [HttpPost("generate-all")]
    public async Task<IActionResult> GenerateAll([FromBody] JsonElement request)
    {
        var geminiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        var groqKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");

        _logger.LogInformation("[CoverLetters] GEMINI_API_KEY configured: {IsConfigured}", !string.IsNullOrEmpty(geminiKey));
        _logger.LogInformation("[CoverLetters] GROQ_API_KEY configured: {IsConfigured}", !string.IsNullOrEmpty(groqKey));

        if (string.IsNullOrEmpty(geminiKey) && string.IsNullOrEmpty(groqKey))
        {
            _logger.LogError("[CoverLetters] ERROR: No API keys configured!");
            return BadRequest(new { error = "Neither GEMINI_API_KEY nor GROQ_API_KEY is set in backend/.env" });
        }

        // Extract jobs and user profile from request
        if (!request.TryGetProperty("jobs", out var jobs) || jobs.ValueKind != JsonValueKind.Array)
        {
            _logger.LogError("[CoverLetters] ERROR: Missing 'jobs' array in request");
            return BadRequest(new { error = "Expected 'jobs' array in request body" });
        }

        _logger.LogInformation("[CoverLetters] Processing {JobCount} job(s)", jobs.GetArrayLength());

        string userJson = "{}";
        string bioText = "";

        if (request.TryGetProperty("user", out var userProfile) && userProfile.ValueKind == JsonValueKind.Object)
        {
            var allowedFields = new HashSet<string> { "name", "title", "location", "bio", "tech_stack", "roles" };
            var profileFacts = userProfile.EnumerateObject()
                .Where(property => allowedFields.Contains(property.Name))
                .ToDictionary(property => property.Name, property => property.Value);
            userJson = JsonSerializer.Serialize(profileFacts, new JsonSerializerOptions { WriteIndented = true });
            _logger.LogInformation("[CoverLetters] User profile provided: {Length} chars", userJson.Length);
            
            // Extract bio/profile description if present
            if (userProfile.TryGetProperty("bio", out var bioProp))
            {
                var bio = bioProp.GetString();
                if (!string.IsNullOrEmpty(bio))
                {
                    bioText = bio;
                    _logger.LogInformation("[CoverLetters] Bio found: {Length} chars", bioText.Length);
                }
            }
        }
        else
        {
            _logger.LogWarning("[CoverLetters] WARNING: No user profile provided in request");
        }

        var results = new List<object>();

        foreach (var jobEl in jobs.EnumerateArray())
        {
            var title = ReadJobTitle(jobEl);
            var employer = ReadEmployer(jobEl, title);
            var description = ReadDescription(jobEl, title);
            var location = ReadLocation(jobEl, title);

            // Detect language from description
            string language = DetectLanguage(description);
            bool hasBioText = !string.IsNullOrEmpty(bioText);
            
            // Build context sections for the prompt
            string bioSection = hasBioText 
                ? $"Profile Bio/Description:\n{bioText}\n(Use this for personality, goals, interests, soft skills, and personal presentation)\n\n" 
                : "";

            var promptInstructions = BuildPromptInstructions(language, hasBioText);
            
            var prompt = language == "sv" 
                ? $"Skriv ett professionellt och personligt personligt brev (på svenska) för följande jobbannons:\n\nJobbtitel: {title}\nFöretag: {employer}\nPlats: {location}\n\nJobbbeskrivning:\n{description}\n\n{bioSection}Användarprofil:\n{userJson}\n\nInstruktioner:\n{promptInstructions}"
                : $"Write a professional and personal cover letter (in English) for the following job posting:\n\nJob Title: {title}\nCompany: {employer}\nLocation: {location}\n\nJob Description:\n{description}\n\n{bioSection}User Profile:\n{userJson}\n\nInstructions:\n{promptInstructions}";

            string coverLetter = "";
            string errorMsg = "";

            // Try Gemini first
            if (!string.IsNullOrEmpty(geminiKey))
            {
                _logger.LogInformation("[CoverLetters] Trying Gemini for job: {Title}", title);
                coverLetter = await TryGenerateWithGemini(geminiKey, prompt, language);
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    _logger.LogInformation("[CoverLetters] Gemini succeeded for: {Title}", title);
                    results.Add(new { title, coverLetter, provider = "Gemini" });
                    await Task.Delay(500);
                    continue;
                }
                _logger.LogWarning("[CoverLetters] Gemini failed for: {Title}", title);
                errorMsg = "Gemini failed, trying Groq...";
            }

            // Fallback to Groq
            if (!string.IsNullOrEmpty(groqKey))
            {
                _logger.LogInformation("[CoverLetters] Trying Groq for job: {Title}", title);
                coverLetter = await TryGenerateWithGroq(groqKey, prompt, language);
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    _logger.LogInformation("[CoverLetters] Groq succeeded for: {Title}", title);
                    results.Add(new { title, coverLetter, provider = "Groq" });
                    await Task.Delay(500);
                    continue;
                }
                _logger.LogWarning("[CoverLetters] Groq failed for: {Title}", title);
                errorMsg += " Groq also failed.";
            }

            _logger.LogWarning("[CoverLetters] Both AI providers failed for: {Title}", title);
            results.Add(new { title, error = errorMsg, detail = "Both AI providers failed" });
            await Task.Delay(500);
        }

        _logger.LogInformation("[CoverLetters] Completed processing. Returning {ResultCount} result(s)", results.Count);
        return Ok(results);
    }

    private string ReadJobTitle(JsonElement jobElement)
    {
        if (TryReadString(jobElement, "title", out var title))
        {
            return title;
        }

        if (TryReadString(jobElement, "headline", out var headline))
        {
            return headline;
        }

        return string.Empty;
    }

    private string ReadEmployer(JsonElement jobElement, string title)
    {
        if (jobElement.TryGetProperty("employer", out var employerElement))
        {
            if (employerElement.ValueKind == JsonValueKind.Object)
            {
                if (TryReadString(employerElement, "name", out var employerName))
                {
                    return employerName;
                }

                _logger.LogWarning("[CoverLetters] Job {Title}: employer.name missing or invalid", title);
            }
            else if (employerElement.ValueKind != JsonValueKind.Null && employerElement.ValueKind != JsonValueKind.Undefined)
            {
                _logger.LogWarning("[CoverLetters] Job {Title}: employer expected object but was {ValueKind}", title, employerElement.ValueKind);
            }
        }

        if (TryReadString(jobElement, "advertiser", out var advertiser))
        {
            return advertiser;
        }

        return string.Empty;
    }

    private string ReadDescription(JsonElement jobElement, string title)
    {
        if (!jobElement.TryGetProperty("description", out var descriptionElement))
        {
            return string.Empty;
        }

        if (descriptionElement.ValueKind == JsonValueKind.String)
        {
            return descriptionElement.GetString() ?? string.Empty;
        }

        if (descriptionElement.ValueKind == JsonValueKind.Object)
        {
            if (TryReadString(descriptionElement, "text", out var text))
            {
                return text;
            }

            _logger.LogWarning("[CoverLetters] Job {Title}: description.text missing or invalid", title);
            return string.Empty;
        }

        if (descriptionElement.ValueKind != JsonValueKind.Null && descriptionElement.ValueKind != JsonValueKind.Undefined)
        {
            _logger.LogWarning("[CoverLetters] Job {Title}: description had unexpected kind {ValueKind}", title, descriptionElement.ValueKind);
        }

        return string.Empty;
    }

    private string ReadLocation(JsonElement jobElement, string title)
    {
        if (!jobElement.TryGetProperty("workplace_address", out var workplaceAddressElement))
        {
            return string.Empty;
        }

        if (workplaceAddressElement.ValueKind != JsonValueKind.Object)
        {
            if (workplaceAddressElement.ValueKind != JsonValueKind.Null && workplaceAddressElement.ValueKind != JsonValueKind.Undefined)
            {
                _logger.LogWarning("[CoverLetters] Job {Title}: workplace_address expected object but was {ValueKind}", title, workplaceAddressElement.ValueKind);
            }

            return string.Empty;
        }

        var parts = new List<string>();
        if (TryReadString(workplaceAddressElement, "municipality", out var municipality))
        {
            parts.Add(municipality);
        }

        if (TryReadString(workplaceAddressElement, "region", out var region))
        {
            parts.Add(region);
        }

        if (parts.Count == 0)
        {
            _logger.LogWarning("[CoverLetters] Job {Title}: workplace_address missing municipality and region", title);
        }

        return string.Join(", ", parts);
    }

    private static bool TryReadString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;

        if (!element.TryGetProperty(propertyName, out var propertyElement))
        {
            return false;
        }

        if (propertyElement.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = propertyElement.GetString() ?? string.Empty;
        return true;
    }

    private string DetectLanguage(string text)
    {
        if (string.IsNullOrEmpty(text)) return "sv";
        
        // Simple Swedish word detection
        var swedishWords = new[] { "och", "att", "för", "är", "med", "den", "det", "som", "på", "till", "av", "vi", "söker", "arbetsuppgifter", "krav", "erfarenhet" };
        var lowerText = text.ToLower();
        var swedishCount = swedishWords.Count(w => lowerText.Contains(w));
        
        return swedishCount >= 3 ? "sv" : "en";
    }

    private static string BuildPromptInstructions(string language, bool hasBio)
    {
        var instructions = new List<string>();

        if (language == "sv")
        {
            if (hasBio)
            {
                instructions.Add("Använd profilbeskrivningen som huvudkälla för personlighet, motivation, mål och relevanta mjuka färdigheter");
                instructions.Add("Använd användarprofilen som stöd för relevanta erfarenheter, roller och teknikstack");
            }
            else
            {
                instructions.Add("Använd jobbannonsen och användarprofilen för att skriva ett relevant och trovärdigt personligt brev");
            }

            instructions.Add("Hitta inte på erfarenheter, utbildningar eller prestationer som saknas i användarprofilen");
            instructions.Add("Undvik att upprepa exakt samma information två gånger");
            instructions.Add("Skriv ett kortfattat men övertygande personligt brev (150-250 ord)");
            instructions.Add("Koppla användarens erfarenheter och kompetenser till jobbets krav");
            instructions.Add("Var specifik och undvik generiska fraser");
            instructions.Add("Visa entusiasm och motivation baserat på informationen som faktiskt finns tillgänglig");
            instructions.Add("Avsluta professionellt med hälsning");
        }
        else
        {
            if (hasBio)
            {
                instructions.Add("Use the profile description as the primary source for personality, motivation, goals, and relevant soft skills");
                instructions.Add("Use the user profile as supporting context for relevant experience, roles, and technology stack");
            }
            else
            {
                instructions.Add("Use the job description and the user profile to write a relevant and credible cover letter");
            }

            instructions.Add("Do not invent experience, education, or achievements missing from the user profile");
            instructions.Add("Avoid repeating the exact same information twice");
            instructions.Add("Write a concise but compelling cover letter (150-250 words)");
            instructions.Add("Connect the user's experience and skills to the job requirements");
            instructions.Add("Be specific and avoid generic phrases");
            instructions.Add("Show enthusiasm and motivation based on the information that is actually available");
            instructions.Add("End professionally with a greeting");
        }

        return "- " + string.Join("\n- ", instructions);
    }

    private async Task<string> TryGenerateWithGemini(string apiKey, string prompt, string language)
    {
        try
        {
            var systemPrompt = language == "sv" 
                ? "Du är en expert på att skriva professionella och personliga personliga brev på svenska. Du anpassar varje brev till jobbets specifika krav och användarens bakgrund."
                : "You are an expert at writing professional and personal cover letters in English. You tailor each letter to the job's specific requirements and the user's background.";

            var payload = new
            {
                contents = new[] {
                    new {
                        parts = new[] {
                            new { text = $"{systemPrompt}\n\n{prompt}" }
                        }
                    }
                },
                generationConfig = new {
                    temperature = 0.7,
                    maxOutputTokens = 1000
                }
            };

            var req = new HttpRequestMessage(HttpMethod.Post, $"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={apiKey}");
            req.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            var res = await _http.SendAsync(req);
            if (!res.IsSuccessStatusCode)
            {
                var errorBody = await res.Content.ReadAsStringAsync();
                _logger.LogWarning("Gemini API error: Status {StatusCode}, Body: {Body}", res.StatusCode, errorBody);
                return "";
            }

            var content = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);

            if (doc.RootElement.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
            {
                var firstCandidate = candidates[0];
                if (firstCandidate.TryGetProperty("content", out var contentObj) &&
                    contentObj.TryGetProperty("parts", out var parts) && parts.GetArrayLength() > 0)
                {
                    var firstPart = parts[0];
                    if (firstPart.TryGetProperty("text", out var textProp))
                    {
                        return textProp.GetString() ?? "";
                    }
                }
            }

            _logger.LogWarning("Gemini response missing expected structure: {Content}", content);
            return "";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Gemini exception: {ExceptionType} - {Message}", ex.GetType().Name, ex.Message);
            return "";
        }
    }

    private async Task<string> TryGenerateWithGroq(string apiKey, string prompt, string language)
    {
        try
        {
            var systemPrompt = language == "sv" 
                ? "Du är en expert på att skriva professionella och personliga personliga brev på svenska. Du anpassar varje brev till jobbets specifika krav och användarens bakgrund."
                : "You are an expert at writing professional and personal cover letters in English. You tailor each letter to the job's specific requirements and the user's background.";

            var payload = new
            {
                model = "llama-3.3-70b-versatile",
                messages = new[] {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = prompt }
                },
                max_tokens = 1000,
                temperature = 0.7
            };

            var req = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            req.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            var res = await _http.SendAsync(req);
            if (!res.IsSuccessStatusCode)
            {
                var errorBody = await res.Content.ReadAsStringAsync();
                _logger.LogWarning("Groq API error: Status {StatusCode}, Body: {Body}", res.StatusCode, errorBody);
                return "";
            }

            var content = await res.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);

            if (doc.RootElement.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
            {
                var firstChoice = choices[0];
                if (firstChoice.TryGetProperty("message", out var message) &&
                    message.TryGetProperty("content", out var contentProp))
                {
                    return contentProp.GetString() ?? "";
                }
            }

            _logger.LogWarning("Groq response missing expected structure: {Content}", content);
            return "";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Groq exception: {ExceptionType} - {Message}", ex.GetType().Name, ex.Message);
            return "";
        }
    }
}
