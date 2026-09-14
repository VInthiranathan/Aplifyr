namespace Aplifyr.Api.Cv;

/// <summary>Operator-only, time-limited smoke check using fixed synthetic data.</summary>
public sealed class AiProviderDiagnostics(ILogger<AiProviderDiagnostics> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Disabled by default. An expiry within the next 30 minutes explicitly opts in.
        // Never accesses users, profiles, consent records or request-supplied input.
        if (!DateTimeOffset.TryParse(Environment.GetEnvironmentVariable("AI_DIAGNOSTICS_UNTIL"), out var until)
            || until <= DateTimeOffset.UtcNow || until > DateTimeOffset.UtcNow.AddMinutes(30)) return;
        var model = Environment.GetEnvironmentVariable("GEMINI_MODEL") ?? "";
        var safeModel = model.StartsWith("gemini-", StringComparison.Ordinal) && model.Length <= 100
            && model.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '.') ? model : "invalid-or-unrecognized";
        foreach (var feature in new[] { AiFeature.CoverLetter, AiFeature.Cv })
        {
            if (stoppingToken.IsCancellationRequested || DateTimeOffset.UtcNow >= until) return;
            try
            {
                object? schema = feature == AiFeature.Cv ? new {
                    type = "OBJECT", properties = new { status = new { type = "STRING" } }, required = new[] { "status" }
                } : null;
                _ = await new GeminiProvider(logger: logger).Generate(feature,
                    "This is a synthetic connectivity check. Return the word OK, or a JSON object with status OK when a JSON schema is supplied.",
                    "Synthetic test. No personal data.", schema, stoppingToken);
                logger.LogInformation("AI diagnostic {Feature}: success, model={Model}", feature, safeModel);
            }
            catch (CvFailure failure)
            {
                logger.LogWarning("AI diagnostic {Feature}: code={Code}, providerStatus={ProviderStatus}, model={Model}",
                    feature, failure.Code, failure.ProviderStatus, safeModel);
            }
            catch (Exception)
            {
                logger.LogWarning("AI diagnostic {Feature}: unexpected failure", feature);
            }
        }
    }
}
