using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;

namespace Aplifyr.Api.Controllers;

public partial class ExternalJobsController
{
    private static readonly object MatchCacheLock = new();
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
        var location = NormalizeLocation(profile.Location);
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

    [HttpPost("match")]
    public async Task<IActionResult> Match([FromBody] MatchProfileRequest? profile, [FromQuery] int limit = DEFAULT_MATCH_RESPONSE_LIMIT, [FromQuery] int seed = 0)
    {
        if (profile is null || CreateMatchContext(profile) is not { } context) return BadRequest(new { error = "Invalid match profile" });
        var effectiveLimit = Math.Clamp(limit <= 0 ? DEFAULT_MATCH_RESPONSE_LIMIT : limit, 1, 500);
        if (context.Source == "none") return Content(BuildMatchResponseJson([], 0, effectiveLimit, true, 0, context.Source, profile, context.Roles), "application/json");
        try
        {
            MatchCacheEntry entry;
            // Publish one entry before fetching. The per-entry gate also serializes initial requests.
            lock (MatchCacheLock)
            {
                if (!_cache.TryGetValue(context.CacheKey, out MatchCacheEntry? cached) || cached is null)
                {
                    cached = new MatchCacheEntry { Searches = context.Roles.Select(role => new MatchSearch { Role = role }).ToList() };
                    _cache.Set(context.CacheKey, cached, TimeSpan.FromMinutes(15));
                }
                entry = cached;
            }
            await entry.Gate.WaitAsync(HttpContext.RequestAborted);
            try
            {
                // Separate queries give every desired role a chance, instead of requiring all roles in one ad.
                foreach (var search in entry.Searches.Where(search => search.SearchTerm.Length == 0))
                    await FetchMatchPage(entry, search, context);
                if (!entry.FetchComplete && (seed != 0 || entry.Jobs.Count < effectiveLimit))
                    await FetchMatchPage(entry, entry.Searches.First(search => !search.Complete), context);
                var sorted = entry.Jobs.OrderBy(job => job.GradeOrder).ThenByDescending(job => job.TotalScore).ThenBy(job => job.Id, StringComparer.Ordinal);
                var rng = new Random(seed);
                IEnumerable<ScoredJob> selected = seed == 0 ? sorted : sorted.GroupBy(job => job.GradeOrder).SelectMany(group => group.OrderBy(_ => rng.Next()));
                return Content(BuildMatchResponseJson(selected.Take(effectiveLimit).Select(job => job.Json).ToList(), entry.Jobs.Count,
                    effectiveLimit, entry.FetchComplete, entry.TotalAfJobs, context.Source, profile, context.Roles), "application/json");
            }
            finally { entry.Gate.Release(); }
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Could not fetch matched jobs");
            return StatusCode(502, new { error = "Could not fetch matched jobs" });
        }
    }

    [HttpPost("match/continue")]
    public async Task<IActionResult> MatchContinue([FromBody] MatchProfileRequest? profile)
    {
        if (profile is null || CreateMatchContext(profile) is not { } context) return BadRequest(new { error = "Invalid match profile" });
        if (!_cache.TryGetValue(context.CacheKey, out MatchCacheEntry? entry) || entry is null)
            return Ok(new { fetchComplete = true, totalCached = 0, addedCount = 0, totalAfJobs = 0, cacheExpired = true });
        await entry.Gate.WaitAsync(HttpContext.RequestAborted);
        try
        {
            var before = entry.Jobs.Count;
            if (!entry.FetchComplete) await FetchMatchPage(entry, entry.Searches.First(search => !search.Complete), context);
            return Ok(new { fetchComplete = entry.FetchComplete, totalCached = entry.Jobs.Count, addedCount = entry.Jobs.Count - before, totalAfJobs = entry.TotalAfJobs });
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Could not continue matched job search");
            return StatusCode(502, new { error = "Could not fetch more jobs" });
        }
        finally { entry.Gate.Release(); }
    }

