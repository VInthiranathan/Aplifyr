using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;

namespace Aplifyr.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExternalJobsController : ControllerBase
{
    private static readonly HttpClient _http = new();
    private readonly IMemoryCache _cache;
    private readonly ILogger<ExternalJobsController> _logger;

    public ExternalJobsController(IMemoryCache cache, ILogger<ExternalJobsController> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    private const string AF_BASE = "https://jobsearch.api.jobtechdev.se";
    private const string AF_SEARCH_PATH = "search";
    private const string AF_AD_PATH = "ad";
    private const int AF_STATS_LIMIT = 30;
    private const string MATCH_QUERY_STRATEGY_VERSION = "2";

    // ── Match defaults ────────────────────────────────────────────────────────
    // Change DEFAULT_MATCH_RESPONSE_LIMIT to adjust how many matched jobs
    // are returned by default. Home inherits this because it sends no ?limit=.
    private const int DEFAULT_MATCH_RESPONSE_LIMIT = 50;
    // Raw AF hits fetched before role/location/tech filtering.
    private const int MATCH_UPSTREAM_FETCH_LIMIT   = 100;

    // ── Location tier scores ──────────────────────────────────────────────────
    private const int LOCATION_SCORE_SAME_MUNICIPALITY = 3;  // exact city → Grade A
    private const int LOCATION_SCORE_SAME_REGION       = 1;  // base; prefs can raise/lower
    private const int LOCATION_SCORE_REMOTE            = 3;  // remote + remote pref → Grade A
    private const int LOCATION_SCORE_NO_PREFERENCE     = 2;  // neutral → Grade B
    private const int LOCATION_SCORE_OUT_OF_REGION     = 0;  // outside → Grade C

    // ── Tech boost ────────────────────────────────────────────────────────────
    private const int TECH_BOOST_MATCH = 1;

    // ── Background-fetch cache entry ──────────────────────────────────────────
    // Stores the growing scored pool for a given profile. The Continue endpoint
    // merges new pages into Jobs until FetchComplete is true.
    private sealed class MatchCacheEntry
    {
        public List<(int GradeOrder, string Id, string Json)> Jobs { get; } = new();
        public string SearchTerm { get; set; } = string.Empty;
        public int NextOffset { get; set; }
        public int TotalAfJobs { get; set; }
        // TotalAfJobs > 0 guard prevents false-complete on a zero-result query.
        public bool FetchComplete => TotalAfJobs > 0 && NextOffset >= TotalAfJobs;
    }

    // ── Grade thresholds ─────────────────────────────────────────────────────
    private const int GRADE_A_MIN_SCORE = 3; // totalScore >= GRADE_A_MIN_SCORE → "A"
    private const int GRADE_B_SCORE     = 1; // totalScore == GRADE_B_SCORE     → "B"
    //                                           anything below GRADE_B_SCORE   → "C"

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

    // Maps lowercase municipality name → region display name (derived from municipalities_by_region.json).
    private static readonly Dictionary<string, string> _municipalityToRegion = new(StringComparer.OrdinalIgnoreCase)
    {
        // Stockholm
        ["stockholm"] = "Stockholm", ["botkyrka"] = "Stockholm", ["danderyd"] = "Stockholm",
        ["ekerö"] = "Stockholm", ["haninge"] = "Stockholm", ["huddinge"] = "Stockholm",
        ["järfälla"] = "Stockholm", ["lidingö"] = "Stockholm", ["nacka"] = "Stockholm",
        ["norrtälje"] = "Stockholm", ["nykvarn"] = "Stockholm", ["nynäshamn"] = "Stockholm",
        ["salem"] = "Stockholm", ["sigtuna"] = "Stockholm", ["sollentuna"] = "Stockholm",
        ["solna"] = "Stockholm", ["sundbyberg"] = "Stockholm", ["södertälje"] = "Stockholm",
        ["tyresö"] = "Stockholm", ["täby"] = "Stockholm", ["upplands-bro"] = "Stockholm",
        ["upplands väsby"] = "Stockholm", ["vaxholm"] = "Stockholm", ["vallentuna"] = "Stockholm",
        ["värmdö"] = "Stockholm", ["österåker"] = "Stockholm",
        // Uppsala
        ["uppsala"] = "Uppsala", ["enköping"] = "Uppsala", ["håbo"] = "Uppsala",
        ["knivsta"] = "Uppsala", ["tierp"] = "Uppsala", ["älvkarleby"] = "Uppsala",
        ["östhammar"] = "Uppsala", ["heby"] = "Uppsala",
        // Södermanland
        ["eskilstuna"] = "Södermanland", ["flen"] = "Södermanland", ["gnesta"] = "Södermanland",
        ["katrineholm"] = "Södermanland", ["nyköping"] = "Södermanland", ["oxelösund"] = "Södermanland",
        ["strängnäs"] = "Södermanland", ["trosa"] = "Södermanland", ["vingåker"] = "Södermanland",
        // Östergötland
        ["linköping"] = "Östergötland", ["norrköping"] = "Östergötland", ["motala"] = "Östergötland",
        ["vadstena"] = "Östergötland", ["mjölby"] = "Östergötland", ["finspång"] = "Östergötland",
        ["kinda"] = "Östergötland", ["söderköping"] = "Östergötland", ["ydre"] = "Östergötland",
        ["åtvidaberg"] = "Östergötland", ["boxholm"] = "Östergötland", ["valdemarsvik"] = "Östergötland",
        // Jönköping
        ["jönköping"] = "Jönköping", ["aneby"] = "Jönköping", ["eksjö"] = "Jönköping",
        ["gislaved"] = "Jönköping", ["gnosjö"] = "Jönköping", ["habo"] = "Jönköping",
        ["mullsjö"] = "Jönköping", ["nässjö"] = "Jönköping", ["sävsjö"] = "Jönköping",
        ["tranås"] = "Jönköping", ["vaggeryd"] = "Jönköping", ["värnamo"] = "Jönköping",
        ["vetlanda"] = "Jönköping",
        // Kronoberg
        ["växjö"] = "Kronoberg", ["alvesta"] = "Kronoberg", ["lessebo"] = "Kronoberg",
        ["ljungby"] = "Kronoberg", ["markaryd"] = "Kronoberg", ["tingsryd"] = "Kronoberg",
        ["uppvidinge"] = "Kronoberg", ["älmhult"] = "Kronoberg",
        // Kalmar
        ["kalmar"] = "Kalmar", ["västervik"] = "Kalmar", ["vimmerby"] = "Kalmar",
        ["oskarshamn"] = "Kalmar", ["nybro"] = "Kalmar", ["hultsfred"] = "Kalmar",
        ["mönsterås"] = "Kalmar", ["borgholm"] = "Kalmar", ["emmaboda"] = "Kalmar",
        ["torsås"] = "Kalmar", ["mörbylånga"] = "Kalmar", ["högsby"] = "Kalmar",
        // Gotland
        ["gotland"] = "Gotland",
        // Blekinge
        ["karlskrona"] = "Blekinge", ["karlshamn"] = "Blekinge", ["olofström"] = "Blekinge",
        ["ronneby"] = "Blekinge", ["sölvesborg"] = "Blekinge",
        // Skåne
        ["malmö"] = "Skåne", ["lund"] = "Skåne", ["helsingborg"] = "Skåne",
        ["kristianstad"] = "Skåne", ["hässleholm"] = "Skåne", ["landskrona"] = "Skåne",
        ["ängelholm"] = "Skåne", ["trelleborg"] = "Skåne", ["ystad"] = "Skåne",
        ["simrishamn"] = "Skåne", ["eslöv"] = "Skåne", ["burlöv"] = "Skåne",
        ["lomma"] = "Skåne", ["staffanstorp"] = "Skåne", ["svedala"] = "Skåne",
        ["bjuv"] = "Skåne", ["höganäs"] = "Skåne", ["kävlinge"] = "Skåne",
        ["klippan"] = "Skåne", ["örkelljunga"] = "Skåne", ["perstorp"] = "Skåne",
        ["osby"] = "Skåne", ["tomelilla"] = "Skåne", ["sjöbo"] = "Skåne",
        ["skurup"] = "Skåne", ["höör"] = "Skåne", ["båstad"] = "Skåne",
        ["svalöv"] = "Skåne", ["åstorp"] = "Skåne", ["bromölla"] = "Skåne",
        ["östra göinge"] = "Skåne",
        // Halland
        ["halmstad"] = "Halland", ["varberg"] = "Halland", ["falkenberg"] = "Halland",
        ["kungsbacka"] = "Halland", ["laholm"] = "Halland", ["hylte"] = "Halland",
        // Västra Götaland
        ["göteborg"] = "Västra Götaland", ["mölndal"] = "Västra Götaland", ["alingsås"] = "Västra Götaland",
        ["borås"] = "Västra Götaland", ["mark"] = "Västra Götaland", ["bengtsfors"] = "Västra Götaland",
        ["dals-ed"] = "Västra Götaland", ["essunga"] = "Västra Götaland", ["falköping"] = "Västra Götaland",
        ["färgelanda"] = "Västra Götaland", ["grästorp"] = "Västra Götaland", ["gullspång"] = "Västra Götaland",
        ["götene"] = "Västra Götaland", ["herrljunga"] = "Västra Götaland", ["härryda"] = "Västra Götaland",
        ["karlsborg"] = "Västra Götaland", ["kungälv"] = "Västra Götaland", ["lerum"] = "Västra Götaland",
        ["lidköping"] = "Västra Götaland", ["lilla edet"] = "Västra Götaland", ["lysekil"] = "Västra Götaland",
        ["mariestad"] = "Västra Götaland", ["mellerud"] = "Västra Götaland", ["munkedal"] = "Västra Götaland",
        ["orust"] = "Västra Götaland", ["partille"] = "Västra Götaland", ["skara"] = "Västra Götaland",
        ["skövde"] = "Västra Götaland", ["sotenäs"] = "Västra Götaland", ["stenungsund"] = "Västra Götaland",
        ["strömstad"] = "Västra Götaland", ["svenljunga"] = "Västra Götaland", ["tanum"] = "Västra Götaland",
        ["tibro"] = "Västra Götaland", ["tidaholm"] = "Västra Götaland", ["tjörn"] = "Västra Götaland",
        ["tranemo"] = "Västra Götaland", ["trollhättan"] = "Västra Götaland", ["töreboda"] = "Västra Götaland",
        ["uddevalla"] = "Västra Götaland", ["ulricehamn"] = "Västra Götaland", ["vara"] = "Västra Götaland",
        ["vårgårda"] = "Västra Götaland", ["åmål"] = "Västra Götaland", ["öckerö"] = "Västra Götaland",
        // Värmland
        ["karlstad"] = "Värmland", ["arvika"] = "Värmland", ["eda"] = "Värmland",
        ["forshaga"] = "Värmland", ["grums"] = "Värmland", ["hagfors"] = "Värmland",
        ["hammarö"] = "Värmland", ["kil"] = "Värmland", ["kristinehamn"] = "Värmland",
        ["munkfors"] = "Värmland", ["säffle"] = "Värmland", ["sunne"] = "Värmland",
        ["torsby"] = "Värmland",
        // Örebro
        ["örebro"] = "Örebro", ["askersund"] = "Örebro", ["degerfors"] = "Örebro",
        ["hallsberg"] = "Örebro", ["hällefors"] = "Örebro", ["karlskoga"] = "Örebro",
        ["kumla"] = "Örebro", ["laxå"] = "Örebro", ["ljusnarsberg"] = "Örebro",
        ["lindesberg"] = "Örebro", ["nora"] = "Örebro", ["lekeberg"] = "Örebro",
        ["storfors"] = "Örebro",
        // Västmanland
        ["västerås"] = "Västmanland", ["arboga"] = "Västmanland", ["fagersta"] = "Västmanland",
        ["hallstahammar"] = "Västmanland", ["kungsör"] = "Västmanland", ["köping"] = "Västmanland",
        ["norberg"] = "Västmanland", ["sala"] = "Västmanland", ["skinnskatteberg"] = "Västmanland",
        ["surahammar"] = "Västmanland",
        // Dalarna
        ["borlänge"] = "Dalarna", ["falun"] = "Dalarna", ["ludvika"] = "Dalarna",
        ["säter"] = "Dalarna", ["hedemora"] = "Dalarna", ["mora"] = "Dalarna",
        ["orsa"] = "Dalarna", ["rättvik"] = "Dalarna", ["leksand"] = "Dalarna",
        ["gagnef"] = "Dalarna", ["malung-sälen"] = "Dalarna", ["smedjebacken"] = "Dalarna",
        ["avesta"] = "Dalarna", ["vansbro"] = "Dalarna", ["älvdalen"] = "Dalarna",
        // Gävleborg
        ["gävle"] = "Gävleborg", ["sandviken"] = "Gävleborg", ["bollnäs"] = "Gävleborg",
        ["hudiksvall"] = "Gävleborg", ["ljusdal"] = "Gävleborg", ["nordanstig"] = "Gävleborg",
        ["ockelbo"] = "Gävleborg", ["ovanåker"] = "Gävleborg", ["söderhamn"] = "Gävleborg",
        ["hofors"] = "Gävleborg",
        // Västernorrland
        ["sundsvall"] = "Västernorrland", ["härnösand"] = "Västernorrland", ["kramfors"] = "Västernorrland",
        ["sollefteå"] = "Västernorrland", ["örnsköldsvik"] = "Västernorrland", ["timrå"] = "Västernorrland",
        ["ånge"] = "Västernorrland",
        // Jämtland
        ["östersund"] = "Jämtland", ["åre"] = "Jämtland", ["härjedalen"] = "Jämtland",
        ["strömsund"] = "Jämtland", ["krokom"] = "Jämtland", ["bräcke"] = "Jämtland",
        ["ragunda"] = "Jämtland", ["berg"] = "Jämtland",
        // Västerbotten
        ["umeå"] = "Västerbotten", ["skellefteå"] = "Västerbotten", ["lycksele"] = "Västerbotten",
        ["vindeln"] = "Västerbotten", ["vännäs"] = "Västerbotten", ["robertsfors"] = "Västerbotten",
        ["bjurholm"] = "Västerbotten", ["norsjö"] = "Västerbotten", ["storuman"] = "Västerbotten",
        ["sorsele"] = "Västerbotten", ["vilhelmina"] = "Västerbotten", ["dorotea"] = "Västerbotten",
        ["malå"] = "Västerbotten", ["åsele"] = "Västerbotten",
        // Norrbotten
        ["luleå"] = "Norrbotten", ["piteå"] = "Norrbotten", ["boden"] = "Norrbotten",
        ["älvsbyn"] = "Norrbotten", ["kalix"] = "Norrbotten", ["haparanda"] = "Norrbotten",
        ["överkalix"] = "Norrbotten", ["övertorneå"] = "Norrbotten", ["kiruna"] = "Norrbotten",
        ["gällivare"] = "Norrbotten", ["jokkmokk"] = "Norrbotten", ["pajala"] = "Norrbotten",
        ["arjeplog"] = "Norrbotten", ["arvidsjaur"] = "Norrbotten",
    };

    // Tech term normalization: common aliases → canonical token.
    private static readonly Dictionary<string, string> _techNormMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ts"] = "typescript", ["js"] = "javascript",
        [".net"] = "dotnet", ["asp.net"] = "dotnet", ["asp.net core"] = "dotnet", ["dotnet"] = "dotnet",
        ["c#"] = "csharp", ["c sharp"] = "csharp",
        ["react.js"] = "react", ["reactjs"] = "react",
        ["node.js"] = "node", ["nodejs"] = "node",
        ["next.js"] = "next", ["nextjs"] = "next",
        ["vue.js"] = "vue", ["vuejs"] = "vue",
        ["angular.js"] = "angular", ["angularjs"] = "angular",
        ["express.js"] = "express", ["expressjs"] = "express",
        ["postgresql"] = "postgres", ["pg"] = "postgres",
    };

