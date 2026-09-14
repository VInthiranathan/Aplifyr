using System.Text.Json;

namespace Aplifyr.Api.Cv;

public enum AiFeature { CoverLetter, Cv }
public sealed class CvFailure(int status, string code, int? providerStatus = null, string? providerReason = null) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public int? ProviderStatus { get; } = providerStatus;
    public string? ProviderReason { get; } = providerReason;
}

/// <summary>One transport, explicit feature credentials, no credential/provider fallback.</summary>
public sealed class GeminiProvider(HttpClient? transport = null, ILogger? logger = null)
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

    private static string ErrorReason(string body)
    {
        // Return only locally defined labels, never an arbitrary provider error string.
        try
        {
            using var document = JsonDocument.Parse(body);
            var error = document.RootElement.GetProperty("error");
            if (error.TryGetProperty("message", out var message) && message.ValueKind == JsonValueKind.String
                && message.GetString()!.Contains("reported as leaked", StringComparison.OrdinalIgnoreCase)) return "blockedKey";
            if (error.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Array)
                foreach (var detail in details.EnumerateArray())
                    if (detail.ValueKind == JsonValueKind.Object && detail.TryGetProperty("reason", out var reason)
                        && reason.ValueKind == JsonValueKind.String && reason.GetString() is
                        "API_KEY_INVALID" or "API_KEY_EXPIRED" or "API_KEY_SERVICE_BLOCKED" or
                        "API_KEY_HTTP_REFERRER_BLOCKED" or "API_KEY_IP_ADDRESS_BLOCKED" or
                        "SERVICE_DISABLED" or "BILLING_DISABLED" or "CONSUMER_INVALID") return reason.GetString()!;
            return error.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.String
                && status.GetString() is "INVALID_ARGUMENT" or "FAILED_PRECONDITION" or "PERMISSION_DENIED"
                    or "NOT_FOUND" or "RESOURCE_EXHAUSTED" or "UNAVAILABLE" ? status.GetString()! : "unknown";
        }
        catch (Exception error) when (error is JsonException or KeyNotFoundException or InvalidOperationException)
        { return "unknown"; }
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
                (int)response.StatusCode == 429 ? "quota" : (int)response.StatusCode is 400 or 401 or 403 or 404 ? "configuration" : "provider", (int)response.StatusCode,
                ErrorReason(await response.Content.ReadAsStringAsync(cancellation)));
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
            var candidate = json.RootElement.GetProperty("candidates")[0];
            if (candidate.GetProperty("finishReason").GetString() != "STOP") throw new CvFailure(502, "invalidOutput");
            return candidate.GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString()
                ?? throw new CvFailure(502, "invalidOutput");
        }
        catch (CvFailure failure)
        {
            // Never log credentials, provider response bodies, prompts or generated text.
            logger?.LogWarning("Gemini {Feature} failed: code={Code}, providerStatus={ProviderStatus}, reason={Reason}", feature, failure.Code, failure.ProviderStatus, failure.ProviderReason);
            throw;
        }
        catch (OperationCanceledException) { throw new CvFailure(504, "timeout"); }
        catch (HttpRequestException) { throw new CvFailure(502, "provider"); }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException or IndexOutOfRangeException)
        { throw new CvFailure(502, "invalidOutput"); }
    }
}
