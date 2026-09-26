using System.Text.Json;
using System.Text.RegularExpressions;
using Aplifyr.Api.Security;
using Aplifyr.Api.Jobs;

namespace Aplifyr.Api.Cv;

public sealed class CvApplicationService(IConfiguration configuration, AiPrivacyGate privacy, CanonicalJobClient jobs, ILogger<CvApplicationService> logger)
{
    private static bool ValidId(string id) => Regex.IsMatch(id, "^[A-Za-z0-9_-]{1,100}$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static object Context(JsonElement job) => new { id = CvContent.Text(job, "id"), title = CvContent.Text(job, "headline"),
        company = job.TryGetProperty("employer", out var employer) ? CvContent.Text(employer, "name") : "",
        location = job.TryGetProperty("workplace_address", out var address) ? CvContent.Text(address, "municipality") : "" };

    public async Task<object> Get(HttpContext context, string jobId) {
        if (!ValidId(jobId)) throw new CvFailure(400, "invalidJob");
        var store = new CvStore(context, configuration);
        var saved = await store.Request($"generated_cvs?user_id=eq.{store.UserId}&job_id=eq.{Uri.EscapeDataString(jobId)}&expires_at=gt.{Uri.EscapeDataString(DateTimeOffset.UtcNow.ToString("O"))}&select=job_id,content,job_context,metadata,created_at,updated_at,expires_at&limit=1");
        if (saved.GetArrayLength() == 1)
            return new { job = saved[0].GetProperty("job_context"), cv = saved[0] };
        var job = await jobs.Get(jobId, context.RequestAborted);
        return new { job = Context(job), cv = (object?)null };
    }

    public async Task<object> Edit(HttpContext context, string jobId, JsonElement body) {
        if (!ValidId(jobId)) throw new CvFailure(400, "invalidJob");
        if (body.ValueKind != JsonValueKind.Object || body.EnumerateObject().Count() != 2 ||
            !body.TryGetProperty("edits", out var edits) || !body.TryGetProperty("updatedAt", out var version) ||
            version.ValueKind != JsonValueKind.String || !DateTimeOffset.TryParse(version.GetString(), out var expected))
            throw new CvFailure(400, "invalidEdit");
        var store = new CvStore(context, configuration);
        var path = $"generated_cvs?user_id=eq.{store.UserId}&job_id=eq.{Uri.EscapeDataString(jobId)}&expires_at=gt.{Uri.EscapeDataString(DateTimeOffset.UtcNow.ToString("O"))}";
        var saved = await store.Request(path + "&limit=1");
        if (saved.GetArrayLength() != 1) throw new CvFailure(409, "editConflict");
        var row = saved[0];
        if (!DateTimeOffset.TryParse(CvContent.Text(row, "updated_at"), out var current) || current != expected)
            throw new CvFailure(409, "editConflict");
        var content = CvEditing.Apply(row.GetProperty("content"), edits);
        // Compare-and-swap protects against edits, deletion and regeneration in another tab.
        // Only content and revision change: expiry and prepared-job markers are preserved.
        var updated = await store.UpdateCv(jobId, CvContent.Text(row, "updated_at"), content);
        if (updated.GetArrayLength() != 1) throw new CvFailure(409, "editConflict");
        return new { job = updated[0].GetProperty("job_context"), cv = updated[0] };
    }

    public async Task<object> Delete(HttpContext context, string jobId) {
        if (!ValidId(jobId)) throw new CvFailure(400, "invalidJob");
        var store = new CvStore(context, configuration);
        await store.DeleteCv(jobId);
        return new { deleted = true };
    }

