using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using System.Net;
using System.Text.Json;

namespace Examensarbete.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExternalJobsController : ControllerBase
{
    private static readonly HttpClient _http = new();
    private readonly IMemoryCache _cache;

    public ExternalJobsController(IMemoryCache cache)
    {
        _cache = cache;
    }

    private const string AF_BASE = "https://jobsearch.api.jobtechdev.se";
    private const string AF_SEARCH_PATH = "search";
    private const string AF_AD_PATH = "ad";
    private const int AF_STATS_LIMIT = 30;

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

    // ── Grade thresholds ─────────────────────────────────────────────────────
    private const int GRADE_A_MIN_SCORE = 3; // totalScore >= GRADE_A_MIN_SCORE → "A"
    private const int GRADE_B_SCORE     = 2; // totalScore == GRADE_B_SCORE     → "B"
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

    // ─────────────────────────── Matched jobs endpoint ───────────────────────────

    [HttpPost("match")]
    public async Task<IActionResult> Match(
        [FromBody] MatchProfileRequest? profile,
        [FromQuery] int limit = DEFAULT_MATCH_RESPONSE_LIMIT,
        [FromQuery] int afOffset = 0)
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
        var cacheKey = BuildMatchCacheKey(
            normalizedDesiredRoles, normalizedUserTags,
            normalizedUserMunicipalities, userRegionCodes, normalizedLocationPrefs,
            afOffset);

        // Fast path: serve from in-memory cache when the same normalised profile was
        // requested recently (TTL = 5 min). Avoids an AF round-trip on every Home
        // revisit or "View more" expansion.
        if (_cache.TryGetValue(cacheKey, out List<string>? cachedSortedJobs) && cachedSortedJobs != null)
        {
            var cachedSlice = cachedSortedJobs.Take(effectiveLimit).ToList();
            var cachedJson = BuildMatchResponseJson(cachedSlice, cachedSortedJobs.Count, effectiveLimit, desiredRolesSource, profile, activeRoles);
            return Content(cachedJson, "application/json");
        }

        // Fetch jobs from AF using active roles as the query
        var searchTerm = string.Join(" ", activeRoles);
        var qs = System.Web.HttpUtility.ParseQueryString(string.Empty);
        qs["q"] = searchTerm;
        qs["limit"] = MATCH_UPSTREAM_FETCH_LIMIT.ToString();
        qs["offset"] = Math.Max(0, afOffset).ToString();

        string rawContent;
        try
        {
            var afResp = await _http.GetAsync($"{AF_BASE}/{AF_SEARCH_PATH}?{qs}");
            rawContent = await afResp.Content.ReadAsStringAsync();
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = "Could not reach Arbetsförmedlingen API", detail = ex.Message });
        }

        var matchResults = new List<(int GradeOrder, int TotalScore, string Json)>();

        try
        {
            using var doc = JsonDocument.Parse(rawContent);
            if (!doc.RootElement.TryGetProperty("hits", out var hitsEl) || hitsEl.ValueKind != JsonValueKind.Array)
                return Ok(BuildEmptyMatchResponse(desiredRolesSource, profile, activeRoles));

            foreach (var hit in hitsEl.EnumerateArray())
            {
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
                matchResults.Add((gradeOrder, totalScore, jobJson));
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Error processing job results", detail = ex.Message });
        }

        // Sort the full result set and cache it so subsequent requests for the same
        // profile (e.g., "View more" on Home) are served without an AF round-trip.
        var fullSortedJsonJobs = matchResults
            .OrderBy(r => r.GradeOrder)
            .ThenByDescending(r => r.TotalScore)
            .Select(r => r.Json)
            .ToList();

        _cache.Set(cacheKey, fullSortedJsonJobs, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
        });

        var sortedJsonJobs = fullSortedJsonJobs.Take(effectiveLimit).ToList();
        var responseJson = BuildMatchResponseJson(sortedJsonJobs, matchResults.Count, effectiveLimit, desiredRolesSource, profile, activeRoles);
        return Content(responseJson, "application/json");
    }

    // ─────────────────────── Matching helpers ───────────────────────

    private static string BuildMatchCacheKey(
        IReadOnlyList<string> normalizedRoles,
        IReadOnlyList<string> normalizedTags,
        HashSet<string> normalizedMunicipalities,
        HashSet<string> regionCodes,
        HashSet<string> locationPrefs,
        int afOffset = 0)
    {
        var roles  = string.Join("|", normalizedRoles.Order());
        var tags   = string.Join("|", normalizedTags.Order());
        var munis  = string.Join("|", normalizedMunicipalities.Order());
        var regs   = string.Join("|", regionCodes.Order());
        var prefs  = string.Join("|", locationPrefs.Order());
        return $"match:r={roles};t={tags};m={munis};rg={regs};p={prefs};o={afOffset}";
    }

    private static (bool matched, string matchedOn, string matchedValue) CheckRoleInclusion(
        JsonElement job, IReadOnlyList<string> normalizedDesiredRoles)
    {
        // Check occupation.label (highest priority)
        if (job.TryGetProperty("occupation", out var occ) && occ.ValueKind != JsonValueKind.Null &&
            occ.TryGetProperty("label", out var ol) && ol.ValueKind == JsonValueKind.String)
        {
            var label = ol.GetString()!;
            var normLabel = NormalizeRoleInput(label);
            foreach (var role in normalizedDesiredRoles)
            {
                if (RoleTokensMatchText(role, normLabel))
                    return (true, "occupation.label", label);
            }
        }

        // Check occupation_group.label
        if (job.TryGetProperty("occupation_group", out var og) && og.ValueKind != JsonValueKind.Null &&
            og.TryGetProperty("label", out var ogl) && ogl.ValueKind == JsonValueKind.String)
        {
            var label = ogl.GetString()!;
            var normLabel = NormalizeRoleInput(label);
            foreach (var role in normalizedDesiredRoles)
            {
                if (RoleTokensMatchText(role, normLabel))
                    return (true, "occupation_group.label", label);
            }
        }

        // Check headline
        if (job.TryGetProperty("headline", out var hl) && hl.ValueKind == JsonValueKind.String)
        {
            var headline = hl.GetString()!;
            var normHeadline = NormalizeRoleInput(headline);
            foreach (var role in normalizedDesiredRoles)
            {
                if (RoleTokensMatchText(role, normHeadline))
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
        var tokens = normalizedRole
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length >= 3) // skip very short filler words
            .ToArray();

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
