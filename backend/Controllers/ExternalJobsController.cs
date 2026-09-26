using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using System.Net;
using Aplifyr.Api.Jobs;
using static Aplifyr.Api.Jobs.JobSearchCatalog;
using System.Text.Json;

namespace Aplifyr.Api.Controllers;

[Microsoft.AspNetCore.Authorization.AllowAnonymous]
[Microsoft.AspNetCore.Http.Timeouts.RequestTimeout("job-search")]
[ApiController]
[Route("api/[controller]")]
public partial class ExternalJobsController : ControllerBase
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(20), MaxResponseContentBufferSize = 4 * 1024 * 1024 };
    private readonly JobMatchingService _matching;
    private readonly ILogger<ExternalJobsController> _logger;

    public ExternalJobsController(JobMatchingService matching, ILogger<ExternalJobsController> logger)
    {
        _matching = matching;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string[]? municipality,
        [FromQuery] string[]? region,
        [FromQuery] string[]? occupation,
        [FromQuery] bool? remote,
        [FromQuery] string? workingHoursType,
        [FromQuery] string? employmentType,
        [FromQuery] int limit = 20,
        [FromQuery] int offset = 0)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        if (!string.IsNullOrWhiteSpace(q)) qs["q"] = q;
        var municipalityFilters = municipality?.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray() ?? Array.Empty<string>();
        var resolvedRegionCodes = new List<string>();
        if (region != null && region.Length > 0)
        {
            foreach (var r in region)
            {
                var rTrim = (r ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(rTrim)) continue;
                if (rTrim.All(char.IsDigit)) { qs.Add("region", rTrim); resolvedRegionCodes.Add(rTrim); continue; }
                if (_regionCodes.TryGetValue(rTrim, out var exactCode)) { qs.Add("region", exactCode); resolvedRegionCodes.Add(exactCode); continue; }
                var lower = rTrim.ToLowerInvariant();
                var fuzzyMatch = _regionCodes.Keys.FirstOrDefault(k => k.Contains(lower, StringComparison.OrdinalIgnoreCase) || lower.Contains(k, StringComparison.OrdinalIgnoreCase));
                var resolvedCode = fuzzyMatch != null ? _regionCodes[fuzzyMatch] : rTrim;
                qs.Add("region", resolvedCode);
                if (resolvedCode.All(char.IsDigit)) resolvedRegionCodes.Add(resolvedCode);
            }
        }
        if (municipalityFilters.Length > 0)
        {
            try
            {
                var mappedMunicipalities = await ResolveMunicipalityFiltersAsync(municipalityFilters, resolvedRegionCodes);
                if (mappedMunicipalities.Length == 0 && municipalityFilters.Any(filter => !filter.All(char.IsDigit))) return Content(JsonSerializer.Serialize(new { total = new { value = 0 }, hits = Array.Empty<object>() }), "application/json");
                foreach (var mappedMunicipality in mappedMunicipalities) qs.Add("municipality", mappedMunicipality);
                qs.Remove("region");
            }
            catch (Exception) { return StatusCode(502, new { error = "Could not resolve search filters" }); }
        }
        if (remote.HasValue) qs["remote"] = remote.Value.ToString().ToLower();
        if (!string.IsNullOrWhiteSpace(workingHoursType)) qs["working_hours_type"] = workingHoursType;
        ApplyEmploymentTypeFilter(qs, employmentType);
        ApplyOccupationFilters(qs, occupation);
        qs["limit"] = Math.Clamp(limit, 1, 100).ToString();
        qs["offset"] = Math.Clamp(offset, 0, 2000).ToString();
        var url = $"{AF_BASE}/{AF_SEARCH_PATH}?{qs}";
        try { using var response = await _http.GetAsync(url, HttpContext.RequestAborted); response.EnsureSuccessStatusCode(); var content = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted); return Content(content, "application/json"); }
        catch (Exception) { return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API" }); }
    }

    [HttpGet("occupations")]
    public async Task<IActionResult> GetOccupationOptions([FromQuery] string? q, [FromQuery] string[]? municipality, [FromQuery] string[]? region, [FromQuery] bool? remote, [FromQuery] string? employmentType)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        if (!string.IsNullOrWhiteSpace(q)) qs["q"] = q;
        var municipalityFilters = municipality?.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray() ?? Array.Empty<string>();
        var resolvedRegionCodes = new List<string>();
        if (region != null && region.Length > 0) foreach (var regionCode in ResolveRegionCodes(region)) { qs.Add("region", regionCode); resolvedRegionCodes.Add(regionCode); }
        if (municipalityFilters.Length > 0)
        {
            try
            {
                var mappedMunicipalities = await ResolveMunicipalityFiltersAsync(municipalityFilters, resolvedRegionCodes);
                if (mappedMunicipalities.Length == 0 && municipalityFilters.Any(filter => !filter.All(char.IsDigit))) return Ok(Array.Empty<object>());
                foreach (var mappedMunicipality in mappedMunicipalities) qs.Add("municipality", mappedMunicipality);
                qs.Remove("region");
            }
            catch (Exception) { return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API" }); }
        }
        if (remote.HasValue) qs["remote"] = remote.Value.ToString().ToLower();
        ApplyEmploymentTypeFilter(qs, employmentType);
        qs["limit"] = "0"; qs["offset"] = "0"; qs["stats"] = "occupation-name"; qs["stats.limit"] = AF_STATS_LIMIT.ToString();
        var url = $"{AF_BASE}/{AF_SEARCH_PATH}?{qs}";
        try
        {
            var response = await _http.GetAsync(url); var content = await response.Content.ReadAsStringAsync(); response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(content);
            var values = document.RootElement.GetProperty("stats").EnumerateArray().FirstOrDefault(stat => string.Equals(stat.GetProperty("type").GetString(), "occupation-name", StringComparison.OrdinalIgnoreCase)).GetProperty("values").EnumerateArray().Select(value => new { code = value.TryGetProperty("code", out var codeElement) ? codeElement.GetString() : null, label = value.TryGetProperty("term", out var termElement) ? termElement.GetString() : null, count = value.TryGetProperty("count", out var countElement) && countElement.TryGetInt32(out var count) ? count : 0 }).Where(value => !string.IsNullOrWhiteSpace(value.code) && !string.IsNullOrWhiteSpace(value.label)).GroupBy(value => value.label!, StringComparer.OrdinalIgnoreCase).Select(group => new { label = group.First().label, codes = group.Select(value => value.code!).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(), count = group.Sum(value => value.count) }).OrderByDescending(value => value.count).ThenBy(value => value.label).ToArray();
            return Ok(values);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Occupation municipality resolution failed for filters {Filters} with regions {Regions}", municipalityFilters, resolvedRegionCodes); return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API" }); }
    }

    private static void ApplyEmploymentTypeFilter(System.Collections.Specialized.NameValueCollection qs, string? employmentType)
    {
        if (string.IsNullOrWhiteSpace(employmentType)) return;
        var rawValue = employmentType.Trim(); var code = _employmentTypeCodes.TryGetValue(rawValue, out var mappedCode) ? mappedCode : rawValue; qs.Add("employment-type", code);
    }
    private static void ApplyOccupationFilters(System.Collections.Specialized.NameValueCollection qs, string[]? occupation)
    {
        if (occupation == null || occupation.Length == 0) return;
        foreach (var value in occupation.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value.Trim()).Distinct(StringComparer.OrdinalIgnoreCase)) qs.Add("occupation-name", value);
    }
    private static IEnumerable<string> ResolveRegionCodes(IEnumerable<string> regions)
    {
        foreach (var region in regions)
        {
            var rTrim = (region ?? string.Empty).Trim(); if (string.IsNullOrEmpty(rTrim)) continue;
            if (rTrim.All(char.IsDigit)) { yield return rTrim; continue; }
            if (_regionCodes.TryGetValue(rTrim, out var exactCode)) { yield return exactCode; continue; }
            var lower = rTrim.ToLowerInvariant(); var fuzzyMatch = _regionCodes.Keys.FirstOrDefault(k => k.Contains(lower, StringComparison.OrdinalIgnoreCase) || lower.Contains(k, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(fuzzyMatch)) yield return _regionCodes[fuzzyMatch];
        }
    }
    private static async Task<string[]> ResolveMunicipalityFiltersAsync(IReadOnlyCollection<string> municipalityFilters, IReadOnlyCollection<string> resolvedRegionCodes)
    {
        var resolved = new List<string>(); JsonDocument? statsDocument = null;
        if (municipalityFilters.Any(filter => !filter.All(char.IsDigit)))
        {
            var statsQuery = System.Web.HttpUtility.ParseQueryString(string.Empty);
            foreach (var regionCode in resolvedRegionCodes.Where(code => !string.IsNullOrWhiteSpace(code))) statsQuery.Add("region", regionCode);
            statsQuery["limit"] = "0"; statsQuery["stats"] = "municipality"; statsQuery["stats.limit"] = "30";
            var statsResponse = await _http.GetAsync($"{AF_BASE}/{AF_SEARCH_PATH}?{statsQuery}"); var statsContent = await statsResponse.Content.ReadAsStringAsync(); statsResponse.EnsureSuccessStatusCode(); statsDocument = JsonDocument.Parse(statsContent);
        }
        try { foreach (var municipalityFilter in municipalityFilters) { if (municipalityFilter.All(char.IsDigit)) { resolved.Add(municipalityFilter); continue; } var code = FindMunicipalityCode(statsDocument, municipalityFilter); if (!string.IsNullOrWhiteSpace(code)) resolved.Add(code); } return resolved.Distinct(StringComparer.OrdinalIgnoreCase).ToArray(); }
        finally { statsDocument?.Dispose(); }
    }
    private static string? FindMunicipalityCode(JsonDocument? statsDocument, string municipalityFilter)
    {
        if (statsDocument == null || !statsDocument.RootElement.TryGetProperty("stats", out var statsElement) || statsElement.ValueKind != JsonValueKind.Array) return null;
        var normalizedFilter = NormalizeLocation(municipalityFilter);
        foreach (var stat in statsElement.EnumerateArray())
        {
            if (!stat.TryGetProperty("type", out var typeElement) || !string.Equals(typeElement.GetString(), "municipality", StringComparison.OrdinalIgnoreCase) || !stat.TryGetProperty("values", out var valuesElement) || valuesElement.ValueKind != JsonValueKind.Array) continue;
            foreach (var value in valuesElement.EnumerateArray()) { var term = value.TryGetProperty("term", out var termElement) ? termElement.GetString() : null; var code = value.TryGetProperty("code", out var codeElement) ? codeElement.GetString() : null; if (string.IsNullOrWhiteSpace(term) || string.IsNullOrWhiteSpace(code)) continue; var normalizedTerm = NormalizeLocation(term); if (normalizedTerm == normalizedFilter || normalizedTerm.Contains(normalizedFilter, StringComparison.OrdinalIgnoreCase) || normalizedFilter.Contains(normalizedTerm, StringComparison.OrdinalIgnoreCase)) return code; }
        }
        return null;
    }
    private static string NormalizeLocation(string? value) => (value ?? string.Empty).Trim().ToLowerInvariant();

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return BadRequest(new { error = "id required" });
        var directUrl = $"{AF_BASE}/{System.Web.HttpUtility.UrlEncode(id)}";
        try
        {
            _logger.LogInformation("ExternalJobsController.GetById: fetching direct {DirectUrl}", directUrl);
            var adUrl = $"{AF_BASE}/{AF_AD_PATH}/{System.Web.HttpUtility.UrlEncode(id)}"; _logger.LogInformation("ExternalJobsController.GetById: trying ad endpoint {AdUrl}", adUrl);
            var response = await _http.GetAsync(adUrl); var content = await response.Content.ReadAsStringAsync(); _logger.LogInformation("ExternalJobsController.GetById: direct status={StatusCode}", response.StatusCode);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                var qs = System.Web.HttpUtility.ParseQueryString(string.Empty); qs["q"] = id; qs["limit"] = "1"; var searchUrl = $"{AF_BASE}?{qs}"; using var searchRes = await _http.GetAsync(searchUrl, HttpContext.RequestAborted); searchRes.EnsureSuccessStatusCode(); var searchContent = await searchRes.Content.ReadAsStringAsync();
                try { using var sdoc = JsonDocument.Parse(searchContent); if (sdoc.RootElement.TryGetProperty("hits", out var hits) && hits.GetArrayLength() > 0) return Content(searchContent, "application/json"); } catch (JsonException ex) { _logger.LogDebug(ex, "ExternalJobsController.GetById: could not parse fallback search response for {Id}", id); }
                try { var publicUrl = $"https://arbetsformedlingen.se/platsbanken/annonser/{System.Web.HttpUtility.UrlEncode(id)}"; var req = new HttpRequestMessage(HttpMethod.Get, publicUrl); req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"); req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"); using var publicRes = await _http.SendAsync(req, HttpContext.RequestAborted); publicRes.EnsureSuccessStatusCode(); var publicHtml = await publicRes.Content.ReadAsStringAsync(); var json = JsonSerializer.Serialize(new { html = publicHtml }); return Content(json, "application/json"); } catch (Exception exPublic) { _logger.LogWarning(exPublic, "ExternalJobsController.GetById: public fetch failed for {Id}", id); }
                return Content(searchContent, "application/json");
            }
            try
            {
                using var doc = JsonDocument.Parse(content);
                if (doc.RootElement.TryGetProperty("cause", out var cause) && cause.ValueKind == JsonValueKind.Object && cause.TryGetProperty("code", out var codeEl) && codeEl.GetString() == "404")
                {
                    var qs = System.Web.HttpUtility.ParseQueryString(string.Empty); qs["q"] = id; qs["limit"] = "1"; var searchUrl = $"{AF_BASE}/{AF_SEARCH_PATH}?{qs}"; using var searchRes = await _http.GetAsync(searchUrl, HttpContext.RequestAborted); searchRes.EnsureSuccessStatusCode(); var searchContent = await searchRes.Content.ReadAsStringAsync();
                    try { using var sdoc = JsonDocument.Parse(searchContent); if (sdoc.RootElement.TryGetProperty("hits", out var hits) && hits.GetArrayLength() > 0) return Content(searchContent, "application/json"); } catch (JsonException ex) { _logger.LogDebug(ex, "ExternalJobsController.GetById: could not parse search response for {Id}", id); }
                    try { var publicUrl = $"https://arbetsformedlingen.se/platsbanken/annonser/{System.Web.HttpUtility.UrlEncode(id)}"; var req = new HttpRequestMessage(HttpMethod.Get, publicUrl); req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"); req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"); using var publicRes = await _http.SendAsync(req, HttpContext.RequestAborted); publicRes.EnsureSuccessStatusCode(); var publicHtml = await publicRes.Content.ReadAsStringAsync(); var json = JsonSerializer.Serialize(new { html = publicHtml }); return Content(json, "application/json"); } catch (Exception exPublic) { _logger.LogWarning(exPublic, "ExternalJobsController.GetById: public fetch failed for {Id}", id); }
                    return Content(searchContent, "application/json");
                }
            }
            catch (JsonException ex) { _logger.LogDebug(ex, "ExternalJobsController.GetById: could not parse direct response for {Id}", id); }
            response.EnsureSuccessStatusCode();
            return Content(content, "application/json");
        }
        catch (Exception) { return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API" }); }
    }

}
