namespace Aplifyr.Api.Jobs;

// Stable upstream vocabulary and scoring defaults; no request or cache state.
internal static class JobSearchCatalog
{
    internal const string AF_BASE = "https://jobsearch.api.jobtechdev.se";
    internal const string AF_SEARCH_PATH = "search";
    internal const string AF_AD_PATH = "ad";
    internal const int AF_STATS_LIMIT = 30;
    internal const string MATCH_QUERY_STRATEGY_VERSION = "3";

    // ── Match defaults ────────────────────────────────────────────────────────
    // Change DEFAULT_MATCH_RESPONSE_LIMIT to adjust how many matched jobs
    // are returned by default. Home inherits this because it sends no ?limit=.
    internal const int DEFAULT_MATCH_RESPONSE_LIMIT = 50;
    // Raw AF hits fetched before role/location/tech filtering.
    internal const int MATCH_UPSTREAM_FETCH_LIMIT   = 100;

    // ── Location tier scores ──────────────────────────────────────────────────
    internal const int LOCATION_SCORE_SAME_MUNICIPALITY = 3;  // exact city → Grade A
    internal const int LOCATION_SCORE_SAME_REGION       = 1;  // base; prefs can raise/lower
    internal const int LOCATION_SCORE_REMOTE            = 3;  // remote + remote pref → Grade A
    internal const int LOCATION_SCORE_NO_PREFERENCE     = 2;  // neutral → Grade B
    internal const int LOCATION_SCORE_OUT_OF_REGION     = 0;  // outside → Grade C

    // ── Tech boost ────────────────────────────────────────────────────────────
    internal const int TECH_BOOST_MATCH = 1;

    // ── Grade thresholds ─────────────────────────────────────────────────────
    internal const int GRADE_A_MIN_SCORE = 3; // totalScore >= GRADE_A_MIN_SCORE → "A"
    internal const int GRADE_B_SCORE     = 1; // totalScore >= GRADE_B_SCORE     → "B"
    //                                           anything below GRADE_B_SCORE   → "C"

    // Static mapping of Swedish region display names → 2-digit SCB/AF codes.
    // These codes are stable (they match SCB's Länskoder) and never require a
    // live stats-endpoint lookup. Both short names and "X län" variants are included.
    internal static readonly Dictionary<string, string> _regionCodes = new(StringComparer.OrdinalIgnoreCase)
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

    internal static readonly Dictionary<string, string> _employmentTypeCodes = new(StringComparer.OrdinalIgnoreCase)
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
    internal static readonly Dictionary<string, string> _municipalityToRegion = new(StringComparer.OrdinalIgnoreCase)
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
    internal static readonly Dictionary<string, string> _techNormMap = new(StringComparer.OrdinalIgnoreCase)
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
    internal static readonly Dictionary<string, string> _roleSynonyms = new(StringComparer.OrdinalIgnoreCase)
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

    internal static readonly string[] _compactRoleSearchSuffixes = _roleSynonyms.Keys
        .Where(key => key.Length >= 4)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderByDescending(key => key.Length)
        .ToArray();

}
