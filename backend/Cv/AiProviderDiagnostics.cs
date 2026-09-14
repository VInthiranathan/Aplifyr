using System.Text.Json;

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
                var provider = new GeminiProvider(logger: logger);
                if (feature == AiFeature.Cv)
                {
                    using var profile = JsonDocument.Parse("""{"full_name":"Synthetic Applicant","title":"Developer","bio":"Built internal C# tools.","tech_stack":["C#"]}""");
                    using var work = JsonDocument.Parse("""{"id":"synthetic-work","kind":"work","title":"Developer","organization":"Synthetic Company","description":"Implemented APIs in C#.","skills":["C#"]}""");
                    var facts = CvContent.Facts(profile.RootElement, [work.RootElement]);
                    var data = JsonSerializer.Serialize(new {
                        externalJob = new { description = "Synthetic job: maintain C# APIs and internal tools." },
                        verifiedProfile = new { facts, explicitSkills = new[] { "C#" },
                            career = new[] { new { id = "synthetic-work", kind = "work", title = "Developer", organization = "Synthetic Company" } } }
                    });
                    _ = await CvGeneration.Generate(data, profile.RootElement, [work.RootElement], facts, ["C#"],
                        (instructions, input, schema) => provider.Generate(feature, instructions, input, schema, stoppingToken));
                }
                else
                {
                    var letter = await provider.Generate(feature,
                        "Write a concise plain-text cover letter, 150 to 200 words. Use only the synthetic applicant facts. Do not invent qualifications.",
                        "Synthetic applicant: developed internal C# tools. Synthetic role: maintain C# APIs. No personal data.", null, stoppingToken);
                    if (string.IsNullOrWhiteSpace(letter)) throw new CvFailure(502, "invalidOutput");
                }
                logger.LogInformation("AI diagnostic {Feature}: success, model={Model}", feature, safeModel);
            }
            catch (CvFailure failure)
            {
                logger.LogWarning("AI diagnostic {Feature}: code={Code}, providerStatus={ProviderStatus}, reason={Reason}, model={Model}",
                    feature, failure.Code, failure.ProviderStatus, failure.ProviderReason, safeModel);
            }
            catch (Exception)
            {
                logger.LogWarning("AI diagnostic {Feature}: unexpected failure", feature);
            }
        }
    }
}
