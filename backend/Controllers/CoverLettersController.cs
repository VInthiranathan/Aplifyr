using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace Examensarbete.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CoverLettersController : ControllerBase
{
    private static readonly HttpClient _http = new();
    private readonly IWebHostEnvironment _env;

    public CoverLettersController(IWebHostEnvironment env)
    {
        _env = env;
    }

    [HttpPost("generate-all")]
    public async Task<IActionResult> GenerateAll([FromBody] JsonElement request)
    {
        var geminiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        var groqKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");

        Console.WriteLine($"[CoverLetters] GEMINI_API_KEY configured: {!string.IsNullOrEmpty(geminiKey)}");
        Console.WriteLine($"[CoverLetters] GROQ_API_KEY configured: {!string.IsNullOrEmpty(groqKey)}");

        if (string.IsNullOrEmpty(geminiKey) && string.IsNullOrEmpty(groqKey))
        {
            Console.WriteLine("[CoverLetters] ERROR: No API keys configured!");
            return BadRequest(new { error = "Neither GEMINI_API_KEY nor GROQ_API_KEY is set in backend/.env" });
        }

        // Extract jobs and user profile from request
        if (!request.TryGetProperty("jobs", out var jobs) || jobs.ValueKind != JsonValueKind.Array)
        {
            Console.WriteLine("[CoverLetters] ERROR: Missing 'jobs' array in request");
            return BadRequest(new { error = "Expected 'jobs' array in request body" });
        }

        Console.WriteLine($"[CoverLetters] Processing {jobs.GetArrayLength()} job(s)");

        string userJson = "{}";
        string cvText = "";
        string bioText = "";

        if (request.TryGetProperty("user", out var userProfile))
        {
            userJson = JsonSerializer.Serialize(userProfile, new JsonSerializerOptions { WriteIndented = true });
            Console.WriteLine($"[CoverLetters] User profile provided: {userJson.Length} chars");
            
            // Extract CV URL if present
            if (userProfile.TryGetProperty("cv_url", out var cvUrlProp))
            {
                var cvUrl = cvUrlProp.GetString();
                if (!string.IsNullOrEmpty(cvUrl))
                {
                    cvText = $"[CV file available at: {cvUrl}]";
                    Console.WriteLine($"[CoverLetters] CV URL found: {cvUrl}");
                }
            }

            // Extract bio/profile description if present
            if (userProfile.TryGetProperty("bio", out var bioProp))
            {
                var bio = bioProp.GetString();
                if (!string.IsNullOrEmpty(bio))
                {
                    bioText = bio;
                    Console.WriteLine($"[CoverLetters] Bio found: {bioText.Length} chars");
                }
            }
        }
        else
        {
            Console.WriteLine("[CoverLetters] WARNING: No user profile provided in request");
        }

        var results = new List<object>();

        foreach (var jobEl in jobs.EnumerateArray())
        {
            string title = "";
            try {
                if (jobEl.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String)
                    title = t.GetString() ?? "";
                else if (jobEl.TryGetProperty("headline", out var h) && h.ValueKind == JsonValueKind.String)
                    title = h.GetString() ?? "";
            } catch {}

            string employer = "";
            try {
                if (jobEl.TryGetProperty("employer", out var emp) && emp.ValueKind == JsonValueKind.Object && emp.TryGetProperty("name", out var n))
                    employer = n.GetString() ?? "";
                else if (jobEl.TryGetProperty("advertiser", out var adv) && adv.ValueKind == JsonValueKind.String)
                    employer = adv.GetString() ?? "";
            } catch {}

            string description = "";
            try { 
                if (jobEl.TryGetProperty("description", out var d) && d.ValueKind == JsonValueKind.Object) {
                    if (d.TryGetProperty("text", out var txt)) description = txt.GetString() ?? "";
                } else if (jobEl.TryGetProperty("description", out var d2) && d2.ValueKind == JsonValueKind.String) {
                    description = d2.GetString() ?? "";
                }
            } catch {}

            string location = "";
            try {
                if (jobEl.TryGetProperty("workplace_address", out var wa) && wa.ValueKind == JsonValueKind.Object) {
                    if (wa.TryGetProperty("municipality", out var mun)) location = mun.GetString() ?? "";
                    if (wa.TryGetProperty("region", out var reg)) location += (string.IsNullOrEmpty(location) ? "" : ", ") + (reg.GetString() ?? "");
                }
            } catch {}

            // Detect language from description
            string language = DetectLanguage(description);
            
            // Build context sections for the prompt
            string cvSection = !string.IsNullOrEmpty(cvText) 
                ? $"CV Information:\n{cvText}\n(Use this for work experience, education, technical skills, and concrete achievements)\n\n" 
                : "";
            
            string bioSection = !string.IsNullOrEmpty(bioText) 
                ? $"Profile Bio/Description:\n{bioText}\n(Use this for personality, goals, interests, soft skills, and personal presentation)\n\n" 
                : "";
            
            var prompt = language == "sv" 
                ? $"Skriv ett professionellt och personligt personligt brev (på svenska) för följande jobbannons:\n\nJobbtitel: {title}\nFöretag: {employer}\nPlats: {location}\n\nJobbbeskrivning:\n{description}\n\n{bioSection}{cvSection}Användarprofil:\n{userJson}\n\nInstruktioner:\n- Kombinera information från BÅDE profilbeskrivningen (bio) och CV:t för att skapa ett heltäckande personligt brev\n- Använd CV:t som huvudkälla för arbetslivserfarenhet, utbildning och tekniska färdigheter\n- Använd profilbeskrivningen för att visa personlighet, motivation, mål och mjuka färdigheter (soft skills)\n- Om samma information finns i båda källorna, prioritera konkreta fakta från CV:t men använd profilbion för att förbättra formuleringar\n- Undvik att upprepa exakt samma information två gånger\n- Skriv ett kortfattat men övertygande personligt brev (150-250 ord)\n- Koppla användarens erfarenheter och kompetenser till jobbets krav\n- Var specifik och undvik generiska fraser\n- Visa entusiasm och motivation baserat på information från profilen\n- Avsluta professionellt med hälsning"
                : $"Write a professional and personal cover letter (in English) for the following job posting:\n\nJob Title: {title}\nCompany: {employer}\nLocation: {location}\n\nJob Description:\n{description}\n\n{bioSection}{cvSection}User Profile:\n{userJson}\n\nInstructions:\n- Combine information from BOTH the profile description (bio) and CV to create a comprehensive cover letter\n- Use the CV as the primary source for work experience, education, and technical skills\n- Use the profile description to show personality, motivation, goals, and soft skills\n- If the same information appears in both sources, prioritize concrete facts from the CV but use the bio to improve phrasing\n- Avoid repeating the exact same information twice\n- Write a concise but compelling cover letter (150-250 words)\n- Connect the user's experience and skills to the job requirements\n- Be specific and avoid generic phrases\n- Show enthusiasm and motivation based on information from the profile\n- End professionally with a greeting";

            string coverLetter = "";
            string errorMsg = "";

            // Try Gemini first
            if (!string.IsNullOrEmpty(geminiKey))
            {
                Console.WriteLine($"[CoverLetters] Trying Gemini for job: {title}");
                coverLetter = await TryGenerateWithGemini(geminiKey, prompt, language);
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    Console.WriteLine($"[CoverLetters] ✓ Gemini succeeded for: {title}");
                    results.Add(new { title, coverLetter, provider = "Gemini" });
                    await Task.Delay(500);
                    continue;
                }
                Console.WriteLine($"[CoverLetters] ✗ Gemini failed for: {title}");
                errorMsg = "Gemini failed, trying Groq...";
            }

            // Fallback to Groq
            if (!string.IsNullOrEmpty(groqKey))
            {
                Console.WriteLine($"[CoverLetters] Trying Groq for job: {title}");
                coverLetter = await TryGenerateWithGroq(groqKey, prompt, language);
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    Console.WriteLine($"[CoverLetters] ✓ Groq succeeded for: {title}");
                    results.Add(new { title, coverLetter, provider = "Groq" });
                    await Task.Delay(500);
                    continue;
                }
                Console.WriteLine($"[CoverLetters] ✗ Groq failed for: {title}");
                errorMsg += " Groq also failed.";
            }

            Console.WriteLine($"[CoverLetters] ✗ Both AI providers failed for: {title}");
            results.Add(new { title, error = errorMsg, detail = "Both AI providers failed" });
            await Task.Delay(500);
        }

        Console.WriteLine($"[CoverLetters] Completed processing. Returning {results.Count} result(s)");
        return Ok(results);
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
                Console.WriteLine($"Gemini API error: Status {res.StatusCode}, Body: {errorBody}");
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

            Console.WriteLine($"Gemini response missing expected structure: {content}");
            return "";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Gemini exception: {ex.GetType().Name} - {ex.Message}");
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
                Console.WriteLine($"Groq API error: Status {res.StatusCode}, Body: {errorBody}");
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

            Console.WriteLine($"Groq response missing expected structure: {content}");
            return "";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Groq exception: {ex.GetType().Name} - {ex.Message}");
            return "";
        }
    }
}
