using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using static Aplifyr.Api.Jobs.JobMatchingRules;
using static Aplifyr.Api.Jobs.JobSearchCatalog;

namespace Aplifyr.Api.Jobs;

public class JobMatchingService(IMemoryCache _cache, HttpClient _http)
{
    private static readonly object MatchCacheLock = new();
    private sealed class MatchCapacityException : Exception { }
    private sealed record ScoredJob(int GradeOrder, int TotalScore, string Id, string Json);
    private sealed class MatchSearch
    {
        public required string Role { get; init; }
        public string SearchTerm { get; set; } = "";
        public int NextOffset { get; set; }
        public int Total { get; set; }
        public bool Complete { get; set; }
    }
    private sealed class MatchCacheEntry
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public List<ScoredJob> Jobs { get; set; } = new();
        public required List<MatchSearch> Searches { get; init; }
        public bool FetchComplete => Searches.All(search => search.Complete);
        public int TotalAfJobs => Searches.Sum(search => search.Total);
    }
    private sealed record MatchContext(string[] Roles, string Source, string[] Tags,
        HashSet<string> Municipalities, HashSet<string> Regions, HashSet<string> Preferences, string CacheKey);

    private static MatchContext? CreateMatchContext(MatchProfileRequest profile)
    {
        if ((profile.Roles?.Length ?? 0) > 20 || (profile.Tags?.Length ?? 0) > 200 ||
            (profile.LocationPreferences?.Length ?? 0) > 5 || (profile.Title?.Length ?? 0) > 200 ||
            (profile.Location?.Length ?? 0) > 200 || (profile.Roles ?? []).Any(role => role is null || role.Length > 100) ||
            (profile.Tags ?? []).Any(tag => tag is null || tag.Length > 100) ||
            (profile.LocationPreferences ?? []).Any(pref => pref is null || pref.Length > 50)) return null;
        var roles = (profile.Roles ?? []).Where(role => !string.IsNullOrWhiteSpace(role)).Select(role => role.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray();
        var source = roles.Length > 0 ? "roles" : !string.IsNullOrWhiteSpace(profile.Title) ? "title_fallback" : "none";
        if (source == "title_fallback") roles = [profile.Title!.Trim()];
        var tags = (profile.Tags ?? []).Where(tag => !string.IsNullOrWhiteSpace(tag)).Select(NormalizeTech)
            .Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray();
        var prefs = NormalizeLocationPreferences(profile.LocationPreferences ?? []);
        var municipalities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var regions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var location = (profile.Location ?? string.Empty).Trim().ToLowerInvariant();
        if (_municipalityToRegion.TryGetValue(location, out var regionName))
        {
            municipalities.Add(location);
            if (_regionCodes.TryGetValue(regionName, out var regionCode)) regions.Add(regionCode);
        }
        else if (_regionCodes.TryGetValue(location, out var regionCode)) regions.Add(regionCode);
        // Preserve unlisted municipality names for exact matches; do not invent their region.
        else if (location.Length > 0) municipalities.Add(location);
        var keyData = JsonSerializer.Serialize(new { roles = roles.Select(NormalizeRoleInput), tags,
            municipalities = municipalities.Order(), regions = regions.Order(), prefs = prefs.Order() });
        var key = $"match:{MATCH_QUERY_STRATEGY_VERSION}:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(keyData)));
        return new(roles, source, tags, municipalities, regions, prefs, key);
    }

    public async Task<string> Match(MatchProfileRequest? profile, int limit, int seed, CancellationToken cancellation)
    {
        if (profile is null || CreateMatchContext(profile) is not { } context) throw new JobSearchFailure(400, "Invalid match profile");
        var effectiveLimit = Math.Clamp(limit <= 0 ? DEFAULT_MATCH_RESPONSE_LIMIT : limit, 1, 500);
        if (context.Source == "none") return BuildMatchResponseJson([], 0, effectiveLimit, true, 0, context.Source, profile, context.Roles);
        try
        {
            MatchCacheEntry entry;
            // Publish one entry before fetching. The per-entry gate also serializes initial requests.
            lock (MatchCacheLock)
            {
                if (!_cache.TryGetValue(context.CacheKey, out MatchCacheEntry? cached) || cached is null)
                {
                    cached = new MatchCacheEntry { Searches = context.Roles.Select(role => new MatchSearch { Role = role }).ToList() };
                    _cache.Set(context.CacheKey, cached, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15), Size = 1 });
                }
                entry = cached;
            }
            await entry.Gate.WaitAsync(cancellation);
            try
            {
                // Separate queries give every desired role a chance, instead of requiring all roles in one ad.
                foreach (var search in entry.Searches.Where(search => search.SearchTerm.Length == 0))
                    await FetchMatchPage(entry, search, context, cancellation);
                if (!entry.FetchComplete && (seed != 0 || entry.Jobs.Count < effectiveLimit))
                    await FetchMatchPage(entry, entry.Searches.First(search => !search.Complete), context, cancellation);
                var sorted = entry.Jobs.OrderBy(job => job.GradeOrder).ThenByDescending(job => job.TotalScore).ThenBy(job => job.Id, StringComparer.Ordinal);
                var rng = new Random(seed);
                IEnumerable<ScoredJob> selected = seed == 0 ? sorted : sorted.GroupBy(job => job.GradeOrder).SelectMany(group => group.OrderBy(_ => rng.Next()));
                return BuildMatchResponseJson(selected.Take(effectiveLimit).Select(job => job.Json).ToList(), entry.Jobs.Count,
                    effectiveLimit, entry.FetchComplete, entry.TotalAfJobs, context.Source, profile, context.Roles);
            }
            finally { entry.Gate.Release(); }
        }
        catch (MatchCapacityException) { throw new JobSearchFailure(422, "matchCapacity"); }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            throw new JobSearchFailure(502, "Could not fetch matched jobs");
        }
    }

    public async Task<object> MatchContinue(MatchProfileRequest? profile, CancellationToken cancellation)
    {
        if (profile is null || CreateMatchContext(profile) is not { } context) throw new JobSearchFailure(400, "Invalid match profile");
        if (!_cache.TryGetValue(context.CacheKey, out MatchCacheEntry? entry) || entry is null)
            return new { fetchComplete = true, totalCached = 0, addedCount = 0, totalAfJobs = 0, cacheExpired = true };
        await entry.Gate.WaitAsync(cancellation);
        try
        {
            var before = entry.Jobs.Count;
            if (!entry.FetchComplete) await FetchMatchPage(entry, entry.Searches.First(search => !search.Complete), context, cancellation);
            return new { fetchComplete = entry.FetchComplete, totalCached = entry.Jobs.Count, addedCount = entry.Jobs.Count - before, totalAfJobs = entry.TotalAfJobs };
        }
        catch (MatchCapacityException) { throw new JobSearchFailure(422, "matchCapacity"); }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            throw new JobSearchFailure(502, "Could not fetch more jobs");
        }
        finally { entry.Gate.Release(); }
    }

    private async Task FetchMatchPage(MatchCacheEntry entry, MatchSearch search, MatchContext context, CancellationToken cancellation)
    {
        var term = string.IsNullOrEmpty(search.SearchTerm) ? search.Role : search.SearchTerm;
        var raw = await FetchAfSearchPageRawAsync(term, search.NextOffset, MATCH_UPSTREAM_FETCH_LIMIT, cancellation);
        // Try the spaced form of a compound role only if the initial query is empty.
        if (search.NextOffset == 0 && string.IsNullOrEmpty(search.SearchTerm))
        {
            using var first = JsonDocument.Parse(raw);
            if (first.RootElement.ValueKind == JsonValueKind.Object && first.RootElement.TryGetProperty("hits", out var firstHits) && firstHits.ValueKind == JsonValueKind.Array && firstHits.GetArrayLength() == 0)
            {
                var expanded = ExpandCompactRoleForSearch(term);
                if (expanded != term) { term = expanded; raw = await FetchAfSearchPageRawAsync(term, 0, MATCH_UPSTREAM_FETCH_LIMIT, cancellation); }
            }
        }
        using var document = JsonDocument.Parse(raw);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("hits", out var hits) || hits.ValueKind != JsonValueKind.Array ||
            !root.TryGetProperty("total", out var total) || total.ValueKind != JsonValueKind.Object ||
            !total.TryGetProperty("value", out var totalValue) || totalValue.ValueKind != JsonValueKind.Number || !totalValue.TryGetInt32(out var count) || count < 0)
            throw new JsonException("Invalid job search response");
        // Stage the whole page. A malformed response must not partially mutate the cache or advance its cursor.
        var additions = new List<ScoredJob>();
        var ids = entry.Jobs.Select(job => job.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var hit in hits.EnumerateArray())
        {
            if (hit.ValueKind != JsonValueKind.Object || !hit.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(id.GetString())) continue;
            var jobId = id.GetString()!;
            if (!ids.Add(jobId)) continue;
            var (included, matchedOn, matchedValue) = CheckRoleInclusion(hit, context.Roles.Select(NormalizeRoleInput).ToArray());
            if (!included) continue;
            var (locationScore, tier) = ScoreLocation(hit, context.Municipalities, context.Regions, context.Preferences);
            var (techBoost, terms) = ScoreTechBoost(hit, context.Tags);
            var score = locationScore + techBoost;
            var grade = AssignGrade(score);
            var reasons = new List<string> { $"role:{matchedOn} → '{matchedValue}'", $"location:{tier} → +{locationScore}",
                $"tech:[{string.Join(", ", terms)}] → +{techBoost}", $"score:{locationScore}+{techBoost}={score} → grade={grade}" };
            additions.Add(new(grade == "A" ? 0 : grade == "B" ? 1 : 2, score, jobId,
                BuildJobResultJson(hit.GetRawText(), grade, locationScore, tier, techBoost, terms, score, matchedOn, matchedValue, reasons)));
        }
        // Fail explicitly before mutation, never silently claim a truncated pool is complete.
        if (entry.Jobs.Count + additions.Count > 1000 || entry.Jobs.Sum(job => job.Json.Length) + additions.Sum(job => job.Json.Length) > 512 * 1024)
            throw new MatchCapacityException();
        entry.Jobs.AddRange(additions);
        search.SearchTerm = term;
        search.Total = count;
        search.NextOffset += hits.GetArrayLength();
        search.Complete = hits.GetArrayLength() == 0 || search.NextOffset >= count;
    }
    protected virtual async Task<string> FetchAfSearchPageRawAsync(string searchTerm, int offset, int limit, CancellationToken cancellation)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        qs["q"] = searchTerm; qs["limit"] = limit.ToString(); qs["offset"] = offset.ToString();
        using var response = await _http.GetAsync($"{AF_BASE}/{AF_SEARCH_PATH}?{qs}", cancellation);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellation);
    }

}
