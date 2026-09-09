using System.Text.Json;

namespace Aplifyr.Api.Cv;

public enum AiFeature { CoverLetter, Cv }
public sealed class CvFailure(int status, string code) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

/// <summary>One transport, explicit feature credentials, no credential/provider fallback.</summary>
public sealed class GeminiProvider(HttpClient? transport = null)
{
    private static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false })
        { Timeout = TimeSpan.FromSeconds(30), MaxResponseContentBufferSize = 128 * 1024 };
    public static string Credential(AiFeature feature) =>
        Environment.GetEnvironmentVariable(feature == AiFeature.Cv ? "GEMINI_CV_API_KEY" : "GEMINI_API_KEY") is { } key && key.Length is > 0 and <= 512 && key.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.')
            ? key : throw new CvFailure(503, "configuration");

    public static void CheckConfiguration(AiFeature feature)
    {
        _ = Credential(feature);
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GEMINI_MODEL")) ||
            !(Environment.GetEnvironmentVariable("AI_ALLOWED_PROVIDERS") ?? "").Split(',', StringSplitOptions.TrimEntries).Contains("gemini", StringComparer.OrdinalIgnoreCase))
            throw new CvFailure(503, "configuration");
    }

    public async Task<string> Generate(AiFeature feature, string instructions, string data, object? schema, CancellationToken cancellation)
    {
        CheckConfiguration(feature);
        var config = new Dictionary<string, object> { ["temperature"] = feature == AiFeature.Cv ? 0.2 : 0.7,
            ["maxOutputTokens"] = feature == AiFeature.Cv ? 6000 : 1000 };
        if (schema != null) { config["responseMimeType"] = "application/json"; config["responseSchema"] = schema; }
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(Environment.GetEnvironmentVariable("GEMINI_MODEL")!)}:generateContent");
        request.Headers.Add("x-goog-api-key", Credential(feature));
        request.Content = JsonContent.Create(new { systemInstruction = new { parts = new[] { new { text = instructions } } },
            contents = new[] { new { role = "user", parts = new[] { new { text = data } } } }, generationConfig = config });
        try
        {
            using var response = await (transport ?? Http).SendAsync(request, cancellation);
            if (!response.IsSuccessStatusCode) throw new CvFailure((int)response.StatusCode == 429 ? 429 : 502,
                (int)response.StatusCode == 429 ? "quota" : (int)response.StatusCode is 400 or 401 or 403 ? "configuration" : "provider");
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
            var candidate = json.RootElement.GetProperty("candidates")[0];
            if (candidate.GetProperty("finishReason").GetString() != "STOP") throw new CvFailure(502, "invalidOutput");
            return candidate.GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString()
                ?? throw new CvFailure(502, "invalidOutput");
        }
        catch (OperationCanceledException) { throw new CvFailure(504, "timeout"); }
        catch (HttpRequestException) { throw new CvFailure(502, "provider"); }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException or IndexOutOfRangeException)
        { throw new CvFailure(502, "invalidOutput"); }
    }
}
