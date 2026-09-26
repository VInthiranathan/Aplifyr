using System.Text.Json;
using static Aplifyr.Api.Jobs.JobSearchCatalog;

namespace Aplifyr.Api.Jobs;

public static class JobMatchingRules
{
    private static string NormalizeLocation(string? value) => (value ?? string.Empty).Trim().ToLowerInvariant();
    internal static string ExpandCompactRoleForSearch(string role)
    {
        var trimmed = role.Trim();
        if (trimmed.Any(c => char.IsWhiteSpace(c) || c is '-' or '/' or '_')) return trimmed;
        foreach (var suffix in _compactRoleSearchSuffixes)
            if (trimmed.Length > suffix.Length + 2 && trimmed.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                return trimmed[..^suffix.Length] + " " + suffix;
        return trimmed;
    }
    internal static string ReadString(JsonElement value, string property) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var text) && text.ValueKind == JsonValueKind.String
            ? text.GetString() ?? "" : "";

    internal static (bool matched, string matchedOn, string matchedValue) CheckRoleInclusion(JsonElement job, IReadOnlyList<string> roles)
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
    internal static bool RoleTokensMatchText(string normalizedRole, string normalizedText)
    {
        var expanded = ExpandCompactRoleForSearch(normalizedRole);
        var tokens = System.Text.RegularExpressions.Regex.Split(expanded, @"[\s/\-]+")
            .Where(token => token.Length > 0).ToArray();
        return tokens.Length > 0 && tokens.All(token => ContainsTerm(normalizedText, token) ||
            (_roleSynonyms.TryGetValue(token, out var synonym) && ContainsTerm(normalizedText, synonym)));
    }
    internal static bool ContainsTerm(string text, string term) =>
        System.Text.RegularExpressions.Regex.IsMatch(text,
            @"(?<![\p{L}\p{N}_+#])" + System.Text.RegularExpressions.Regex.Escape(term) + @"(?![\p{L}\p{N}_+#])",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant,
            TimeSpan.FromMilliseconds(100));
    internal static HashSet<string> NormalizeLocationPreferences(IEnumerable<string> prefs) { var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase); foreach (var pref in prefs) { if (string.IsNullOrWhiteSpace(pref)) continue; var norm = pref.Trim().ToLowerInvariant().Replace(" ", "").Replace("-", ""); var token = norm switch { "onlymylocation" => "onlymylocation", "nearbylocation" => "nearbylocation", "region" => "region", "country" => "country", "remote" => "remote", "onlymylocation2" or "onlymy location" => "onlymylocation", "nearbylocation2" => "nearbylocation", "endastremote" => "remote", "endastminplats" => "onlymylocation", "näraminstays" or "naraminstays" or "naramingplats" or "närmingplats" => "nearbylocation", "land" => "country", _ => norm }; result.Add(token); } return result; }
    internal static (int score, string tier) ScoreLocation(JsonElement job, HashSet<string> municipalities,
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
    // Shared explicit-skill matching for CV relevance; retains original profile labels.
    public static string[] CvMatchedSkills(JsonElement job, IReadOnlyList<string> skills)
    {
        var matched = ScoreTechBoost(job, skills.Select(NormalizeTech).ToArray()).matchedTerms;
        return skills.Where(skill => matched.Contains(NormalizeTech(skill))).ToArray();
    }

    internal static (int boost, string[] matchedTerms) ScoreTechBoost(JsonElement job, IReadOnlyList<string> normalizedUserTags)
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
    internal static string AssignGrade(int totalScore) => totalScore switch { >= GRADE_A_MIN_SCORE => "A", >= GRADE_B_SCORE => "B", _ => "C" };
    internal static string NormalizeRoleInput(string input) => input.Trim().ToLowerInvariant();
    internal static string NormalizeTech(string token) { var lower = token.Trim().ToLowerInvariant(); return _techNormMap.TryGetValue(lower, out var mapped) ? mapped : lower; }
    internal static string BuildJobResultJson(string rawJobJson, string grade, int locationScore, string locationTier, int techBoost, string[] matchedTechTerms, int totalScore, string roleMatchedOn, string roleMatchedValue, List<string> reasons)
    {
        using var memStream = new System.IO.MemoryStream(); using var writer = new Utf8JsonWriter(memStream); writer.WriteStartObject(); using (var jobDoc = JsonDocument.Parse(rawJobJson)) { foreach (var prop in jobDoc.RootElement.EnumerateObject()) { if (prop.Name == "description") continue; prop.WriteTo(writer); } } writer.WriteString("matchGrade", grade); writer.WritePropertyName("matchDebug"); writer.WriteStartObject(); writer.WriteNumber("locationScore", locationScore); writer.WriteString("locationTier", locationTier); writer.WriteNumber("techBoost", techBoost); writer.WritePropertyName("matchedTechTerms"); writer.WriteStartArray(); foreach (var t in matchedTechTerms) writer.WriteStringValue(t); writer.WriteEndArray(); writer.WriteNumber("totalScore", totalScore); writer.WriteString("scoreBreakdown", $"location({locationScore}) + tech({techBoost}) = {totalScore}"); writer.WriteString("roleMatchedOn", roleMatchedOn); writer.WriteString("roleMatchedValue", roleMatchedValue); writer.WritePropertyName("reasons"); writer.WriteStartArray(); foreach (var r in reasons) writer.WriteStringValue(r); writer.WriteEndArray(); writer.WriteEndObject(); writer.WriteEndObject(); writer.Flush(); return System.Text.Encoding.UTF8.GetString(memStream.ToArray());
    }
    internal static void WriteThresholds(Utf8JsonWriter writer) { writer.WritePropertyName("thresholds"); writer.WriteStartObject(); writer.WriteString("A", $"totalScore >= {GRADE_A_MIN_SCORE}"); writer.WriteString("B", $"totalScore >= {GRADE_B_SCORE} and < {GRADE_A_MIN_SCORE}"); writer.WriteString("C", $"totalScore <= {GRADE_B_SCORE - 1}"); writer.WritePropertyName("scoringKey"); writer.WriteStartObject(); writer.WriteNumber("same_municipality", LOCATION_SCORE_SAME_MUNICIPALITY); writer.WriteNumber("same_region", LOCATION_SCORE_SAME_REGION); writer.WriteNumber("remote", LOCATION_SCORE_REMOTE); writer.WriteNumber("out_of_region", LOCATION_SCORE_OUT_OF_REGION); writer.WriteNumber("no_preference", LOCATION_SCORE_NO_PREFERENCE); writer.WriteString("tech_boost", $"+{TECH_BOOST_MATCH} when any profile tag appears in job headline or description (first 30000 chars)"); writer.WriteEndObject(); writer.WriteEndObject(); }
    internal static string BuildMatchResponseJson(List<string> jobJsons, int totalMatched, int limitApplied, bool fetchComplete, int totalAfJobs, string desiredRolesSource, MatchProfileRequest profile, IReadOnlyList<string> activeRoles)
    { using var memStream = new System.IO.MemoryStream(); using var writer = new Utf8JsonWriter(memStream); writer.WriteStartObject(); writer.WritePropertyName("matched"); writer.WriteStartArray(); foreach (var j in jobJsons) { using var jd = JsonDocument.Parse(j); jd.RootElement.WriteTo(writer); } writer.WriteEndArray(); writer.WritePropertyName("stats"); writer.WriteStartObject(); writer.WriteNumber("returned", jobJsons.Count); writer.WriteNumber("totalMatched", totalMatched); writer.WriteNumber("limit", limitApplied); writer.WriteBoolean("fetchComplete", fetchComplete); writer.WriteNumber("totalAfJobs", totalAfJobs); writer.WriteEndObject(); WriteThresholds(writer); writer.WritePropertyName("profileUsed"); writer.WriteStartObject(); writer.WritePropertyName("roles"); writer.WriteStartArray(); foreach (var r in activeRoles) writer.WriteStringValue(r); writer.WriteEndArray(); writer.WriteString("title", profile.Title); writer.WritePropertyName("tags"); writer.WriteStartArray(); foreach (var t in profile.Tags ?? Array.Empty<string>()) writer.WriteStringValue(t); writer.WriteEndArray(); writer.WriteString("location", profile.Location); writer.WritePropertyName("locationPreferences"); writer.WriteStartArray(); foreach (var lp in profile.LocationPreferences ?? Array.Empty<string>()) writer.WriteStringValue(lp); writer.WriteEndArray(); writer.WriteString("desiredRolesSource", desiredRolesSource); writer.WriteEndObject(); writer.WriteEndObject(); writer.Flush(); return System.Text.Encoding.UTF8.GetString(memStream.ToArray()); }

}
