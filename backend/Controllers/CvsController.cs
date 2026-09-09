using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using System.Text.RegularExpressions;
using Aplifyr.Api.Cv;
using Aplifyr.Api.Security;

namespace Aplifyr.Api.Controllers;

[ApiController]
[Route("api/cvs")]
public sealed class CvsController(IConfiguration configuration, AiPrivacyGate privacy) : ControllerBase
{
    private static readonly HttpClient Jobs = new(new HttpClientHandler { AllowAutoRedirect = false })
        { Timeout = TimeSpan.FromSeconds(15), MaxResponseContentBufferSize = 1024 * 1024 };
    private static bool ValidId(string id) => Regex.IsMatch(id, "^[A-Za-z0-9_-]{1,100}$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private async Task<JsonElement> Job(string id)
    {
        using var response = await Jobs.GetAsync("https://jobsearch.api.jobtechdev.se/ad/" + Uri.EscapeDataString(id), HttpContext.RequestAborted);
        if ((int)response.StatusCode is 404 or 410) throw new CvFailure(410, "jobUnavailable");
        if (!response.IsSuccessStatusCode) throw new CvFailure(502, "jobUnavailable");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(HttpContext.RequestAborted));
        if (CvContent.Text(doc.RootElement, "id") != id) throw new CvFailure(502, "jobUnavailable");
        return doc.RootElement.Clone();
    }
    private static object Context(JsonElement job) => new { id = CvContent.Text(job, "id"), title = CvContent.Text(job, "headline"),
        company = job.TryGetProperty("employer", out var employer) ? CvContent.Text(employer, "name") : "",
        location = job.TryGetProperty("workplace_address", out var address) ? CvContent.Text(address, "municipality") : "" };

    [HttpGet("{jobId}")]
    public Task<IActionResult> Get(string jobId) => Run(async () => {
        if (!ValidId(jobId)) throw new CvFailure(400, "invalidJob");
        var saved = await new CvStore(HttpContext, configuration).Saved(jobId);
        if (saved != null) return Ok(new { job = saved.Value.GetProperty("job_context"), cv = saved });
        var job = await Job(jobId);
        return Ok(new { job = Context(job), cv = (object?)null });
    });