    private async Task FetchMatchPage(MatchCacheEntry entry, MatchSearch search, MatchContext context)
    {
        var term = string.IsNullOrEmpty(search.SearchTerm) ? search.Role : search.SearchTerm;
        var raw = await FetchAfSearchPageRawAsync(term, search.NextOffset, MATCH_UPSTREAM_FETCH_LIMIT);
        // Try the spaced form of a compound role only if the initial query is empty.
        if (search.NextOffset == 0 && string.IsNullOrEmpty(search.SearchTerm))
        {
            using var first = JsonDocument.Parse(raw);
            if (first.RootElement.ValueKind == JsonValueKind.Object && first.RootElement.TryGetProperty("hits", out var firstHits) && firstHits.ValueKind == JsonValueKind.Array && firstHits.GetArrayLength() == 0)
            {
                var expanded = ExpandCompactRoleForSearch(term);
                if (expanded != term) { term = expanded; raw = await FetchAfSearchPageRawAsync(term, 0, MATCH_UPSTREAM_FETCH_LIMIT); }
            }
        }
        using var document = JsonDocument.Parse(raw);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("hits", out var hits) || hits.ValueKind != JsonValueKind.Array ||
            !root.TryGetProperty("total", out var total) || total.ValueKind != JsonValueKind.Object ||
            !total.TryGetProperty("value", out var totalValue) || !totalValue.TryGetInt32(out var count) || count < 0)
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
        entry.Jobs.AddRange(additions);
        search.SearchTerm = term;
        search.Total = count;
        search.NextOffset += hits.GetArrayLength();
        search.Complete = hits.GetArrayLength() == 0 || search.NextOffset >= count;
    }
    protected virtual async Task<string> FetchAfSearchPageRawAsync(string searchTerm, int offset, int limit)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        qs["q"] = searchTerm; qs["limit"] = limit.ToString(); qs["offset"] = offset.ToString();
        using var response = await _http.GetAsync($"{AF_BASE}/{AF_SEARCH_PATH}?{qs}", HttpContext.RequestAborted);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);
    }
    private static string ExpandCompactRoleForSearch(string role)
    {
        var trimmed = role.Trim();
        if (trimmed.Any(c => char.IsWhiteSpace(c) || c is '-' or '/' or '_')) return trimmed;
        foreach (var suffix in _compactRoleSearchSuffixes)
            if (trimmed.Length > suffix.Length + 2 && trimmed.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                return trimmed[..^suffix.Length] + " " + suffix;
        return trimmed;
    }
    private static string ReadString(JsonElement value, string property) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var text) && text.ValueKind == JsonValueKind.String
            ? text.GetString() ?? "" : "";

    private static (bool matched, string matchedOn, string matchedValue) CheckRoleInclusion(JsonElement job, IReadOnlyList<string> roles)
    {
        var fields = new List<(string Name, string Text)> { ("headline", ReadString(job, "headline")) };
        foreach (var name in new[] { "occupation", "occupation_group" })
            if (job.TryGetProperty(name, out var value)) fields.Add(($"{name}.label", ReadString(value, "label")));
        foreach (var field in fields)
        {
            var text = string.Join(" ", field.Text.Split(' ').Select(ExpandCompactRoleForSearch));
            if (roles.Any(role => RoleTokensMatchText(role, text)))
                return (true, field.Name, field.Text[..Math.Min(field.Text.Length, 120)]);
        }
        return (false, "", "");
    }
    private static bool RoleTokensMatchText(string normalizedRole, string normalizedText)
    {
        var expanded = ExpandCompactRoleForSearch(normalizedRole);
        var tokens = System.Text.RegularExpressions.Regex.Split(expanded, @"[\s/\-]+")
            .Where(token => token.Length > 0).ToArray();
        return tokens.Length > 0 && tokens.All(token => ContainsTerm(normalizedText, token) ||
            (_roleSynonyms.TryGetValue(token, out var synonym) && ContainsTerm(normalizedText, synonym)));
    }
    private static bool ContainsTerm(string text, string term) =>
        System.Text.RegularExpressions.Regex.IsMatch(text,
            @"(?<![\p{L}\p{N}_+#])" + System.Text.RegularExpressions.Regex.Escape(term) + @"(?![\p{L}\p{N}_+#])",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant,
            TimeSpan.FromMilliseconds(100));
    private static HashSet<string> NormalizeLocationPreferences(IEnumerable<string> prefs) { var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase); foreach (var pref in prefs) { if (string.IsNullOrWhiteSpace(pref)) continue; var norm = pref.Trim().ToLowerInvariant().Replace(" ", "").Replace("-", ""); var token = norm switch { "onlymylocation" => "onlymylocation", "nearbylocation" => "nearbylocation", "region" => "region", "country" => "country", "remote" => "remote", "onlymylocation2" or "onlymy location" => "onlymylocation", "nearbylocation2" => "nearbylocation", "endastremote" => "remote", "endastminplats" => "onlymylocation", "näraminstays" or "naraminstays" or "naramingplats" or "närmingplats" => "nearbylocation", "land" => "country", _ => norm }; result.Add(token); } return result; }
    private static (int score, string tier) ScoreLocation(JsonElement job, HashSet<string> municipalities,
        HashSet<string> regions, HashSet<string> preferences)
    {
        var remote = job.TryGetProperty("remote", out var remoteValue) && remoteValue.ValueKind == JsonValueKind.True;
        var wantsRemote = preferences.Contains("remote");
        if (remote && wantsRemote) return (LOCATION_SCORE_REMOTE, "remote");
        if (preferences.Count == 0) return (LOCATION_SCORE_NO_PREFERENCE, "no_preference");
        var local = preferences.Contains("onlymylocation");
        var nearby = preferences.Contains("nearbylocation") || preferences.Contains("region");
        var country = preferences.Contains("country");
        if (wantsRemote && !local && !nearby && !country) return (0, "out_of_region");
        job.TryGetProperty("workplace_address", out var address);
        var municipality = NormalizeLocation(ReadString(address, "municipality"));
        var region = ReadString(address, "region");
        var regionCode = ReadString(address, "region_code");
        if (_regionCodes.TryGetValue(region, out var mapped)) regionCode = mapped;
        else if (regions.Contains(region)) regionCode = region;
        if (regionCode.Length == 0 && _municipalityToRegion.TryGetValue(municipality, out var regionName) &&
            _regionCodes.TryGetValue(regionName, out mapped)) regionCode = mapped;
        if (municipalities.Contains(municipality)) return (LOCATION_SCORE_SAME_MUNICIPALITY, "same_municipality");
        if (country)
        {
            var jobCountry = ReadString(address, "country");
            if (jobCountry.Length > 0 && !new[] { "Sverige", "Sweden", "SE" }.Contains(jobCountry, StringComparer.OrdinalIgnoreCase))
                return (0, "out_of_region");
            return (LOCATION_SCORE_NO_PREFERENCE, "country");
        }
        if (municipalities.Count == 0 && regions.Count == 0) return (LOCATION_SCORE_NO_PREFERENCE, "no_preference");
        if (regions.Contains(regionCode))
            return nearby ? (LOCATION_SCORE_NO_PREFERENCE, "same_region_nearby") : (0, "same_region_strict");
        return (0, "out_of_region");
    }
    private static (int boost, string[] matchedTerms) ScoreTechBoost(JsonElement job, IReadOnlyList<string> normalizedUserTags)
    {
        var headline = job.TryGetProperty("headline", out var hl) && hl.ValueKind == JsonValueKind.String ? hl.GetString() : "";
        var description = job.TryGetProperty("description", out var desc) && desc.ValueKind == JsonValueKind.Object &&
            desc.TryGetProperty("text", out var dt) && dt.ValueKind == JsonValueKind.String ? dt.GetString() ?? "" : "";
        var text = $"{headline} {description[..Math.Min(description.Length, 30000)]}";
        var matched = normalizedUserTags.Where(tag => ContainsTerm(text, tag) ||
            _techNormMap.Any(alias => alias.Value.Equals(tag, StringComparison.OrdinalIgnoreCase) && ContainsTerm(text, alias.Key)))
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        return (matched.Length > 0 ? TECH_BOOST_MATCH : 0, matched);
    }
    private static string AssignGrade(int totalScore) => totalScore switch { >= GRADE_A_MIN_SCORE => "A", >= GRADE_B_SCORE => "B", _ => "C" };
    private static string NormalizeRoleInput(string input) => input.Trim().ToLowerInvariant();
    private static string NormalizeTech(string token) { var lower = token.Trim().ToLowerInvariant(); return _techNormMap.TryGetValue(lower, out var mapped) ? mapped : lower; }
    private static string BuildJobResultJson(string rawJobJson, string grade, int locationScore, string locationTier, int techBoost, string[] matchedTechTerms, int totalScore, string roleMatchedOn, string roleMatchedValue, List<string> reasons)
    {
        using var memStream = new System.IO.MemoryStream(); using var writer = new Utf8JsonWriter(memStream); writer.WriteStartObject(); using (var jobDoc = JsonDocument.Parse(rawJobJson)) { foreach (var prop in jobDoc.RootElement.EnumerateObject()) { if (prop.Name == "description") continue; prop.WriteTo(writer); } } writer.WriteString("matchGrade", grade); writer.WritePropertyName("matchDebug"); writer.WriteStartObject(); writer.WriteNumber("locationScore", locationScore); writer.WriteString("locationTier", locationTier); writer.WriteNumber("techBoost", techBoost); writer.WritePropertyName("matchedTechTerms"); writer.WriteStartArray(); foreach (var t in matchedTechTerms) writer.WriteStringValue(t); writer.WriteEndArray(); writer.WriteNumber("totalScore", totalScore); writer.WriteString("scoreBreakdown", $"location({locationScore}) + tech({techBoost}) = {totalScore}"); writer.WriteString("roleMatchedOn", roleMatchedOn); writer.WriteString("roleMatchedValue", roleMatchedValue); writer.WritePropertyName("reasons"); writer.WriteStartArray(); foreach (var r in reasons) writer.WriteStringValue(r); writer.WriteEndArray(); writer.WriteEndObject(); writer.WriteEndObject(); writer.Flush(); return System.Text.Encoding.UTF8.GetString(memStream.ToArray());
    }
    private static void WriteThresholds(Utf8JsonWriter writer) { writer.WritePropertyName("thresholds"); writer.WriteStartObject(); writer.WriteString("A", $"totalScore >= {GRADE_A_MIN_SCORE}"); writer.WriteString("B", $"totalScore >= {GRADE_B_SCORE} and < {GRADE_A_MIN_SCORE}"); writer.WriteString("C", $"totalScore <= {GRADE_B_SCORE - 1}"); writer.WritePropertyName("scoringKey"); writer.WriteStartObject(); writer.WriteNumber("same_municipality", LOCATION_SCORE_SAME_MUNICIPALITY); writer.WriteNumber("same_region", LOCATION_SCORE_SAME_REGION); writer.WriteNumber("remote", LOCATION_SCORE_REMOTE); writer.WriteNumber("out_of_region", LOCATION_SCORE_OUT_OF_REGION); writer.WriteNumber("no_preference", LOCATION_SCORE_NO_PREFERENCE); writer.WriteString("tech_boost", $"+{TECH_BOOST_MATCH} when any profile tag appears in job headline or description (first 30000 chars)"); writer.WriteEndObject(); writer.WriteEndObject(); }
    private static string BuildMatchResponseJson(List<string> jobJsons, int totalMatched, int limitApplied, bool fetchComplete, int totalAfJobs, string desiredRolesSource, MatchProfileRequest profile, IReadOnlyList<string> activeRoles)
    { using var memStream = new System.IO.MemoryStream(); using var writer = new Utf8JsonWriter(memStream); writer.WriteStartObject(); writer.WritePropertyName("matched"); writer.WriteStartArray(); foreach (var j in jobJsons) { using var jd = JsonDocument.Parse(j); jd.RootElement.WriteTo(writer); } writer.WriteEndArray(); writer.WritePropertyName("stats"); writer.WriteStartObject(); writer.WriteNumber("returned", jobJsons.Count); writer.WriteNumber("totalMatched", totalMatched); writer.WriteNumber("limit", limitApplied); writer.WriteBoolean("fetchComplete", fetchComplete); writer.WriteNumber("totalAfJobs", totalAfJobs); writer.WriteEndObject(); WriteThresholds(writer); writer.WritePropertyName("profileUsed"); writer.WriteStartObject(); writer.WritePropertyName("roles"); writer.WriteStartArray(); foreach (var r in activeRoles) writer.WriteStringValue(r); writer.WriteEndArray(); writer.WriteString("title", profile.Title); writer.WritePropertyName("tags"); writer.WriteStartArray(); foreach (var t in profile.Tags ?? Array.Empty<string>()) writer.WriteStringValue(t); writer.WriteEndArray(); writer.WriteString("location", profile.Location); writer.WritePropertyName("locationPreferences"); writer.WriteStartArray(); foreach (var lp in profile.LocationPreferences ?? Array.Empty<string>()) writer.WriteStringValue(lp); writer.WriteEndArray(); writer.WriteString("desiredRolesSource", desiredRolesSource); writer.WriteEndObject(); writer.WriteEndObject(); writer.Flush(); return System.Text.Encoding.UTF8.GetString(memStream.ToArray()); }

}

public class MatchProfileRequest
{
    public string[]? Roles { get; set; }
    public string? Title { get; set; }
    public string[]? Tags { get; set; }
    public string? Location { get; set; }
    public string[]? LocationPreferences { get; set; }
}
