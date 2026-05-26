using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Text.Json;

namespace Examensarbete.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExternalJobsController : ControllerBase
{
    private static readonly HttpClient _http = new();
    private const string AF_BASE = "https://jobsearch.api.jobtechdev.se";
    private const string AF_SEARCH_PATH = "search";
    private const string AF_AD_PATH = "ad";
    private const int AF_STATS_LIMIT = 30;

    // Static mapping of Swedish region display names → 2-digit SCB/AF codes.
    // These codes are stable (they match SCB's Länskoder) and never require a
    // live stats-endpoint lookup. Both short names and "X län" variants are included.
    private static readonly Dictionary<string, string> _regionCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["stockholm"]               = "01",
        ["stockholms"]              = "01",
        ["stockholms län"]          = "01",
        ["stockholms lan"]          = "01",
        ["uppsala"]                 = "03",
        ["uppsala län"]             = "03",
        ["södermanland"]            = "04",
        ["södermanlands län"]       = "04",
        ["ostergotland"]            = "05",
        ["östergötland"]            = "05",
        ["östergötlands län"]       = "05",
        ["jönköping"]               = "06",
        ["jönköpings län"]          = "06",
        ["kronoberg"]               = "07",
        ["kronobergs län"]          = "07",
        ["kalmar"]                  = "08",
        ["kalmar län"]              = "08",
        ["gotland"]                 = "09",
        ["gotlands län"]            = "09",
        ["blekinge"]                = "10",
        ["blekinge län"]            = "10",
        ["skåne"]                   = "12",
        ["skane"]                   = "12",
        ["skåne län"]               = "12",
        ["halland"]                 = "13",
        ["hallands län"]            = "13",
        ["västra götaland"]         = "14",
        ["vastra gotaland"]         = "14",
        ["västra götalands län"]    = "14",
        ["värmland"]                = "17",
        ["värmlands län"]           = "17",
        ["örebro"]                  = "18",
        ["örebro län"]              = "18",
        ["vastmanland"]             = "19",
        ["västmanland"]             = "19",
        ["västmanlands län"]        = "19",
        ["dalarna"]                 = "20",
        ["dalarnas län"]            = "20",
        ["gävleborg"]               = "21",
        ["gävleborgs län"]          = "21",
        ["västernorrland"]          = "22",
        ["västernorrlands län"]     = "22",
        ["jämtland"]                = "23",
        ["jämtlands län"]           = "23",
        ["västerbotten"]            = "24",
        ["västerbottens län"]       = "24",
        ["norrbotten"]              = "25",
        ["norrbottens län"]         = "25",
    };

    private static readonly Dictionary<string, string> _employmentTypeCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["PFZr_Syz_cUq"] = "PFZr_Syz_cUq",
        ["kpPX_CNN_gDU"] = "kpPX_CNN_gDU",
        ["sTu5_NBQ_udq"] = "sTu5_NBQ_udq",
        ["1paU_aCR_nGn"] = "1paU_aCR_nGn",
        ["EBhX_Qm2_8eX"] = "EBhX_Qm2_8eX",
        ["gro4_cWF_6D7"] = "gro4_cWF_6D7",
        ["Jh8f_q9J_pbJ"] = "Jh8f_q9J_pbJ",
        ["Vanlig anställning"] = "PFZr_Syz_cUq",
        ["Tillsvidareanställning (inkl. eventuell provanställning)"] = "kpPX_CNN_gDU",
        ["Tidsbegränsad anställning"] = "sTu5_NBQ_udq",
        ["Behovsanställning"] = "1paU_aCR_nGn",
        ["Säsongsanställning"] = "EBhX_Qm2_8eX",
        ["Vikariat"] = "gro4_cWF_6D7",
        ["Sommarjobb / feriejobb"] = "Jh8f_q9J_pbJ",
        ["Tillsvidare"] = "kpPX_CNN_gDU",
        ["Projektanställning"] = "sTu5_NBQ_udq",
        ["Provanställning"] = "kpPX_CNN_gDU",
        ["Timanställning"] = "1paU_aCR_nGn",
    };

    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string[]? municipality,
        [FromQuery] string[]? region,
        [FromQuery] string[]? occupation,
        [FromQuery] bool? remote,
        [FromQuery] string? workingHoursType,  // "FULL_TIME" | "PART_TIME"
        [FromQuery] string? employmentType,    // forwarded to AF as employment_type
        [FromQuery] int limit = 20,
        [FromQuery] int offset = 0)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        if (!string.IsNullOrWhiteSpace(q))            qs["q"]             = q;
        var municipalityFilters = municipality?
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? Array.Empty<string>();
        var resolvedRegionCodes = new List<string>();

        // Resolve human-friendly region names → 2-digit AF/SCB codes using the
        // static dictionary. Accept multiple region query params.
        if (region != null && region.Length > 0)
        {
            foreach (var r in region)
            {
                var rTrim = (r ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(rTrim)) continue;
                if (rTrim.All(char.IsDigit))
                {
                    qs.Add("region", rTrim);
                    resolvedRegionCodes.Add(rTrim);
                    continue;
                }

                if (_regionCodes.TryGetValue(rTrim, out var exactCode))
                {
                    qs.Add("region", exactCode);
                    resolvedRegionCodes.Add(exactCode);
                    continue;
                }

                var lower = rTrim.ToLowerInvariant();
                var fuzzyMatch = _regionCodes.Keys.FirstOrDefault(k =>
                    k.Contains(lower, StringComparison.OrdinalIgnoreCase) ||
                    lower.Contains(k, StringComparison.OrdinalIgnoreCase));

                var resolvedCode = fuzzyMatch != null ? _regionCodes[fuzzyMatch] : rTrim;
                qs.Add("region", resolvedCode);
                if (resolvedCode.All(char.IsDigit))
                {
                    resolvedRegionCodes.Add(resolvedCode);
                }
            }
        }

        if (municipalityFilters.Length > 0)
        {
            try
            {
                var mappedMunicipalities = await ResolveMunicipalityFiltersAsync(municipalityFilters, resolvedRegionCodes);
                if (mappedMunicipalities.Length == 0 && municipalityFilters.Any(filter => !filter.All(char.IsDigit)))
                {
                    return Content(JsonSerializer.Serialize(new { total = new { value = 0 }, hits = Array.Empty<object>() }), "application/json");
                }

                foreach (var mappedMunicipality in mappedMunicipalities)
                {
                    qs.Add("municipality", mappedMunicipality);
                }

                // AF returns municipality-filtered hits but a region-wide total when
                // region and municipality are combined. Municipality codes are unique,
                // so once we have them the region filter becomes redundant.
                qs.Remove("region");
            }
            catch
            {
                return Content(JsonSerializer.Serialize(new { total = new { value = 0 }, hits = Array.Empty<object>() }), "application/json");
            }
        }

        if (remote.HasValue)                          qs["remote"]        = remote.Value.ToString().ToLower();
        if (!string.IsNullOrWhiteSpace(workingHoursType)) qs["working_hours_type"] = workingHoursType;
        ApplyEmploymentTypeFilter(qs, employmentType);
        ApplyOccupationFilters(qs, occupation);

        qs["limit"]  = limit.ToString();
        qs["offset"] = offset.ToString();

        var url = $"{AF_BASE}/{AF_SEARCH_PATH}?{qs}";
        try
        {
            var response = await _http.GetAsync(url);
            var content  = await response.Content.ReadAsStringAsync();
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
        }
    }

    [HttpGet("occupations")]
    public async Task<IActionResult> GetOccupationOptions(
        [FromQuery] string? q,
        [FromQuery] string[]? municipality,
        [FromQuery] string[]? region,
        [FromQuery] bool? remote,
        [FromQuery] string? employmentType)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        if (!string.IsNullOrWhiteSpace(q)) qs["q"] = q;

        var municipalityFilters = municipality?
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? Array.Empty<string>();
        var resolvedRegionCodes = new List<string>();

        if (region != null && region.Length > 0)
        {
            foreach (var regionCode in ResolveRegionCodes(region))
            {
                qs.Add("region", regionCode);
                resolvedRegionCodes.Add(regionCode);
            }
        }

        if (municipalityFilters.Length > 0)
        {
            try
            {
                var mappedMunicipalities = await ResolveMunicipalityFiltersAsync(municipalityFilters, resolvedRegionCodes);
                if (mappedMunicipalities.Length == 0 && municipalityFilters.Any(filter => !filter.All(char.IsDigit)))
                {
                    return Ok(Array.Empty<object>());
                }

                foreach (var mappedMunicipality in mappedMunicipalities)
                {
                    qs.Add("municipality", mappedMunicipality);
                }

                qs.Remove("region");
            }
            catch (Exception ex)
            {
                return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
            }
        }

        if (remote.HasValue) qs["remote"] = remote.Value.ToString().ToLower();
        ApplyEmploymentTypeFilter(qs, employmentType);
        qs["limit"] = "0";
        qs["offset"] = "0";
        qs["stats"] = "occupation-name";
        qs["stats.limit"] = AF_STATS_LIMIT.ToString();

        var url = $"{AF_BASE}/{AF_SEARCH_PATH}?{qs}";

        try
        {
            var response = await _http.GetAsync(url);
            var content = await response.Content.ReadAsStringAsync();
            response.EnsureSuccessStatusCode();

            using var document = JsonDocument.Parse(content);
            var values = document.RootElement
                .GetProperty("stats")
                .EnumerateArray()
                .FirstOrDefault(stat => string.Equals(stat.GetProperty("type").GetString(), "occupation-name", StringComparison.OrdinalIgnoreCase))
                .GetProperty("values")
                .EnumerateArray()
                .Select(value => new
                {
                    code = value.TryGetProperty("code", out var codeElement) ? codeElement.GetString() : null,
                    label = value.TryGetProperty("term", out var termElement) ? termElement.GetString() : null,
                    count = value.TryGetProperty("count", out var countElement) && countElement.TryGetInt32(out var count) ? count : 0,
                })
                .Where(value => !string.IsNullOrWhiteSpace(value.code) && !string.IsNullOrWhiteSpace(value.label))
                .GroupBy(value => value.label!, StringComparer.OrdinalIgnoreCase)
                .Select(group => new
                {
                    label = group.First().label,
                    codes = group.Select(value => value.code!).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(),
                    count = group.Sum(value => value.count),
                })
                .OrderByDescending(value => value.count)
                .ThenBy(value => value.label)
                .ToArray();

            return Ok(values);
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
        }
    }

    private static void ApplyEmploymentTypeFilter(System.Collections.Specialized.NameValueCollection qs, string? employmentType)
    {
        if (string.IsNullOrWhiteSpace(employmentType))
        {
            return;
        }

        var rawValue = employmentType.Trim();
        var code = _employmentTypeCodes.TryGetValue(rawValue, out var mappedCode) ? mappedCode : rawValue;
        qs.Add("employment-type", code);
    }

    private static void ApplyOccupationFilters(System.Collections.Specialized.NameValueCollection qs, string[]? occupation)
    {
        if (occupation == null || occupation.Length == 0)
        {
            return;
        }

        foreach (var value in occupation.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value.Trim()).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            qs.Add("occupation-name", value);
        }
    }

    private static IEnumerable<string> ResolveRegionCodes(IEnumerable<string> regions)
    {
        foreach (var region in regions)
        {
            var rTrim = (region ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(rTrim))
            {
                continue;
            }

            if (rTrim.All(char.IsDigit))
            {
                yield return rTrim;
                continue;
            }

            if (_regionCodes.TryGetValue(rTrim, out var exactCode))
            {
                yield return exactCode;
                continue;
            }

            var lower = rTrim.ToLowerInvariant();
            var fuzzyMatch = _regionCodes.Keys.FirstOrDefault(k =>
                k.Contains(lower, StringComparison.OrdinalIgnoreCase) ||
                lower.Contains(k, StringComparison.OrdinalIgnoreCase));

            if (!string.IsNullOrWhiteSpace(fuzzyMatch))
            {
                yield return _regionCodes[fuzzyMatch];
            }
        }
    }

    private static async Task<string[]> ResolveMunicipalityFiltersAsync(
        IReadOnlyCollection<string> municipalityFilters,
        IReadOnlyCollection<string> resolvedRegionCodes)
    {
        var resolved = new List<string>();
        JsonDocument? statsDocument = null;

        if (municipalityFilters.Any(filter => !filter.All(char.IsDigit)))
        {
            var statsQuery = System.Web.HttpUtility.ParseQueryString(string.Empty);
            foreach (var regionCode in resolvedRegionCodes.Where(code => !string.IsNullOrWhiteSpace(code)))
            {
                statsQuery.Add("region", regionCode);
            }
            statsQuery["limit"] = "0";
            statsQuery["stats"] = "municipality";
            statsQuery["stats.limit"] = resolvedRegionCodes.Count > 0 ? "30" : "30";

            var statsUrl = $"{AF_BASE}/{AF_SEARCH_PATH}?{statsQuery}";
            var statsResponse = await _http.GetAsync(statsUrl);
            var statsContent = await statsResponse.Content.ReadAsStringAsync();
            statsResponse.EnsureSuccessStatusCode();
            statsDocument = JsonDocument.Parse(statsContent);
        }

        try
        {
            foreach (var municipalityFilter in municipalityFilters)
            {
                if (municipalityFilter.All(char.IsDigit))
                {
                    resolved.Add(municipalityFilter);
                    continue;
                }

                var code = FindMunicipalityCode(statsDocument, municipalityFilter);
                if (!string.IsNullOrWhiteSpace(code))
                {
                    resolved.Add(code);
                }
            }

            return resolved.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }
        finally
        {
            statsDocument?.Dispose();
        }
    }

    private static string? FindMunicipalityCode(JsonDocument? statsDocument, string municipalityFilter)
    {
        if (statsDocument == null ||
            !statsDocument.RootElement.TryGetProperty("stats", out var statsElement) ||
            statsElement.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var normalizedFilter = NormalizeLocation(municipalityFilter);
        foreach (var stat in statsElement.EnumerateArray())
        {
            if (!stat.TryGetProperty("type", out var typeElement) ||
                !string.Equals(typeElement.GetString(), "municipality", StringComparison.OrdinalIgnoreCase) ||
                !stat.TryGetProperty("values", out var valuesElement) ||
                valuesElement.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var value in valuesElement.EnumerateArray())
            {
                var term = value.TryGetProperty("term", out var termElement) ? termElement.GetString() : null;
                var code = value.TryGetProperty("code", out var codeElement) ? codeElement.GetString() : null;
                if (string.IsNullOrWhiteSpace(term) || string.IsNullOrWhiteSpace(code))
                {
                    continue;
                }

                var normalizedTerm = NormalizeLocation(term);
                if (normalizedTerm == normalizedFilter ||
                    normalizedTerm.Contains(normalizedFilter, StringComparison.OrdinalIgnoreCase) ||
                    normalizedFilter.Contains(normalizedTerm, StringComparison.OrdinalIgnoreCase))
                {
                    return code;
                }
            }
        }

        return null;
    }

    private static string NormalizeLocation(string? value)
    {
        return (value ?? string.Empty).Trim().ToLowerInvariant();
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return BadRequest(new { error = "id required" });
        // Try direct resource path first (some IDs might not be accessible that way).
        var directUrl = $"{AF_BASE}/{System.Web.HttpUtility.UrlEncode(id)}";
        try
        {
            Console.WriteLine($"ExternalJobsController.GetById: fetching direct {directUrl}");
            // Use the /ad/{id} endpoint for direct fetches
            var adUrl = $"{AF_BASE}/{AF_AD_PATH}/{System.Web.HttpUtility.UrlEncode(id)}";
            Console.WriteLine($"ExternalJobsController.GetById: trying ad endpoint {adUrl}");
            var response = await _http.GetAsync(adUrl);
            var content  = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"ExternalJobsController.GetById: direct status={response.StatusCode}");

            // If the remote responded with HTTP 404, prefer fallback search immediately
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
                qs["q"] = id;
                qs["limit"] = "1";
                var searchUrl = $"{AF_BASE}?{qs}";
                var searchRes = await _http.GetAsync(searchUrl);
                var searchContent = await searchRes.Content.ReadAsStringAsync();
                try
                {
                    using var sdoc = JsonDocument.Parse(searchContent);
                    if (sdoc.RootElement.TryGetProperty("hits", out var hits) && hits.GetArrayLength() > 0)
                    {
                        return Content(searchContent, "application/json");
                    }
                }
                catch { /* not json or parse failed, continue to html fallback */ }

                try
                {
                    var publicUrl = $"https://arbetsformedlingen.se/platsbanken/annonser/{System.Web.HttpUtility.UrlEncode(id)}";
                    Console.WriteLine($"ExternalJobsController.GetById: attempting public HTML fetch {publicUrl}");
                    var req = new HttpRequestMessage(HttpMethod.Get, publicUrl);
                    req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                    req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
                    var publicRes = await _http.SendAsync(req);
                    var publicHtml = await publicRes.Content.ReadAsStringAsync();
                    Console.WriteLine($"ExternalJobsController.GetById: public fetch status={publicRes.StatusCode}, len={publicHtml?.Length ?? 0}");
                    var json = JsonSerializer.Serialize(new { html = publicHtml });
                    return Content(json, "application/json");
                }
                catch (Exception exPublic) { Console.WriteLine($"ExternalJobsController.GetById: public fetch failed: {exPublic.Message}"); }

                return Content(searchContent, "application/json");
            }

            // If the API indicates resource_not_found in the body, fall back to searching by id (q=id)
            try
            {
                using var doc = JsonDocument.Parse(content);
                if (doc.RootElement.TryGetProperty("cause", out var cause) && cause.ValueKind == JsonValueKind.Object &&
                    cause.TryGetProperty("code", out var codeEl) && codeEl.GetString() == "404")
                {
                    // fallback to search by id
                    var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
                    qs["q"] = id;
                    qs["limit"] = "1";
                    var searchUrl = $"{AF_BASE}/{AF_SEARCH_PATH}?{qs}";
                    var searchRes = await _http.GetAsync(searchUrl);
                    var searchContent = await searchRes.Content.ReadAsStringAsync();
                    // If search returns results, return them. Otherwise, try fetching the public HTML page and return as JSON with html field.
                    try
                    {
                        using var sdoc = JsonDocument.Parse(searchContent);
                        if (sdoc.RootElement.TryGetProperty("hits", out var hits) && hits.GetArrayLength() > 0)
                        {
                            return Content(searchContent, "application/json");
                        }
                    }
                    catch { /* not json or parse failed, continue to html fallback */ }

                    // Fallback: try fetching the public ad page HTML and return as JSON { html: "..." }
                    try
                    {
                        var publicUrl = $"https://arbetsformedlingen.se/platsbanken/annonser/{System.Web.HttpUtility.UrlEncode(id)}";
                        Console.WriteLine($"ExternalJobsController.GetById: attempting public HTML fetch {publicUrl}");
                        var req = new HttpRequestMessage(HttpMethod.Get, publicUrl);
                        req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                        req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
                        var publicRes = await _http.SendAsync(req);
                        var publicHtml = await publicRes.Content.ReadAsStringAsync();
                        Console.WriteLine($"ExternalJobsController.GetById: public fetch status={publicRes.StatusCode}, len={publicHtml?.Length ?? 0}");
                        var json = JsonSerializer.Serialize(new { html = publicHtml });
                        return Content(json, "application/json");
                    }
                    catch (Exception exPublic) { Console.WriteLine($"ExternalJobsController.GetById: public fetch failed: {exPublic.Message}"); }

                    return Content(searchContent, "application/json");
                }
            }
            catch { /* ignore parse errors and return original content */ }

            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
        }
    }
}
