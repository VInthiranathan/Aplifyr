using System.Text.Json;
using Aplifyr.Api.Cv;
using Aplifyr.Api.Security;
using static Aplifyr.Api.Letters.LetterPrompt;

namespace Aplifyr.Api.Letters;

public sealed class LetterProvider(HttpClient http, AiPrivacyGate privacy, ILogger<LetterProvider> logger)
{
    public async Task<string> Gemini(HttpContext context, string prompt, string language)
    {
        GeminiProvider.CheckConfiguration(AiFeature.CoverLetter);
        await using var lease = await privacy.Reserve(context, "gemini");
        if (lease is null) throw new CvFailure(429, "consentOrQuota");
        try
        {
            var systemPrompt = language == "sv"
                ? "Du är en expert på att skriva professionella och personliga personliga brev på svenska. Du anpassar varje brev till jobbets specifika krav och användarens bakgrund."
                : "You are an expert at writing professional and personal cover letters in English. You tailor each letter to the job's specific requirements and the user's background.";

            systemPrompt += "\n" + SafeInstructions(language);
            return await new Aplifyr.Api.Cv.GeminiProvider(logger: logger).Generate(
                Aplifyr.Api.Cv.AiFeature.CoverLetter, systemPrompt, prompt, null, context.RequestAborted);
        }
        catch (CvFailure) { throw; }
        catch (Exception ex)
        {
            logger.LogWarning("Gemini request failed: {ExceptionType}", ex.GetType().Name);
            throw new CvFailure(502, "provider");
        }
    }

    public async Task<string> Groq(HttpContext context, string apiKey, string prompt, string language)
    {
        await using var lease = await privacy.Reserve(context, "groq");
        if (lease is null) return "";
        try
        {
            var systemPrompt = language == "sv"
                ? "Du är en expert på att skriva professionella och personliga personliga brev på svenska. Du anpassar varje brev till jobbets specifika krav och användarens bakgrund."
                : "You are an expert at writing professional and personal cover letters in English. You tailor each letter to the job's specific requirements and the user's background.";

            systemPrompt += "\n" + SafeInstructions(language);
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

            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            req.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            using var res = await http.SendAsync(req, context.RequestAborted);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("Groq API error: Status {StatusCode}", res.StatusCode);
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

            logger.LogWarning("Groq response missing expected structure");
            return "";
        }
        catch (Exception ex)
        {
            logger.LogWarning("Groq request failed: {ExceptionType}", ex.GetType().Name);
            return "";
        }
    }

}
