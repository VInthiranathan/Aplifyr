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

    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string[]? municipality,
        [FromQuery] string[]? region,
        [FromQuery] bool? remote,
        [FromQuery] string? workingHoursType,  // "FULL_TIME" | "PART_TIME"
        [FromQuery] string? employmentType,    // forwarded to AF as employment_type
        [FromQuery] int limit = 20,
        [FromQuery] int offset = 0)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        if (!string.IsNullOrWhiteSpace(q))            qs["q"]             = q;
        if (municipality != null && municipality.Length > 0)
        {
            // Map each provided municipality (name or code) to AF code(s).
            var mapped = new List<string>();
            // Determine if we need to fetch stats (any non-digit input)
            var needLookup = municipality.Any(m => !m.All(char.IsDigit));
            JsonDocument? docMun = null;
            try
            {
                if (needLookup)
                {
                    // Request a large stats.limit to include all municipalities
                    var statsUrlMun = $"{AF_BASE}/{AF_SEARCH_PATH}?limit=0&stats=municipality&stats.limit=1000";
                    var statsResMun = await _http.GetAsync(statsUrlMun);
                    var statsContentMun = await statsResMun.Content.ReadAsStringAsync();
                    docMun = JsonDocument.Parse(statsContentMun);
                }

                foreach (var m in municipality)
                {
                    var mTrim = (m ?? string.Empty).Trim();
                    if (string.IsNullOrEmpty(mTrim)) continue;
                    if (mTrim.All(char.IsDigit))
                    {
                        mapped.Add(mTrim);
                        continue;
                    }

                    string? found = null;
                    if (docMun != null && docMun.RootElement.TryGetProperty("stats", out var statsArrMun) && statsArrMun.GetArrayLength() > 0)
                    {
                        foreach (var stat in statsArrMun.EnumerateArray())
                        {
                            if (stat.GetProperty("type").GetString() != "municipality") continue;
                            if (!stat.TryGetProperty("values", out var valsMun)) continue;
                            foreach (var v in valsMun.EnumerateArray())
                            {
                                var term = v.GetProperty("term").GetString() ?? string.Empty;
                                string? code = null;
                                if (v.TryGetProperty("code", out var codeEl) && codeEl.ValueKind != JsonValueKind.Null)
                                {
                                    code = codeEl.GetString();
                                }
                                if (string.IsNullOrWhiteSpace(code)) continue;
                                if (term.Contains(mTrim, StringComparison.OrdinalIgnoreCase) ||
                                    mTrim.Contains(term, StringComparison.OrdinalIgnoreCase))
                                {
                                    found = code;
                                    break;
                                }
                            }
                            if (found != null) break;
                        }
                    }

                    mapped.Add(found ?? mTrim);
                }
            }
            catch
            {
                // On any error, fall back to passing original values through
                mapped.AddRange(municipality.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()));
            }
            finally
            {
                docMun?.Dispose();
            }

            // Add each mapped municipality as its own query param
            foreach (var mm in mapped)
            {
                qs.Add("municipality", mm);
            }
        }
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
                    continue;
                }

                if (_regionCodes.TryGetValue(rTrim, out var exactCode))
                {
                    qs.Add("region", exactCode);
                    continue;
                }

                var lower = rTrim.ToLowerInvariant();
                var fuzzyMatch = _regionCodes.Keys.FirstOrDefault(k =>
                    k.Contains(lower, StringComparison.OrdinalIgnoreCase) ||
                    lower.Contains(k, StringComparison.OrdinalIgnoreCase));

                qs.Add("region", fuzzyMatch != null ? _regionCodes[fuzzyMatch] : rTrim);
            }
        }
        if (remote.HasValue)                          qs["remote"]        = remote.Value.ToString().ToLower();
        if (!string.IsNullOrWhiteSpace(workingHoursType)) qs["working_hours_type"] = workingHoursType;
        if (!string.IsNullOrWhiteSpace(employmentType))
        {
            var empToUse = employmentType.Trim();
            // If not already a code, try to resolve via AF stats endpoint
            if (!empToUse.All(char.IsDigit))
            {
                try
                {
                    var statsUrlEmp = $"{AF_BASE}/{AF_SEARCH_PATH}?limit=0&stats=employment_type&stats.limit=200";
                    var statsResEmp = await _http.GetAsync(statsUrlEmp);
                    var statsContentEmp = await statsResEmp.Content.ReadAsStringAsync();
                    using var docEmp = JsonDocument.Parse(statsContentEmp);
                    if (docEmp.RootElement.TryGetProperty("stats", out var statsArrEmp) && statsArrEmp.GetArrayLength() > 0)
                    {
                        foreach (var stat in statsArrEmp.EnumerateArray())
                        {
                            if (stat.GetProperty("type").GetString() != "employment_type") continue;
                            if (!stat.TryGetProperty("values", out var valsEmp)) continue;
                            foreach (var v in valsEmp.EnumerateArray())
                            {
                                var term = v.GetProperty("term").GetString() ?? string.Empty;
                                var code = v.TryGetProperty("code", out var codeEl) ? codeEl.GetString() : null;
                                if (string.IsNullOrWhiteSpace(code)) continue;
                                if (term.Contains(empToUse, StringComparison.OrdinalIgnoreCase) ||
                                    empToUse.Contains(term, StringComparison.OrdinalIgnoreCase))
                                {
                                    empToUse = code;
                                    break;
                                }
                            }
                            if (empToUse != employmentType.Trim()) break;
                        }
                    }
                }
                catch
                {
                    // ignore and fall back to original
                }
            }

            qs["employment_type"] = empToUse;
        }
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
