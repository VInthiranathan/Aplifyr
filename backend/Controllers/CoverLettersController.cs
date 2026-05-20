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

        if (string.IsNullOrEmpty(geminiKey) && string.IsNullOrEmpty(groqKey))
            return BadRequest(new { error = "Neither GEMINI_API_KEY nor GROQ_API_KEY is set" });

        // Extract jobs and user profile from request
        if (!request.TryGetProperty("jobs", out var jobs) || jobs.ValueKind != JsonValueKind.Array)
            return BadRequest(new { error = "Expected 'jobs' array in request body" });

        string userJson = "{}";
        string cvText = "";

        if (request.TryGetProperty("user", out var userProfile))
        {
            userJson = JsonSerializer.Serialize(userProfile, new JsonSerializerOptions { WriteIndented = true });
            
            // Extract CV URL if present
            if (userProfile.TryGetProperty("cv_url", out var cvUrlProp))
            {
                var cvUrl = cvUrlProp.GetString();
                if (!string.IsNullOrEmpty(cvUrl))
                {
                    cvText = $"[CV file available at: {cvUrl}]";
                }
            }
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
            
            var prompt = language == "sv" 
                ? $"Skriv ett professionellt och personligt personligt brev (på svenska) för följande jobbannons:\n\nJobbtitel: {title}\nFöretag: {employer}\nPlats: {location}\n\nJobbbeskrivning:\n{description}\n\nAnvändarprofil:\n{userJson}\n\n{(!string.IsNullOrEmpty(cvText) ? $"CV Information:\n{cvText}\n\n" : "")}Instruktioner:\n- Skriv ett kortfattat men övertygande personligt brev (150-250 ord)\n- Koppla användarens erfarenheter och kompetenser till jobbets krav\n- Var specifik och undvik generiska fraser\n- Visa entusiasm och motivation\n- Avsluta professionellt med hälsning"
                : $"Write a professional and personal cover letter (in English) for the following job posting:\n\nJob Title: {title}\nCompany: {employer}\nLocation: {location}\n\nJob Description:\n{description}\n\nUser Profile:\n{userJson}\n\n{(!string.IsNullOrEmpty(cvText) ? $"CV Information:\n{cvText}\n\n" : "")}Instructions:\n- Write a concise but compelling cover letter (150-250 words)\n- Connect the user's experience and skills to the job requirements\n- Be specific and avoid generic phrases\n- Show enthusiasm and motivation\n- End professionally with a greeting";

            string coverLetter = "";
            string errorMsg = "";

            // Try Gemini first
            if (!string.IsNullOrEmpty(geminiKey))
            {
                coverLetter = await TryGenerateWithGemini(geminiKey, prompt, language);
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    results.Add(new { title, coverLetter, provider = "Gemini" });
                    await Task.Delay(500);
                    continue;
                }
                errorMsg = "Gemini failed, trying Groq...";
            }

            // Fallback to Groq
            if (!string.IsNullOrEmpty(groqKey))
            {
                coverLetter = await TryGenerateWithGroq(groqKey, prompt, language);
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    results.Add(new { title, coverLetter, provider = "Groq" });
                    await Task.Delay(500);
                    continue;
                }
                errorMsg += " Groq also failed.";
            }

            results.Add(new { title, error = errorMsg, detail = "Both AI providers failed" });
            await Task.Delay(500);
        }

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
            if (!res.IsSuccessStatusCode) return "";

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

            return "";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Gemini error: {ex.Message}");
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
            if (!res.IsSuccessStatusCode) return "";

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

            return "";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Groq error: {ex.Message}");
            return "";
        }
    }
}
