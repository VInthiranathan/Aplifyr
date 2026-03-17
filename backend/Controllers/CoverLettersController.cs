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
    public async Task<IActionResult> GenerateAll([FromBody] JsonElement jobs)
    {
        var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrEmpty(apiKey))
            return BadRequest(new { error = "OPENAI_API_KEY not set in environment" });

        var userPath = Path.Combine(_env.ContentRootPath, "Data", "user.json");
        if (!System.IO.File.Exists(userPath))
            return NotFound(new { error = "user.json not found" });

        var userJson = System.IO.File.ReadAllText(userPath);

        var results = new List<object>();

        if (jobs.ValueKind != JsonValueKind.Array)
            return BadRequest(new { error = "Expected an array of jobs in request body" });

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
            try { if (jobEl.TryGetProperty("description", out var d) && d.ValueKind == JsonValueKind.String) description = d.GetString() ?? ""; } catch {}

            var prompt = $"Skriv ett kort, professionellt och personligt personligt brev (på svenska) riktat till tjänsten '{title}' hos '{employer}'. Använd följande användarprofil: {userJson}. Här är jobbbeskrivningen: {description}. Håll brevet till ungefär 150-250 ord, anpassa kompetenser och motivation efter jobbtexten och betona kopplingen mellan användarens erfarenheter och vad som efterfrågas.";

            var payload = new
            {
                model = "gpt-4o-mini",
                messages = new[] {
                    new { role = "system", content = "Du skriver korta och professionella personliga brev på svenska, anpassade efter jobbannonsens krav." },
                    new { role = "user", content = prompt }
                },
                max_tokens = 800,
                temperature = 0.6
            };

            var req = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            req.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            try
            {
                var res = await _http.SendAsync(req);
                var content = await res.Content.ReadAsStringAsync();
                if (!res.IsSuccessStatusCode)
                {
                    results.Add(new { title, error = $"OpenAI error: {res.StatusCode}", detail = content });
                }
                else
                {
                    using var doc = JsonDocument.Parse(content);
                    var text = "";
                    try { text = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? ""; } catch {}
                    results.Add(new { title, coverLetter = text });
                }
            }
            catch (Exception ex)
            {
                results.Add(new { title, error = "Request failed", detail = ex.Message });
            }

            await Task.Delay(200);
        }

        return Ok(results);
    }
}