    [HttpPost("{jobId}/generate")]
    [RequestSizeLimit(1024)]
    public Task<IActionResult> Generate(string jobId) => Run(async () => {
        if (!ValidId(jobId)) throw new CvFailure(400, "invalidJob");
        GeminiProvider.CheckConfiguration(AiFeature.Cv);
        var store = new CvStore(HttpContext, configuration);
        // A reviewed notice version specifically covering full career facts and CV storage is required.
        var noticeVersion = configuration["GEMINI_CV_NOTICE_VERSION"];
        if (string.IsNullOrWhiteSpace(noticeVersion)) throw new CvFailure(503, "configuration");
        var consent = await store.Request($"ai_consents?user_id=eq.{store.UserId}&provider=eq.gemini&select=notice_version,granted&limit=1");
        if (consent.GetArrayLength() != 1 || CvContent.Text(consent[0], "notice_version") != noticeVersion ||
            !consent[0].TryGetProperty("granted", out var granted) || granted.ValueKind != JsonValueKind.True) throw new CvFailure(403, "consent");
        var job = await Job(jobId); // Never use a search hit, client snapshot or stale ad for new generation.
        var (profile, career) = await store.Profile();
        var facts = CvContent.Facts(profile, career);
        var skills = CvContent.Strings(profile, "tech_stack").Concat(career.SelectMany(e => CvContent.Strings(e, "skills"))).Distinct().ToArray();
        if (facts.Count + skills.Length + career.Length == 0) throw new CvFailure(422, "profileEmpty");
        var description = job.TryGetProperty("description", out var desc) ? CvContent.Text(desc, "text") : "";
        if (description.Length == 0 || description.Length > 60000) throw new CvFailure(422, "jobLarge");
        var matchedSkills = ExternalJobsController.CvMatchedSkills(job, skills);
        skills = skills.OrderByDescending(s => matchedSkills.Contains(s)).ToArray();
        // Bound AI disclosure, keeping relevance before recency. Full profile never leaves the backend.
        var ranked = career.OrderByDescending(e => CvContent.Strings(e, "skills").Count(s => matchedSkills.Contains(s))).ThenByDescending(e => CvContent.Text(e, "start_month")).Take(20).ToArray();
        var selectedIds = ranked.Select(e => CvContent.Text(e, "id")).ToHashSet();
        var selectedFacts = facts.Where(f => f.SourceId == "profile" || selectedIds.Contains(f.SourceId))
            .OrderBy(f => f.SourceId == "profile" ? -1 : Array.FindIndex(ranked, e => CvContent.Text(e, "id") == f.SourceId)).Take(100).ToList();
        var sourceHash = CvContent.Hash(new { profile, career });
        var jobHash = CvContent.Hash(job);
        var saved = await store.Saved(jobId);
        object? cachedAnalysis = null;
        if (saved is { } previous && CvContent.Text(previous.GetProperty("metadata"), "jobHash") == jobHash)
            cachedAnalysis = previous.GetProperty("content").GetProperty("analysis");
        var data = JsonSerializer.Serialize(new { externalJob = new { context = Context(job), description }, matchedSkills, cachedAnalysis,
            verifiedProfile = new { facts = selectedFacts, explicitSkills = skills.Take(100), career = ranked.Select(e => new { id = CvContent.Text(e, "id"), kind = CvContent.Text(e, "kind"), title = CvContent.Text(e, "title"), organization = CvContent.Text(e, "organization") }) } });
        if (data.Length > 90000) throw new CvFailure(422, "profileLarge");
        var content = await CvGeneration.Generate(data, profile, ranked, selectedFacts, skills.Take(100).ToArray(),
            async (instructions, input, schema) => {
                // Every external call, including factual review, checks current consent and reserves its own attempt.
                await using var lease = await privacy.Reserve(HttpContext, "gemini");
                if (lease == null) throw new CvFailure(429, "consentOrQuota");
                return await new GeminiProvider().Generate(AiFeature.Cv, instructions, input, schema, HttpContext.RequestAborted);
            });
        // Reject stale saves when the profile changed during generation.
        var latest = await store.Profile();
        if (CvContent.Hash(new { profile = latest.Profile, career = latest.Career }) != sourceHash) throw new CvFailure(409, "profileChanged");
        var metadata = new { schemaVersion = CvContent.Version, promptVersion = 2, groundingVersion = 1, provider = "gemini", model = Environment.GetEnvironmentVariable("GEMINI_MODEL"),
            sourceHash, jobHash, noticeVersion, sourceLimited = ranked.Length < career.Length || selectedFacts.Count < facts.Count || skills.Length > 100 || CvContent.Text(profile, "bio").Length > 800 || career.Any(e => new[] { "description", "achievements", "learned", "strengths" }.Any(field => CvContent.Text(e, field).Length > 800)) };
        await store.Request("rpc/save_generated_cv", HttpMethod.Post, new { p_user = store.UserId, p_job = jobId, p_content = content, p_context = Context(job), p_metadata = metadata }, service: true);
        return Ok(new { job = Context(job), cv = await store.Saved(jobId) });
    });

    private async Task<IActionResult> Run(Func<Task<IActionResult>> action)
    {
        Response.Headers.CacheControl = "private, no-store";
        if (User.Identity?.IsAuthenticated != true) return Unauthorized(new { error = "authentication" });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(90));
        var originalCancellation = HttpContext.RequestAborted;
        HttpContext.RequestAborted = timeout.Token;
        try { return await action(); }
        catch (CvFailure e) { return StatusCode(e.Status, new { error = e.Code }); }
        catch (OperationCanceledException) { return StatusCode(504, new { error = "timeout" }); }
        catch (Exception e) when (e is HttpRequestException or JsonException or InvalidOperationException or KeyNotFoundException)
        { return StatusCode(503, new { error = "unavailable" }); }
        finally { HttpContext.RequestAborted = originalCancellation; }
    }
}
