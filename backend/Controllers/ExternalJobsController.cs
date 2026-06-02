using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;

namespace Examensarbete.Api.Controllers;

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
            _logger.LogWarning(ex, "Occupation municipality resolution failed for filters {Filters} with regions {Regions}", municipalityFilters, resolvedRegionCodes);
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
            _logger.LogInformation("ExternalJobsController.GetById: fetching direct {DirectUrl}", directUrl);
            // Use the /ad/{id} endpoint for direct fetches
            var adUrl = $"{AF_BASE}/{AF_AD_PATH}/{System.Web.HttpUtility.UrlEncode(id)}";
            _logger.LogInformation("ExternalJobsController.GetById: trying ad endpoint {AdUrl}", adUrl);
            var response = await _http.GetAsync(adUrl);
            var content  = await response.Content.ReadAsStringAsync();
            _logger.LogInformation("ExternalJobsController.GetById: direct status={StatusCode}", response.StatusCode);

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
                catch (JsonException ex)
                {
                    _logger.LogDebug(ex, "ExternalJobsController.GetById: could not parse fallback search response for {Id}", id);
                }

                try
                {
                    var publicUrl = $"https://arbetsformedlingen.se/platsbanken/annonser/{System.Web.HttpUtility.UrlEncode(id)}";
                    _logger.LogInformation("ExternalJobsController.GetById: attempting public HTML fetch {PublicUrl}", publicUrl);
                    var req = new HttpRequestMessage(HttpMethod.Get, publicUrl);
                    req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                    req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
                    var publicRes = await _http.SendAsync(req);
                    var publicHtml = await publicRes.Content.ReadAsStringAsync();
                    _logger.LogInformation("ExternalJobsController.GetById: public fetch status={StatusCode}, len={Length}", publicRes.StatusCode, publicHtml?.Length ?? 0);
                    var json = JsonSerializer.Serialize(new { html = publicHtml });
                    return Content(json, "application/json");
                }
                catch (Exception exPublic)
                {
                    _logger.LogWarning(exPublic, "ExternalJobsController.GetById: public fetch failed for {Id}", id);
                }

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
                    catch (JsonException ex)
                    {
                        _logger.LogDebug(ex, "ExternalJobsController.GetById: could not parse search response for {Id}", id);
                    }

                    // Fallback: try fetching the public ad page HTML and return as JSON { html: "..." }
                    try
                    {
                        var publicUrl = $"https://arbetsformedlingen.se/platsbanken/annonser/{System.Web.HttpUtility.UrlEncode(id)}";
                        _logger.LogInformation("ExternalJobsController.GetById: attempting public HTML fetch {PublicUrl}", publicUrl);
                        var req = new HttpRequestMessage(HttpMethod.Get, publicUrl);
                        req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                        req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
                        var publicRes = await _http.SendAsync(req);
                        var publicHtml = await publicRes.Content.ReadAsStringAsync();
                        _logger.LogInformation("ExternalJobsController.GetById: public fetch status={StatusCode}, len={Length}", publicRes.StatusCode, publicHtml?.Length ?? 0);
                        var json = JsonSerializer.Serialize(new { html = publicHtml });
                        return Content(json, "application/json");
                    }
                    catch (Exception exPublic)
                    {
                        _logger.LogWarning(exPublic, "ExternalJobsController.GetById: public fetch failed for {Id}", id);
                    }

                    return Content(searchContent, "application/json");
                }
            }
            catch (JsonException ex)
            {
                _logger.LogDebug(ex, "ExternalJobsController.GetById: could not parse direct response for {Id}", id);
            }

            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
        }
    }

    // ─────────────────────────── Matched jobs endpoint ───────────────────────────

    [HttpPost("match")]
    public async Task<IActionResult> Match(
        [FromBody] MatchProfileRequest? profile,
        [FromQuery] int limit = DEFAULT_MATCH_RESPONSE_LIMIT,
        [FromQuery] int seed = 0)
    {
        if (profile == null) return BadRequest(new { error = "profile required" });

        // Determine desired roles source
        var desiredRoles = (profile.Roles ?? Array.Empty<string>())
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Select(r => r.Trim())
            .ToArray();

        string desiredRolesSource;
        IReadOnlyList<string> activeRoles;
        if (desiredRoles.Length > 0)
        {
            activeRoles = desiredRoles;
            desiredRolesSource = "roles";
        }
        else if (!string.IsNullOrWhiteSpace(profile.Title))
        {
            activeRoles = new[] { profile.Title!.Trim() };
            desiredRolesSource = "title_fallback";
        }
        else
        {
            return Ok(new
            {
                matched = Array.Empty<object>(),
                thresholds = new
                {
                    A = $"totalScore >= {GRADE_A_MIN_SCORE}",
                    B = $"totalScore == {GRADE_B_SCORE}",
                    C = $"totalScore <= {GRADE_B_SCORE - 1}",
                },
                profileUsed = new
                {
                    roles = Array.Empty<string>(),
                    title = (string?)null,
                    tags = profile.Tags ?? Array.Empty<string>(),
                    location = profile.Location,
                    locationPreferences = profile.LocationPreferences ?? Array.Empty<string>(),
                    desiredRolesSource = "none",
                },
            });
        }

        var normalizedDesiredRoles = activeRoles.Select(NormalizeRoleInput).ToList();

        var normalizedUserTags = (profile.Tags ?? Array.Empty<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => NormalizeTech(t.Trim()))
            .Where(t => t.Length >= 2)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Normalize semantic location preference flags.
        // Canonical keys stored from frontend: "remote", "country", "region", "onlyMyLocation", "nearbyLocation".
        // Legacy translated labels are also normalised here for backward compatibility.
        var normalizedLocationPrefs = NormalizeLocationPreferences(
            profile.LocationPreferences ?? Array.Empty<string>());

        // Build municipality and region-code sets from the primary location only.
        // Only include the location when it resolves to a known municipality or region name.
        // If profile.Location is free text that cannot be resolved, leave both sets empty
        // so ScoreLocation falls back to no_preference instead of forcing out_of_region.
        var normalizedUserMunicipalities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var userRegionCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(profile.Location))
        {
            var locLower = profile.Location!.Trim().ToLowerInvariant();
            if (_municipalityToRegion.TryGetValue(locLower, out var resolvedRegionName))
            {
                // Location resolves to a known municipality → include municipality + its region code
                normalizedUserMunicipalities.Add(locLower);
                if (_regionCodes.TryGetValue(resolvedRegionName, out var regionCode))
                    userRegionCodes.Add(regionCode);
            }
            else if (_regionCodes.TryGetValue(profile.Location!.Trim(), out var directRegionCode))
            {
                // Location was entered as a region name directly (e.g. "Stockholm", "Skåne")
                userRegionCodes.Add(directRegionCode);
            }
            // else: unresolvable free text — both sets stay empty → no_preference in scoring
        }

        var effectiveLimit = limit > 0 ? limit : DEFAULT_MATCH_RESPONSE_LIMIT;
        var primarySearchTerm = string.Join(" ", activeRoles);
        var cacheKey = BuildMatchCacheKey(
            normalizedDesiredRoles, normalizedUserTags,
            normalizedUserMunicipalities, userRegionCodes, normalizedLocationPrefs);

        // Fast path: serve from in-memory cache when the same normalised profile was
        // requested recently (TTL = 15 min). The seed only affects presentation order,
        // not the cached data, so it is intentionally excluded from the cache key.
        if (_cache.TryGetValue(cacheKey, out MatchCacheEntry? cachedEntry) && cachedEntry != null)
        {
            // On a "Load Different" click (seed != 0) proactively fetch the next AF page
            // before slicing so the user sees genuinely new jobs, not just a reorder of
            // the same ~100-job pool that was loaded on first visit.
            if (seed != 0 && !cachedEntry.FetchComplete)
            {
                var searchTermForMerge = string.IsNullOrWhiteSpace(cachedEntry.SearchTerm)
                    ? primarySearchTerm
                    : cachedEntry.SearchTerm;
                await MergeNextAfPage(cachedEntry, cacheKey, searchTermForMerge, normalizedDesiredRoles,
                    normalizedUserMunicipalities, userRegionCodes, normalizedLocationPrefs, normalizedUserTags);
            }
            var cachedSlice = SliceJobs(cachedEntry.Jobs, seed, effectiveLimit);
            var cachedJson = BuildMatchResponseJson(cachedSlice, cachedEntry.Jobs.Count, effectiveLimit,
                cachedEntry.FetchComplete, cachedEntry.TotalAfJobs, desiredRolesSource, profile, activeRoles);
            return Content(cachedJson, "application/json");
        }

        string rawContent;
        string searchTerm;
        try
        {
            (searchTerm, rawContent) = await FetchInitialMatchPageAsync(activeRoles);
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
        }

        var matchResults = new List<(int GradeOrder, int TotalScore, string Id, string Json)>();
        int totalAfJobs = 0;
        int hitsReturned = 0;

        try
        {
            using var doc = JsonDocument.Parse(rawContent);
            if (!doc.RootElement.TryGetProperty("hits", out var hitsEl) || hitsEl.ValueKind != JsonValueKind.Array)
                return Ok(BuildEmptyMatchResponse(desiredRolesSource, profile, activeRoles));

            // Read the total number of AF results so we know when background fetching is done.
            totalAfJobs = doc.RootElement.TryGetProperty("total", out var totEl)
                && totEl.TryGetProperty("value", out var totVal)
                ? totVal.GetInt32() : 0;
            hitsReturned = hitsEl.GetArrayLength();

            foreach (var hit in hitsEl.EnumerateArray())
            {
                var jobId = hit.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";

                var (roleMatched, matchedOn, matchedValue) = CheckRoleInclusion(hit, normalizedDesiredRoles);
                if (!roleMatched) continue;

                var (locationScore, locationTier) = ScoreLocation(hit, normalizedUserMunicipalities, userRegionCodes, normalizedLocationPrefs);
                var (techBoost, matchedTechTerms) = ScoreTechBoost(hit, normalizedUserTags);

                var totalScore = locationScore + techBoost;
                var grade = AssignGrade(totalScore);

                // Reasons are shown verbatim in the ?debug=1 developer helper.
                // Format: <dimension>:<detail> → <contribution>
                var reasons = new List<string>
                {
                    $"role:{matchedOn} → '{matchedValue}' (searched: '{string.Join(", ", activeRoles)}')",
                    $"location:{locationTier} → +{locationScore}",
                };
                if (normalizedUserTags.Count > 0)
                    reasons.Add(techBoost > 0
                        ? $"tech:{matchedTechTerms.Length} tag(s) matched [{string.Join(", ", matchedTechTerms)}] → +{TECH_BOOST_MATCH}"
                        : $"tech:no match from [{string.Join(", ", normalizedUserTags)}] → +0");
                else
                    reasons.Add("tech:no profile tags → +0");
                reasons.Add($"score:{locationScore}+{techBoost}={totalScore} → grade={grade}");

                var jobJson = BuildJobResultJson(
                    hit.GetRawText(), grade,
                    locationScore, locationTier,
                    techBoost, matchedTechTerms,
                    totalScore, matchedOn, matchedValue, reasons);

                var gradeOrder = grade == "A" ? 0 : grade == "B" ? 1 : 2;
                matchResults.Add((gradeOrder, totalScore, jobId, jobJson));
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Error processing job results", detail = ex.Message });
        }

        // Sort the full result set and cache it so subsequent requests for the same
        // profile are served without an AF round-trip. The Continue endpoint will
        // grow this pool in the background until all AF results are fetched.
        var entry = new MatchCacheEntry
        {
            SearchTerm = searchTerm,
            TotalAfJobs = totalAfJobs,
            NextOffset = hitsReturned
        };
        foreach (var r in matchResults.OrderBy(r => r.GradeOrder).ThenByDescending(r => r.TotalScore))
            entry.Jobs.Add((r.GradeOrder, r.Id, r.Json));

        _cache.Set(cacheKey, entry, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15)
        });

        var sortedJsonJobs = SliceJobs(entry.Jobs, seed, effectiveLimit);
        var responseJson = BuildMatchResponseJson(sortedJsonJobs, entry.Jobs.Count, effectiveLimit,
            entry.FetchComplete, entry.TotalAfJobs, desiredRolesSource, profile, activeRoles);
        return Content(responseJson, "application/json");
    }

    // ─────────────────────────── Background continue endpoint ───────────────────────────
    // Called by the frontend every ~5 s to fetch the next 100 AF results for the same
    // profile and merge them into the cached pool. Stops once FetchComplete is true.

    [HttpPost("match/continue")]
    public async Task<IActionResult> MatchContinue([FromBody] MatchProfileRequest? profile)
    {
        if (profile == null) return BadRequest(new { error = "profile required" });

        // ── Profile normalization (same logic as Match) ──────────────────────
        var desiredRoles = (profile.Roles ?? Array.Empty<string>())
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Select(r => r.Trim())
            .ToArray();

        IReadOnlyList<string> activeRoles;
        if (desiredRoles.Length > 0)
            activeRoles = desiredRoles;
        else if (!string.IsNullOrWhiteSpace(profile.Title))
            activeRoles = new[] { profile.Title!.Trim() };
        else
            return Ok(new { fetchComplete = true, totalCached = 0, addedCount = 0, totalAfJobs = 0 });

        var normalizedDesiredRoles = activeRoles.Select(NormalizeRoleInput).ToList();

        var normalizedUserTags = (profile.Tags ?? Array.Empty<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => NormalizeTech(t.Trim()))
            .Where(t => t.Length >= 2)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var normalizedLocationPrefs = NormalizeLocationPreferences(
            profile.LocationPreferences ?? Array.Empty<string>());

        var normalizedUserMunicipalities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var userRegionCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(profile.Location))
        {
            var locLower = profile.Location!.Trim().ToLowerInvariant();
            if (_municipalityToRegion.TryGetValue(locLower, out var resolvedRegionName))
            {
                normalizedUserMunicipalities.Add(locLower);
                if (_regionCodes.TryGetValue(resolvedRegionName, out var regionCode))
                    userRegionCodes.Add(regionCode);
            }
            else if (_regionCodes.TryGetValue(profile.Location!.Trim(), out var directRegionCode))
            {
                userRegionCodes.Add(directRegionCode);
            }
        }

        // ── Cache lookup ──────────────────────────────────────────────────────
        var cacheKey = BuildMatchCacheKey(
            normalizedDesiredRoles, normalizedUserTags,
            normalizedUserMunicipalities, userRegionCodes, normalizedLocationPrefs);

        if (!_cache.TryGetValue(cacheKey, out MatchCacheEntry? entry) || entry == null)
            return Ok(new { fetchComplete = true, totalCached = 0, addedCount = 0, totalAfJobs = 0 });

        if (entry.FetchComplete)
            return Ok(new { fetchComplete = true, totalCached = entry.Jobs.Count, addedCount = 0, totalAfJobs = entry.TotalAfJobs });

        var primarySearchTerm = string.Join(" ", activeRoles);
        var searchTermForMerge = string.IsNullOrWhiteSpace(entry.SearchTerm)
            ? primarySearchTerm
            : entry.SearchTerm;
        int addedCount = await MergeNextAfPage(entry, cacheKey, searchTermForMerge,
            normalizedDesiredRoles, normalizedUserMunicipalities, userRegionCodes,
            normalizedLocationPrefs, normalizedUserTags);

        return Ok(new
        {
            fetchComplete = entry.FetchComplete,
            totalCached = entry.Jobs.Count,
            addedCount,
            totalAfJobs = entry.TotalAfJobs
        });
    }

    // ─────────────────────── Matching helpers ───────────────────────

    private static string BuildMatchCacheKey(
        IReadOnlyList<string> normalizedRoles,
        IReadOnlyList<string> normalizedTags,
        HashSet<string> normalizedMunicipalities,
        HashSet<string> regionCodes,
        HashSet<string> locationPrefs)
    {
        var roles  = string.Join("|", normalizedRoles.Order());
        var tags   = string.Join("|", normalizedTags.Order());
        var munis  = string.Join("|", normalizedMunicipalities.Order());
        var regs   = string.Join("|", regionCodes.Order());
        var prefs  = string.Join("|", locationPrefs.Order());
        return $"match:v={MATCH_QUERY_STRATEGY_VERSION};r={roles};t={tags};m={munis};rg={regs};p={prefs}";
    }

    private async Task<(string SearchTerm, string RawContent)> FetchInitialMatchPageAsync(IReadOnlyList<string> activeRoles)
    {
        string? firstRawContent = null;
        string? firstSearchTerm = null;

        foreach (var candidate in BuildSearchTermCandidates(activeRoles))
        {
            var rawContent = await FetchAfSearchPageRawAsync(candidate, 0, MATCH_UPSTREAM_FETCH_LIMIT);

            firstSearchTerm ??= candidate;
            firstRawContent ??= rawContent;

            if (SearchResponseHasHits(rawContent))
                return (candidate, rawContent);
        }

        return (firstSearchTerm ?? string.Join(" ", activeRoles), firstRawContent ?? string.Empty);
    }

    private async Task<string> FetchAfSearchPageRawAsync(string searchTerm, int offset, int limit)
    {
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        qs["q"] = searchTerm;
        qs["limit"] = limit.ToString();
        qs["offset"] = offset.ToString();

        var afResp = await _http.GetAsync($"{AF_BASE}/{AF_SEARCH_PATH}?{qs}");
        return await afResp.Content.ReadAsStringAsync();
    }

    private static bool SearchResponseHasHits(string rawContent)
    {
        if (string.IsNullOrWhiteSpace(rawContent))
            return false;

        using var doc = JsonDocument.Parse(rawContent);
        return doc.RootElement.TryGetProperty("hits", out var hitsEl)
            && hitsEl.ValueKind == JsonValueKind.Array
            && hitsEl.GetArrayLength() > 0;
    }

    private static IReadOnlyList<string> BuildSearchTermCandidates(IReadOnlyList<string> activeRoles)
    {
        var primary = string.Join(" ", activeRoles);
        var expanded = string.Join(" ", activeRoles.Select(ExpandCompactRoleForSearch));

        return string.Equals(primary, expanded, StringComparison.OrdinalIgnoreCase)
            ? new[] { primary }
            : new[] { primary, expanded };
    }

    private static string ExpandCompactRoleForSearch(string role)
    {
        var trimmedRole = role.Trim();
        if (trimmedRole.Length == 0 || ContainsRoleSeparator(trimmedRole))
            return trimmedRole;

        var compactRole = NormalizeRoleCompact(trimmedRole);
        foreach (var suffix in _compactRoleSearchSuffixes)
        {
            if (compactRole.Length <= suffix.Length + 2)
                continue;
            if (!compactRole.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                continue;

            var prefix = compactRole[..^suffix.Length];
            if (prefix.Length < 3)
                continue;

            return $"{prefix} {suffix}";
        }

        return trimmedRole;
    }

    private static bool ContainsRoleSeparator(string value) =>
        value.Any(c => char.IsWhiteSpace(c) || c is '-' or '_' or '/' or '\\' or '.');

    /// <summary>
    /// Returns up to <paramref name="limit"/> job JSON strings from <paramref name="sorted"/>.
    /// seed == 0 → original sorted order (best grades first, then score).
    /// seed != 0 → shuffle within each grade bucket using a seeded RNG so callers
    ///             see a different subset without changing the A → B → C quality ordering.
    /// </summary>
    private static List<string> SliceJobs(
        List<(int GradeOrder, string Id, string Json)> sorted, int seed, int limit)
    {
        if (seed == 0)
            return sorted.Select(j => j.Json).Take(limit).ToList();

        var rng = new Random(seed);
        return sorted
            .GroupBy(j => j.GradeOrder)
            .OrderBy(g => g.Key)
            .SelectMany(g => g.OrderBy(_ => rng.Next()))
            .Select(j => j.Json)
            .Take(limit)
            .ToList();
    }

    // Fetches the next AF page (100 jobs at entry.NextOffset), scores each hit,
    // deduplicates against the existing pool, merges, re-sorts A→B→C, advances
    // entry.NextOffset, and refreshes the cache entry. Returns the number of new
    // jobs added. Network / parse failures are swallowed so callers always get
    // a valid (possibly unchanged) pool back.
    private async Task<int> MergeNextAfPage(
        MatchCacheEntry entry,
        string cacheKey,
        string searchTerm,
        IReadOnlyList<string> normalizedDesiredRoles,
        HashSet<string> normalizedUserMunicipalities,
        HashSet<string> userRegionCodes,
        HashSet<string> normalizedLocationPrefs,
        IReadOnlyList<string> normalizedUserTags)
    {
        if (entry.FetchComplete) return 0;

        string rawContent;
        try
        {
            rawContent = await FetchAfSearchPageRawAsync(searchTerm, entry.NextOffset, 100);
        }
        catch
        {
            return 0; // Network failure — caller continues with existing pool
        }

        int hitsReturned = 0;
        int addedCount = 0;
        var existingIds = new HashSet<string>(entry.Jobs.Select(j => j.Id));

        try
        {
            using var doc = JsonDocument.Parse(rawContent);
            if (doc.RootElement.TryGetProperty("hits", out var hitsEl) && hitsEl.ValueKind == JsonValueKind.Array)
            {
                hitsReturned = hitsEl.GetArrayLength();
                foreach (var hit in hitsEl.EnumerateArray())
                {
                    var jobId = hit.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
                    if (existingIds.Contains(jobId)) continue;

                    var (roleMatched, matchedOn, matchedValue) = CheckRoleInclusion(hit, normalizedDesiredRoles);
                    if (!roleMatched) continue;

                    var (locationScore, locationTier) = ScoreLocation(hit, normalizedUserMunicipalities, userRegionCodes, normalizedLocationPrefs);
                    var (techBoost, matchedTechTerms) = ScoreTechBoost(hit, normalizedUserTags);
                    var totalScore = locationScore + techBoost;
                    var grade = AssignGrade(totalScore);

                    var reasons = new List<string>
                    {
                        $"role:{matchedOn} → '{matchedValue}'",
                        $"location:{locationTier} → +{locationScore}",
                        $"score:{locationScore}+{techBoost}={totalScore} → grade={grade}",
                    };

                    var jobJson = BuildJobResultJson(
                        hit.GetRawText(), grade,
                        locationScore, locationTier,
                        techBoost, matchedTechTerms,
                        totalScore, matchedOn, matchedValue, reasons);

                    var gradeOrder = grade == "A" ? 0 : grade == "B" ? 1 : 2;
                    entry.Jobs.Add((gradeOrder, jobId, jobJson));
                    addedCount++;
                }
            }
        }
        catch
        {
            // Partial parse failure — commit whatever was processed before the error
        }

        // Re-sort to keep A → B → C ordering intact after the merge.
        var sorted = entry.Jobs.OrderBy(j => j.GradeOrder).ToList();
        entry.Jobs.Clear();
        entry.Jobs.AddRange(sorted);

        // Safety net: if AF returned 0 hits, advance past this position so callers
        // don't re-fetch the same empty offset on the next call.
        entry.NextOffset += hitsReturned > 0 ? hitsReturned : entry.TotalAfJobs;

        _cache.Set(cacheKey, entry, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15)
        });

        return addedCount;
    }

    private static (bool matched, string matchedOn, string matchedValue) CheckRoleInclusion(
        JsonElement job, IReadOnlyList<string> normalizedDesiredRoles)
    {
        // Pre-compute compact forms once per call so each field check reuses them.
        var compactDesiredRoles = normalizedDesiredRoles
            .Select(NormalizeRoleCompact)
            .ToArray();

        // Check occupation.label (highest priority)
        if (job.TryGetProperty("occupation", out var occ) && occ.ValueKind != JsonValueKind.Null &&
            occ.TryGetProperty("label", out var ol) && ol.ValueKind == JsonValueKind.String)
        {
            var label = ol.GetString()!;
            var normLabel = NormalizeRoleInput(label);
            var compactLabel = NormalizeRoleCompact(normLabel);
            for (int i = 0; i < normalizedDesiredRoles.Count; i++)
            {
                if (RoleMatchesField(normalizedDesiredRoles[i], compactDesiredRoles[i], normLabel, compactLabel))
                    return (true, "occupation.label", label);
            }
        }

        // Check occupation_group.label
        if (job.TryGetProperty("occupation_group", out var og) && og.ValueKind != JsonValueKind.Null &&
            og.TryGetProperty("label", out var ogl) && ogl.ValueKind == JsonValueKind.String)
        {
            var label = ogl.GetString()!;
            var normLabel = NormalizeRoleInput(label);
            var compactLabel = NormalizeRoleCompact(normLabel);
            for (int i = 0; i < normalizedDesiredRoles.Count; i++)
            {
                if (RoleMatchesField(normalizedDesiredRoles[i], compactDesiredRoles[i], normLabel, compactLabel))
                    return (true, "occupation_group.label", label);
            }
        }

        // Check headline
        if (job.TryGetProperty("headline", out var hl) && hl.ValueKind == JsonValueKind.String)
        {
            var headline = hl.GetString()!;
            var normHeadline = NormalizeRoleInput(headline);
            var compactHeadline = NormalizeRoleCompact(normHeadline);
            for (int i = 0; i < normalizedDesiredRoles.Count; i++)
            {
                if (RoleMatchesField(normalizedDesiredRoles[i], compactDesiredRoles[i], normHeadline, compactHeadline))
                {
                    var display = headline.Length > 80 ? headline[..80] + "…" : headline;
                    return (true, "headline", display);
                }
            }
        }

        return (false, "", "");
    }

    /// <summary>
    /// Returns true when any token of <paramref name="normalizedRole"/> (or its EN/SV synonym)
    /// appears as a substring of <paramref name="normalizedText"/>.
    /// </summary>
    private static bool RoleTokensMatchText(string normalizedRole, string normalizedText)
    {
        var tokens = TokenizeRoleForMatching(normalizedRole);

        if (tokens.Length == 0) return false;

        foreach (var token in tokens)
        {
            if (normalizedText.Contains(token, StringComparison.OrdinalIgnoreCase))
                return true;

            if (_roleSynonyms.TryGetValue(token, out var synonym) &&
                normalizedText.Contains(synonym, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    private static string[] TokenizeRoleForMatching(string normalizedRole)
    {
        var tokens = normalizedRole
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length >= 3)
            .ToList();

        var expandedRole = ExpandCompactRoleForSearch(normalizedRole);
        if (!string.Equals(expandedRole, normalizedRole, StringComparison.OrdinalIgnoreCase))
        {
            tokens.AddRange(
                expandedRole
                    .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                    .Where(t => t.Length >= 3));
        }

        return tokens
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static HashSet<string> NormalizeLocationPreferences(IEnumerable<string> prefs)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pref in prefs)
        {
            if (string.IsNullOrWhiteSpace(pref)) continue;
            // Normalize to lowercase, no spaces, no hyphens for matching.
            var norm = pref.Trim().ToLowerInvariant().Replace(" ", "").Replace("-", "");
            var token = norm switch
            {
                // Canonical camelCase keys stored by current frontend
                "onlymylocation"                          => "onlymylocation",
                "nearbylocation"                          => "nearbylocation",
                "region"                                  => "region",
                "country"                                 => "country",
                "remote"                                  => "remote",
                // Legacy English translated labels
                "onlymylocation2" or "onlymy location"    => "onlymylocation",
                "nearbylocation2" or "nearbylocation2"    => "nearbylocation",
                "endastremote"                            => "remote",
                // Legacy Swedish translated labels
                "endastminplats"                          => "onlymylocation",
                "näraminstays" or "naraminstays"
                    or "naramingplats" or "närmingplats"  => "nearbylocation",
                "land"                                    => "country",
                _                                         => norm,
            };
            result.Add(token);
        }
        return result;
    }

    private static (int score, string tier) ScoreLocation(
        JsonElement job,
        HashSet<string> normalizedUserMunicipalities,
        HashSet<string> userRegionCodes,
        HashSet<string> normalizedLocationPrefs)
    {
        var hasLocation    = normalizedUserMunicipalities.Count > 0 || userRegionCodes.Count > 0;
        var hasOnlyMy      = normalizedLocationPrefs.Contains("onlymylocation");
        var hasNearby      = normalizedLocationPrefs.Contains("nearbylocation");
        var hasRegion      = normalizedLocationPrefs.Contains("region");
        var hasCountry     = normalizedLocationPrefs.Contains("country");
        var hasRemotePref  = normalizedLocationPrefs.Contains("remote");
        // "nearby" and "region" behave identically: same-region jobs are acceptable (Grade B).
        // When both onlyMyLocation and nearbyLocation/region are selected, most permissive wins.
        var hasNearbyOrRegion = hasNearby || hasRegion;
        var hasNarrowingPref  = hasOnlyMy || hasNearbyOrRegion;

        // ── Step 1: Remote jobs ──────────────────────────────────────────────
        var isRemote = job.TryGetProperty("remote", out var remoteEl) && remoteEl.ValueKind == JsonValueKind.True;
        if (isRemote)
        {
            // Only score as Grade A when user explicitly wants remote work.
            // Otherwise fall through and let geography score it normally.
            if (hasRemotePref)
                return (LOCATION_SCORE_REMOTE, "remote");
        }

        // ── Read job address fields ──────────────────────────────────────────
        string? jobMunicipality = null;
        string? jobRegion = null;
        if (job.TryGetProperty("workplace_address", out var addr) && addr.ValueKind != JsonValueKind.Null)
        {
            jobMunicipality = addr.TryGetProperty("municipality", out var m) ? m.GetString() : null;
            jobRegion       = addr.TryGetProperty("region",       out var r) ? r.GetString() : null;
        }

        // Resolve job's region string → 2-digit SCB code so it can be compared
        // with userRegionCodes (AF returns names like "Stockholms län").
        string? jobRegionCode = null;
        if (!string.IsNullOrWhiteSpace(jobRegion))
        {
            var jobRegionTrimmed = jobRegion.Trim();
            if (_regionCodes.TryGetValue(jobRegionTrimmed, out var codeFromName))
                jobRegionCode = codeFromName;
            else if (userRegionCodes.Contains(jobRegionTrimmed))
                jobRegionCode = jobRegionTrimmed; // AF may return the code directly
        }

        var isSameMunicipality = !string.IsNullOrWhiteSpace(jobMunicipality)
            && normalizedUserMunicipalities.Contains(jobMunicipality.Trim().ToLowerInvariant());
        var isSameRegion = jobRegionCode != null && userRegionCodes.Contains(jobRegionCode);

        // ── Step 2: "country" preference — open to all of Sweden ────────────
        // City match still wins Grade A; everything else is a B floor.
        if (hasCountry)
        {
            if (hasLocation && isSameMunicipality)
                return (LOCATION_SCORE_SAME_MUNICIPALITY, "same_municipality");
            return (LOCATION_SCORE_NO_PREFERENCE, "country");
        }

        // ── Step 3: No resolvable location + no narrowing pref ──────────────
        // User hasn't told us where they want to work — treat all jobs neutrally.
        if (!hasLocation && !hasNarrowingPref)
            return (LOCATION_SCORE_NO_PREFERENCE, "no_preference");

        // ── Step 4: Geography scoring ────────────────────────────────────────
        // Municipality always wins regardless of pref.
        if (hasLocation && isSameMunicipality)
            return (LOCATION_SCORE_SAME_MUNICIPALITY, "same_municipality");

        // Narrowing pref set but no resolvable location — can't evaluate, treat neutrally.
        if (!hasLocation)
            return (LOCATION_SCORE_NO_PREFERENCE, "no_preference");

        // Same region — score depends on pref.
        if (isSameRegion)
        {
            if (hasNearbyOrRegion)
                return (LOCATION_SCORE_NO_PREFERENCE, "same_region_nearby");  // 2 → Grade B
            if (hasOnlyMy)
                return (LOCATION_SCORE_OUT_OF_REGION, "same_region_strict");  // 0 → Grade C (strict)
            return (LOCATION_SCORE_SAME_REGION, "same_region");               // 1 → Grade C (minor)
        }

        return (LOCATION_SCORE_OUT_OF_REGION, "out_of_region");
    }

    private static (int boost, string[] matchedTerms) ScoreTechBoost(
        JsonElement job, IReadOnlyList<string> normalizedUserTags)
    {
        if (normalizedUserTags.Count == 0) return (0, Array.Empty<string>());

        var headline = job.TryGetProperty("headline", out var hl) ? hl.GetString() ?? "" : "";
        var descText = "";
        if (job.TryGetProperty("description", out var desc) && desc.ValueKind != JsonValueKind.Null)
            descText = desc.TryGetProperty("text", out var dt) ? dt.GetString() ?? "" : "";

        var searchText = $"{headline} {(descText.Length > 2000 ? descText[..2000] : descText)}";

        var jobTokens = System.Text.RegularExpressions.Regex
            .Split(searchText, @"[^\w\.#]+")
            .Where(t => t.Length >= 2)
            .Select(NormalizeTech)
            .Where(t => t.Length >= 2)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var matched = normalizedUserTags.Where(tag => jobTokens.Contains(tag)).ToArray();
        return (matched.Length > 0 ? TECH_BOOST_MATCH : 0, matched);
    }

    private static string AssignGrade(int totalScore) => totalScore switch
    {
        >= GRADE_A_MIN_SCORE => "A",
        GRADE_B_SCORE        => "B",
        _                    => "C",
    };

    private static string NormalizeRoleInput(string input) =>
        input.Trim().ToLowerInvariant().Replace("-", "");

    // Compact form: lowercase and keep only letters and digits — separators removed.
    // Used alongside NormalizeRoleInput to match separator variants like
    // "systemdeveloper", "system developer", "system-developer" against each other.
    private static string NormalizeRoleCompact(string input)
    {
        var sb = new System.Text.StringBuilder(input.Length);
        foreach (var c in input.ToLowerInvariant())
            if (char.IsLetterOrDigit(c)) sb.Append(c);
        return sb.ToString();
    }

    // Two-pass field matcher: compact match first (separator-insensitive),
    // then token/synonym fallback on readable forms.
    // Guard: compact role must be at least 4 chars to avoid false positives on short tokens.
    private static bool RoleMatchesField(
        string readableRole, string compactRole,
        string readableField, string compactField)
    {
        if (compactRole.Length >= 4 &&
            compactField.Contains(compactRole, StringComparison.OrdinalIgnoreCase))
            return true;
        return RoleTokensMatchText(readableRole, readableField);
    }

    private static string NormalizeTech(string token)
    {
        var lower = token.Trim().ToLowerInvariant();
        return _techNormMap.TryGetValue(lower, out var mapped) ? mapped : lower;
    }

    private static string BuildJobResultJson(
        string rawJobJson, string grade,
        int locationScore, string locationTier,
        int techBoost, string[] matchedTechTerms,
        int totalScore, string roleMatchedOn, string roleMatchedValue,
        List<string> reasons)
    {
        using var memStream = new System.IO.MemoryStream();
        using var writer = new Utf8JsonWriter(memStream);
        writer.WriteStartObject();
        using (var jobDoc = JsonDocument.Parse(rawJobJson))
        {
            foreach (var prop in jobDoc.RootElement.EnumerateObject())
            {
                // Skip the full description text: the match endpoint serves list cards.
                // The job detail page fetches the full ad by ID via a separate request.
                if (prop.Name == "description") continue;
                prop.WriteTo(writer);
            }
        }
        writer.WriteString("matchGrade", grade);
        writer.WritePropertyName("matchDebug");
        writer.WriteStartObject();
        writer.WriteNumber("locationScore", locationScore);
        writer.WriteString("locationTier", locationTier);
        writer.WriteNumber("techBoost", techBoost);
        writer.WritePropertyName("matchedTechTerms");
        writer.WriteStartArray();
        foreach (var t in matchedTechTerms) writer.WriteStringValue(t);
        writer.WriteEndArray();
        writer.WriteNumber("totalScore", totalScore);
        writer.WriteString("scoreBreakdown", $"location({locationScore}) + tech({techBoost}) = {totalScore}");
        writer.WriteString("roleMatchedOn", roleMatchedOn);
        writer.WriteString("roleMatchedValue", roleMatchedValue);
        writer.WritePropertyName("reasons");
        writer.WriteStartArray();
        foreach (var r in reasons) writer.WriteStringValue(r);
        writer.WriteEndArray();
        writer.WriteEndObject();
        writer.WriteEndObject();
        writer.Flush();
        return System.Text.Encoding.UTF8.GetString(memStream.ToArray());
    }

    /// <summary>
    /// Writes the "thresholds" property (including scoringKey) to the provided writer.
    /// Single source of truth — update the constants at the top of the class to change values.
    /// </summary>
    private static void WriteThresholds(Utf8JsonWriter writer)
    {
        writer.WritePropertyName("thresholds");
        writer.WriteStartObject();
        writer.WriteString("A", $"totalScore >= {GRADE_A_MIN_SCORE}");
        writer.WriteString("B", $"totalScore == {GRADE_B_SCORE}");
        writer.WriteString("C", $"totalScore <= {GRADE_B_SCORE - 1}");
        writer.WritePropertyName("scoringKey");
        writer.WriteStartObject();
        writer.WriteNumber("same_municipality", LOCATION_SCORE_SAME_MUNICIPALITY);
        writer.WriteNumber("same_region",       LOCATION_SCORE_SAME_REGION);
        writer.WriteNumber("remote",            LOCATION_SCORE_REMOTE);
        writer.WriteNumber("out_of_region",     LOCATION_SCORE_OUT_OF_REGION);
        writer.WriteNumber("no_preference",     LOCATION_SCORE_NO_PREFERENCE);
        writer.WriteString("tech_boost",
            $"+{TECH_BOOST_MATCH} when any profile tag appears in job headline or description (first 2000 chars)");
        writer.WriteEndObject();
        writer.WriteEndObject();
    }

    private static string BuildMatchResponseJson(
        List<string> jobJsons, int totalMatched, int limitApplied,
        bool fetchComplete, int totalAfJobs,
        string desiredRolesSource,
        MatchProfileRequest profile, IReadOnlyList<string> activeRoles)
    {
        using var memStream = new System.IO.MemoryStream();
        using var writer = new Utf8JsonWriter(memStream);
        writer.WriteStartObject();

        writer.WritePropertyName("matched");
        writer.WriteStartArray();
        foreach (var j in jobJsons)
        {
            using var jd = JsonDocument.Parse(j);
            jd.RootElement.WriteTo(writer);
        }
        writer.WriteEndArray();

        // stats lets callers see whether the cap or the filter was the bottleneck.
        writer.WritePropertyName("stats");
        writer.WriteStartObject();
        writer.WriteNumber("returned", jobJsons.Count);
        writer.WriteNumber("totalMatched", totalMatched);
        writer.WriteNumber("limit", limitApplied);
        writer.WriteBoolean("fetchComplete", fetchComplete);
        writer.WriteNumber("totalAfJobs", totalAfJobs);
        writer.WriteEndObject();

        WriteThresholds(writer);

        writer.WritePropertyName("profileUsed");
        writer.WriteStartObject();
        writer.WritePropertyName("roles");
        writer.WriteStartArray();
        foreach (var r in activeRoles) writer.WriteStringValue(r);
        writer.WriteEndArray();
        writer.WriteString("title", profile.Title);
        writer.WritePropertyName("tags");
        writer.WriteStartArray();
        foreach (var t in profile.Tags ?? Array.Empty<string>()) writer.WriteStringValue(t);
        writer.WriteEndArray();
        writer.WriteString("location", profile.Location);
        writer.WritePropertyName("locationPreferences");
        writer.WriteStartArray();
        foreach (var lp in profile.LocationPreferences ?? Array.Empty<string>()) writer.WriteStringValue(lp);
        writer.WriteEndArray();
        writer.WriteString("desiredRolesSource", desiredRolesSource);
        writer.WriteEndObject();

        writer.WriteEndObject();
        writer.Flush();
        return System.Text.Encoding.UTF8.GetString(memStream.ToArray());
    }

    private static object BuildEmptyMatchResponse(
        string desiredRolesSource, MatchProfileRequest profile, IReadOnlyList<string> activeRoles) =>
        new
        {
            matched = Array.Empty<object>(),
            thresholds = new
            {
                A = $"totalScore >= {GRADE_A_MIN_SCORE}",
                B = $"totalScore == {GRADE_B_SCORE}",
                C = $"totalScore <= {GRADE_B_SCORE - 1}",
            },
            profileUsed = new
            {
                roles = activeRoles.ToArray(),
                title = profile.Title,
                tags = profile.Tags ?? Array.Empty<string>(),
                location = profile.Location,
                locationPreferences = profile.LocationPreferences ?? Array.Empty<string>(),
                desiredRolesSource,
            },
        };
}

public class MatchProfileRequest
{
    public string[]? Roles { get; set; }
    public string? Title { get; set; }
    public string[]? Tags { get; set; }
    public string? Location { get; set; }
    public string[]? LocationPreferences { get; set; }
}