    public async Task<object> Generate(HttpContext context, string jobId) {
        if (!ValidId(jobId)) throw new CvFailure(400, "invalidJob");
        GeminiProvider.CheckConfiguration(AiFeature.Cv);
        var store = new CvStore(context, configuration);
        // The shared reservation gate checks the current notice version for each external call.
        var noticeVersion = AiPrivacyGate.DocumentNoticeVersion;
        var consent = await store.Request($"ai_consents?user_id=eq.{store.UserId}&provider=eq.gemini&select=notice_version,granted&limit=1");
        if (consent.GetArrayLength() != 1 || CvContent.Text(consent[0], "notice_version") != noticeVersion ||
            !consent[0].TryGetProperty("granted", out var granted) || granted.ValueKind != JsonValueKind.True) throw new CvFailure(403, "consent");
        var job = await jobs.Get(jobId, context.RequestAborted); // Never use a search hit, client snapshot or stale ad for new generation.
        var (profile, career) = await store.Profile();
        var facts = CvContent.Facts(profile, career);
        var skills = CvContent.Strings(profile, "tech_stack").Concat(career.SelectMany(e => CvContent.Strings(e, "skills"))).Distinct().ToArray();
        if (facts.Count + skills.Length + career.Length == 0) throw new CvFailure(422, "profileEmpty");
        var description = job.TryGetProperty("description", out var desc) ? CvContent.Text(desc, "text") : "";
        if (description.Length == 0 || description.Length > 60000) throw new CvFailure(422, "jobLarge");
        var language = JobLanguage.Detect(description, CvContent.Text(job, "headline"));
        var matchedSkills = JobMatchingRules.CvMatchedSkills(job, skills);
        skills = skills.OrderByDescending(s => matchedSkills.Contains(s)).ToArray();
        // Bound AI disclosure, keeping relevance before recency. Full profile never leaves the backend.
        var ranked = career.OrderByDescending(e => CvContent.Strings(e, "skills").Count(s => matchedSkills.Contains(s))).ThenByDescending(e => CvContent.Text(e, "start_month")).Take(20).ToArray();
        var selectedIds = ranked.Select(e => CvContent.Text(e, "id")).ToHashSet();
        var selectedFacts = facts.Where(f => f.SourceId == "profile" || selectedIds.Contains(f.SourceId))
            .OrderBy(f => f.SourceId == "profile" ? -1 : Array.FindIndex(ranked, e => CvContent.Text(e, "id") == f.SourceId)).Take(100).ToList();
        var sourceHash = CvContent.Hash(new { profile, career });
        var jobHash = CvContent.Hash(job);
        var data = JsonSerializer.Serialize(new { externalJob = new { context = Context(job), description }, matchedSkills,
            verifiedProfile = new { facts = selectedFacts, explicitSkills = skills.Take(100), career = ranked.Select(e => new { id = CvContent.Text(e, "id"), kind = CvContent.Text(e, "kind"), title = CvContent.Text(e, "title"), organization = CvContent.Text(e, "organization") }) } });
        if (data.Length > 90000) throw new CvFailure(422, "profileLarge");
        var content = await CvGeneration.Generate(data, profile, ranked, selectedFacts, skills.Take(100).ToArray(),
            async (instructions, input, schema) => {
                // Every external call, including factual review, checks current consent and reserves its own attempt.
                await using var lease = await privacy.Reserve(context, "gemini");
                if (lease == null) throw new CvFailure(429, "consentOrQuota");
                return await new GeminiProvider(logger: logger).Generate(AiFeature.Cv, instructions, input, schema, context.RequestAborted);
            }, language);
        // Reject stale results when the profile changed during generation.
        var latest = await store.Profile();
        if (CvContent.Hash(new { profile = latest.Profile, career = latest.Career }) != sourceHash) throw new CvFailure(409, "profileChanged");
        var metadata = new { schemaVersion = CvContent.Version, promptVersion = 4, groundingVersion = 1, provider = "gemini", model = Environment.GetEnvironmentVariable("GEMINI_MODEL"),
            sourceHash, jobHash, noticeVersion, sourceLimited = ranked.Length < career.Length || selectedFacts.Count < facts.Count || skills.Length > 100 || CvContent.Text(profile, "bio").Length > 800 || career.Any(e => new[] { "description", "achievements", "learned", "strengths" }.Any(field => CvContent.Text(e, field).Length > 800)) };
        var jobContext = Context(job);
        var saved = await store.SaveCv(jobId, content, jobContext, metadata);
        if (saved.ValueKind != JsonValueKind.Object || CvContent.Text(saved, "job_id") != jobId ||
            !DateTimeOffset.TryParse(CvContent.Text(saved, "updated_at"), out _))
            throw new CvFailure(503, "storage");
        return new { job = saved.GetProperty("job_context"), cv = saved };
    }

}