    // EN↔SV role term synonyms for inclusion matching.
    private static readonly Dictionary<string, string> _roleSynonyms = new(StringComparer.OrdinalIgnoreCase)
    {
        ["developer"] = "utvecklare", ["utvecklare"] = "developer",
        ["engineer"] = "ingenjör", ["ingenjör"] = "engineer",
        ["programmer"] = "programmerare", ["programmerare"] = "programmer",
        ["teacher"] = "lärare", ["lärare"] = "teacher",
        ["nurse"] = "sjuksköterska", ["sjuksköterska"] = "nurse",
        ["doctor"] = "läkare", ["läkare"] = "doctor",
        ["manager"] = "chef", ["chef"] = "manager",
        ["analyst"] = "analytiker", ["analytiker"] = "analyst",
        ["architect"] = "arkitekt", ["arkitekt"] = "architect",
    };

    private static readonly string[] _compactRoleSearchSuffixes = _roleSynonyms.Keys
        .Where(key => key.Length >= 4)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderByDescending(key => key.Length)
        .ToArray();

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
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "Municipality resolution failed for filters {Filters} with regions {Regions}", municipalityFilters, resolvedRegionCodes);
                return Content(JsonSerializer.Serialize(new { total = new { value = 0 }, hits = Array.Empty<object>() }), "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Municipality resolution failed for filters {Filters} with regions {Regions}", municipalityFilters, resolvedRegionCodes);
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

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Accept.ParseAdd("application/json");
        using var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        return new ContentResult
        {
            StatusCode = (int)response.StatusCode,
            ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/json",
            Content = body,
        };
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetJob(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return BadRequest();

        var url = $"{AF_BASE}/{AF_AD_PATH}/{Uri.EscapeDataString(id)}";
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Accept.ParseAdd("application/json");
        using var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        return new ContentResult
        {
            StatusCode = (int)response.StatusCode,
            ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/json",
            Content = body,
        };
    }

    // Remaining matching/helper implementation intentionally stays unchanged.
}
