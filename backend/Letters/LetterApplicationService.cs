using System.Text.Json;
using System.Text.RegularExpressions;
using Aplifyr.Api.Cv;
using static Aplifyr.Api.Letters.LetterJobFacts;

namespace Aplifyr.Api.Letters;

public sealed class LetterApplicationService(IConfiguration configuration, LetterProvider provider, ILogger<LetterApplicationService> logger)
{
    public async Task<object> GenerateAll(HttpContext context, JsonElement request)
    {
        if (request.ValueKind != JsonValueKind.Object) throw new CvFailure(400, "Expected an object");
        var approvedProviders = (Environment.GetEnvironmentVariable("AI_ALLOWED_PROVIDERS") ?? "")
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (approvedProviders.Length == 0) throw new CvFailure(503, "configuration");
        var geminiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        var groqKey = Environment.GetEnvironmentVariable("GROQ_API_KEY");

        if (!approvedProviders.Contains("gemini", StringComparer.OrdinalIgnoreCase)) geminiKey = null;
        if (!approvedProviders.Contains("groq", StringComparer.OrdinalIgnoreCase)) groqKey = null;

        logger.LogInformation("[CoverLetters] GEMINI_API_KEY configured: {IsConfigured}", !string.IsNullOrEmpty(geminiKey));
        logger.LogInformation("[CoverLetters] GROQ_API_KEY configured: {IsConfigured}", !string.IsNullOrEmpty(groqKey));

        if (string.IsNullOrEmpty(geminiKey) && string.IsNullOrEmpty(groqKey))
        {
            logger.LogError("[CoverLetters] ERROR: No API keys configured!");
            throw new CvFailure(503, "configuration");
        }

        // Extract jobs and user profile from request
        if (!request.TryGetProperty("jobs", out var jobs) || jobs.ValueKind != JsonValueKind.Array ||
            jobs.GetArrayLength() < 1 || jobs.GetArrayLength() > 3 ||
            jobs.EnumerateArray().Any(job => job.ValueKind != JsonValueKind.Object))
        {
            logger.LogError("[CoverLetters] ERROR: Missing 'jobs' array in request");
            throw new CvFailure(400, "Expected 'jobs' array in request body");
        }

        logger.LogInformation("[CoverLetters] Processing {JobCount} job(s)", jobs.GetArrayLength());

        string userJson = "{}";
        string bioText = "";

        if (request.TryGetProperty("user", out var userProfile) && userProfile.ValueKind == JsonValueKind.Object)
        {
            var allowedFields = new HashSet<string> { "name", "title", "location", "bio", "tech_stack", "roles", "career" };
            var profileFacts = userProfile.EnumerateObject()
                .Where(property => allowedFields.Contains(property.Name) && property.Name != "career")
                .ToDictionary(property => property.Name, property => property.Value);
            if (userProfile.TryGetProperty("career", out var career))
            {
                if (career.ValueKind != JsonValueKind.Array || career.GetArrayLength() > 3 || career.EnumerateArray().Any(e => e.ValueKind != JsonValueKind.Object))
                    throw new CvFailure(400, "Invalid selected career facts");
                var careerFields = new HashSet<string> { "kind", "title", "organization", "start_month", "end_month", "skills" };
                profileFacts["career"] = JsonSerializer.SerializeToElement(career.EnumerateArray().Select(entry =>
                    entry.EnumerateObject().Where(field => careerFields.Contains(field.Name)).ToDictionary(field => field.Name, field => field.Value)));
            }
            userJson = JsonSerializer.Serialize(profileFacts, new JsonSerializerOptions { WriteIndented = true });
            logger.LogInformation("[CoverLetters] User profile provided: {Length} chars", userJson.Length);

            // Extract bio/profile description if present
            if (userProfile.TryGetProperty("bio", out var bioProp))
            {
                var bio = bioProp.ValueKind == JsonValueKind.String ? bioProp.GetString() : null;
                if (!string.IsNullOrEmpty(bio))
                {
                    bioText = bio;
                    logger.LogInformation("[CoverLetters] Bio found: {Length} chars", bioText.Length);
                }
            }
        }
        else
        {
            logger.LogWarning("[CoverLetters] WARNING: No user profile provided in request");
        }

        var results = new List<object>();

        foreach (var jobEl in jobs.EnumerateArray())
        {
            var jobId = TryReadString(jobEl, "id", out var suppliedJobId) ? suppliedJobId : "";
            if (!ValidJobId(jobId))
                throw new CvFailure(400, "invalidJob");
            var title = ReadJobTitle(jobEl);
            var employer = ReadEmployer(jobEl);
            var description = ReadDescription(jobEl);
            var location = ReadLocation(jobEl);

            // Detect language from description
            string language = JobLanguage.Detect(description, title);

            // The entire user message is data. Instructions live in the provider's system role.
            var prompt = JsonSerializer.Serialize(new { job = new { title, employer, location, description }, profile = JsonSerializer.Deserialize<JsonElement>(userJson) });

            string coverLetter = "";
            string errorMsg = "";

            // Try Gemini first
            if (!string.IsNullOrEmpty(geminiKey))
            {
                logger.LogInformation("[CoverLetters] Provider or job-field processing status");
                try
                {
                    coverLetter = await provider.Gemini(context, prompt, language);
                }
                catch (CvFailure failure)
                {
                    logger.LogWarning("Cover letter failed: code={Code}, status={Status}", failure.Code, failure.Status);
                    // Preserve successful array responses; report a single-job failure as an HTTP error.
                    if (string.IsNullOrEmpty(groqKey))
                    {
                        if (jobs.GetArrayLength() == 1) throw;
                        results.Add(new { title, error = failure.Code });
                        continue;
                    }
                }
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    logger.LogInformation("[CoverLetters] Provider or job-field processing status");
                    var expiresAt = await SaveCoverLetter(context, jobId, title, employer, location, coverLetter, "Gemini");
                    if (expiresAt == null)
                        throw new CvFailure(503, "storage");
                    results.Add(new { title, coverLetter, provider = "Gemini", expiresAt });
                    await Task.Delay(500, context.RequestAborted);
                    continue;
                }
                logger.LogWarning("[CoverLetters] Provider or job-field processing status");
                errorMsg = "Gemini failed, trying Groq...";
            }

            // Fallback to Groq
            if (!string.IsNullOrEmpty(groqKey))
            {
                logger.LogInformation("[CoverLetters] Provider or job-field processing status");
                coverLetter = await provider.Groq(context, groqKey, prompt, language);
                if (!string.IsNullOrEmpty(coverLetter))
                {
                    logger.LogInformation("[CoverLetters] Provider or job-field processing status");
                    var expiresAt = await SaveCoverLetter(context, jobId, title, employer, location, coverLetter, "Groq");
                    if (expiresAt == null)
                        throw new CvFailure(503, "storage");
                    results.Add(new { title, coverLetter, provider = "Groq", expiresAt });
                    await Task.Delay(500, context.RequestAborted);
                    continue;
                }
                logger.LogWarning("[CoverLetters] Provider or job-field processing status");
                errorMsg += " Groq also failed.";
            }

            logger.LogWarning("[CoverLetters] Provider or job-field processing status");
            results.Add(new { title, error = errorMsg, detail = "Both AI providers failed" });
            await Task.Delay(500, context.RequestAborted);
        }

        logger.LogInformation("[CoverLetters] Completed processing. Returning {ResultCount} result(s)", results.Count);
        return results;
    }

    public static bool ValidJobId(string jobId) => Regex.IsMatch(jobId, "^[A-Za-z0-9_-]{1,100}$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    private async Task<DateTimeOffset?> SaveCoverLetter(HttpContext context, string jobId, string title, string employer, string location, string content, string provider)
    {
        try
        {
            var store = new CvStore(context, configuration);
            var deadline = await store.SaveLetter(jobId, content,
                new { id = jobId, title, company = employer, location }, new { provider });
            return deadline.ValueKind == JsonValueKind.String && DateTimeOffset.TryParse(deadline.GetString(), out var expiresAt)
                ? expiresAt : null;
        }
        catch (CvFailure failure)
        {
            logger.LogWarning("Cover-letter preparation marker failed: code={Code}", failure.Code);
            return null;
        }
    }

}
