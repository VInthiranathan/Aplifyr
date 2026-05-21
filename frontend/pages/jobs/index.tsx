import { useState, useEffect, useCallback, useRef } from "react";
import type { GetStaticProps } from "next";
import type { ExternalJob, AFSearchResult } from "../../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import {
  Search,
  MapPin,
  Wifi,
  Briefcase,
  ExternalLink,
  Loader2,
  Bookmark,
} from "lucide-react";
import { formatLocation } from "../../lib/utils";
import Link from "next/link";
import { useFavorites } from "../../lib/useFavorites";

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? "en", ["common"])) },
});

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

interface Filters {
  q: string;
  cities: string[];
  regions: string[];
  remote: boolean;
  employmentType: string;
}

type MatchGradeFilter = "ALL" | "A" | "B" | "C" | "A_C";

type CategoryFilter =
  | "ALL"
  | "IT"
  | "EKONOMI"
  | "FORSALJNING"
  | "KUNDSERVICE"
  | "TEKNIK"
  | "BYGG"
  | "VARD"
  | "UTBILDNING"
  | "TRANSPORT"
  | "LAGER"
  | "ADMINISTRATION"
  | "RESTAURANG"
  | "INDUSTRI"
  | "OVRIGT";

const CATEGORY_OPTIONS = [
  { value: "ALL" as const, label: "Alla kategorier" },
  { value: "IT" as const, label: "IT" },
  { value: "EKONOMI" as const, label: "Ekonomi" },
  { value: "FORSALJNING" as const, label: "Försäljning" },
  { value: "KUNDSERVICE" as const, label: "Kundservice" },
  { value: "TEKNIK" as const, label: "Teknik" },
  { value: "BYGG" as const, label: "Bygg" },
  { value: "VARD" as const, label: "Vård" },
  { value: "UTBILDNING" as const, label: "Utbildning" },
  { value: "TRANSPORT" as const, label: "Transport" },
  { value: "LAGER" as const, label: "Lager" },
  { value: "ADMINISTRATION" as const, label: "Administration" },
  { value: "RESTAURANG" as const, label: "Restaurang" },
  { value: "INDUSTRI" as const, label: "Industri" },
  { value: "OVRIGT" as const, label: "Övrigt" },
];

const CATEGORY_KEYWORDS: Record<Exclude<CategoryFilter, "ALL">, string[]> = {
  IT: [
    "developer",
    "utvecklare",
    "frontend",
    "backend",
    "fullstack",
    "react",
    "javascript",
    "c#",
    "systemutvecklare",
    "programmerare",
    "mjukvara",
    "software",
    "devops",
    "java",
    "python",
    ".net",
    "web",
    "app",
    "data",
    "IT",
  ],
  EKONOMI: [
    "ekonomi",
    "ekonom",
    "redovisning",
    "bokföring",
    "accountant",
    "controller",
    "revisor",
    "finance",
  ],
  FORSALJNING: [
    "säljare",
    "sales",
    "account manager",
    "försäljning",
    "sälj",
    "business",
  ],
  KUNDSERVICE: [
    "kundtjänst",
    "support",
    "customer service",
    "kundsupport",
    "kundservice",
  ],
  TEKNIK: ["ingenjör", "tekniker", "engineer", "teknisk", "teknik"],
  BYGG: [
    "bygg",
    "byggare",
    "snickare",
    "elektriker",
    "vvs",
    "construction",
    "anläggning",
  ],
  VARD: [
    "sjuksköterska",
    "läkare",
    "undersköterska",
    "vård",
    "omvårdnad",
    "nurse",
    "healthcare",
  ],
  UTBILDNING: ["lärare", "teacher", "pedagog", "utbildning", "skola"],
  TRANSPORT: ["transport", "förare", "chaufför", "driver", "bud"],
  LAGER: ["lager", "truckförare", "logistik", "warehouse", "truck"],
  ADMINISTRATION: [
    "administration",
    "administratör",
    "admin",
    "sekreterare",
    "kontorsassistent",
  ],
  RESTAURANG: [
    "servitör",
    "kock",
    "bartender",
    "restaurang",
    "kök",
    "bar",
    "café",
  ],
  INDUSTRI: ["industri", "fabrik", "produktion", "tillverkning", "operatör"],
  OVRIGT: [],
};

const EMPLOYMENT_OPTIONS = [
  { value: "", label: "Alla anställningstyper" },
  { value: "Tillsvidare", label: "Tillsvidare" },
  { value: "Vikariat", label: "Vikariat" },
  { value: "Projektanställning", label: "Projektanställning" },
  { value: "Provanställning", label: "Provanställning" },
  { value: "Timanställning", label: "Timanställning" },
];

const STATIC_REGIONS = [
  "Stockholm",
  "Västra Götaland",
  "Skåne",
  "Uppsala",
  "Västmanland",
  "Östergötland",
  "Värmland",
  "Jönköping",
  "Kronoberg",
  "Kalmar",
  "Blekinge",
  "Gotland",
  "Halland",
  "Norrbotten",
  "Västerbotten",
  "Västernorrland",
  "Södermanland",
  "Dalarna",
  "Gävleborg",
];

const STATIC_CITY_TO_REGION: Record<string, string> = {
  Malmö: "Skåne",
  Lund: "Skåne",
  Helsingborg: "Skåne",
  Göteborg: "Västra Götaland",
  Gothenburg: "Västra Götaland",
  Stockholm: "Stockholm",
  Uppsala: "Uppsala",
  Västerås: "Västmanland",
  Linköping: "Östergötland",
  Norrköping: "Östergötland",
};

type TagInputProps = {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  id?: string;
};

function TagInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
  id,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const add = (val: string) => {
    const v = val.trim();
    if (!v) return;
    if (values.includes(v)) return;
    onChange([...values, v]);
    setInput("");
  };

  const remove = (idx: number) => {
    const next = [...values];
    next.splice(idx, 1);
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && input === "" && values.length > 0) {
      remove(values.length - 1);
    }
  };

  return (
    <div className="min-w-[220px]">
      <div className="w-full bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 flex items-center gap-2 flex-wrap">
        {values.map((v, i) => (
          <span
            key={v + i}
            className="bg-slate-100 dark:bg-white/5 text-xs text-slate-700 dark:text-white/70 px-2 py-0.5 rounded-full flex items-center gap-2"
          >
            <span className="max-w-[140px] truncate">{v}</span>
            <button
              onClick={() => remove(i)}
              className="text-slate-400 hover:text-red-500 ml-1"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          list={suggestions.length ? `${id}-list` : undefined}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(input)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none p-1 text-sm text-slate-900 dark:text-white"
        />
        {suggestions.length > 0 && (
          <datalist id={`${id}-list`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}

export default function AllJobsPage() {
  const { toggleFavorite, isFavorite } = useFavorites();

  const [filters, setFilters] = useState<Filters>({
    q: "",
    cities: [],
    regions: [],
    remote: false,
    employmentType: "",
  });
  const [selectedMatchGrade, setSelectedMatchGrade] =
    useState<MatchGradeFilter>("ALL");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>("ALL");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const [regionSuggestions, setRegionSuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [regionCityMap, setRegionCityMap] = useState<Record<string, string[]>>(
    {},
  );
  const [displayedCitySuggestions, setDisplayedCitySuggestions] = useState<
    string[]
  >([]);
  const [total, setTotal] = useState(0);
  const [generatedLetters, setGeneratedLetters] = useState<
    Array<{ title: string; coverLetter?: string; error?: string }>
  >([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  // Debounce search query 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(filters.q);
      setOffset(0);
    }, 400);
    return () => clearTimeout(t);
  }, [filters.q]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      // Support multiple cities and regions
      if (filters.cities?.length) {
        filters.cities.forEach((c) => params.append("cities", c));
      }
      if (filters.regions?.length) {
        filters.regions.forEach((r) => params.append("regions", r));
      }
      if (filters.remote) params.set("remote", "true");
      if (filters.employmentType) {
        params.set("employmentType", filters.employmentType);
      }
      params.set("limit", String(LIMIT));
      params.set("offset", String(offset));

      const res = await fetch(`${BACKEND}/api/externaljobs?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: AFSearchResult = await res.json();
      setJobs(data.hits ?? []);
      setTotal(data.total?.value ?? 0);
    } catch (e) {
      setError("Kunde inte hämta jobb. Kontrollera att backend körs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [
    debouncedQ,
    filters.cities,
    filters.regions,
    filters.remote,
    filters.employmentType,
    offset,
  ]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Fetch available regions/cities for suggestions from backend jobs endpoint
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/jobs`);
        if (!res.ok) return;
        const data = await res.json();
        const items: any[] = data?.jobs ?? data?.hits ?? [];
        const regions = new Set<string>();
        const cities = new Set<string>();
        const rcMap = new Map<string, Set<string>>();
        for (const it of items) {
          const wa = it.workplace_address;
          if (wa) {
            if (wa.region) regions.add(wa.region);
            if (wa.municipality) {
              cities.add(wa.municipality);
              if (wa.region) {
                const s = rcMap.get(wa.region) ?? new Set<string>();
                s.add(wa.municipality);
                rcMap.set(wa.region, s);
              } else {
                const inferred = STATIC_CITY_TO_REGION[wa.municipality];
                if (inferred) {
                  regions.add(inferred);
                  const s = rcMap.get(inferred) ?? new Set<string>();
                  s.add(wa.municipality);
                  rcMap.set(inferred, s);
                }
              }
            }
          }
          if (it.region) regions.add(it.region);
          if (it.municipality) {
            cities.add(it.municipality);
            if (it.region) {
              const s = rcMap.get(it.region) ?? new Set<string>();
              s.add(it.municipality);
              rcMap.set(it.region, s);
            } else {
              const inferred = STATIC_CITY_TO_REGION[it.municipality];
              if (inferred) {
                regions.add(inferred);
                const s = rcMap.get(inferred) ?? new Set<string>();
                s.add(it.municipality);
                rcMap.set(inferred, s);
              }
            }
          }
          if (it.location) {
            cities.add(it.location);
            const inferred = STATIC_CITY_TO_REGION[it.location];
            if (inferred) {
              regions.add(inferred);
              const s = rcMap.get(inferred) ?? new Set<string>();
              s.add(it.location);
              rcMap.set(inferred, s);
            }
          }
        }
        if (!mounted) return;
        const derivedRegions = Array.from(regions).filter(Boolean);
        const mergedRegions = Array.from(
          new Set([...STATIC_REGIONS, ...derivedRegions]),
        );
        setRegionSuggestions(mergedRegions);
        const allCities = Array.from(cities).filter(Boolean);
        setCitySuggestions(allCities);
        // convert rcMap to plain object
        const rcObj: Record<string, string[]> = {};
        for (const [k, s] of rcMap.entries())
          rcObj[k] = Array.from(s).filter(Boolean);
        setRegionCityMap(rcObj);
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Update displayed city suggestions based on selected regions
  useEffect(() => {
    if (!filters.regions || filters.regions.length === 0) {
      setDisplayedCitySuggestions(citySuggestions);
      return;
    }
    const sel = new Set<string>();
    for (const r of filters.regions) {
      const list = regionCityMap[r];
      if (list) for (const c of list) sel.add(c);
    }
    // if selection produced nothing, fallback to all cities
    const out = sel.size ? Array.from(sel) : citySuggestions;
    setDisplayedCitySuggestions(out);
  }, [filters.regions, regionCityMap, citySuggestions]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
  };

  // Determine job category based on keywords
  const determineCategory = (job: ExternalJob): CategoryFilter => {
    const searchText =
      `${job.headline} ${job.description?.text ?? ""}`.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => searchText.includes(kw.toLowerCase()))) {
        return category as CategoryFilter;
      }
    }
    return "OVRIGT";
  };

  // Filter jobs by match grade
  const filterByMatchGrade = (jobList: ExternalJob[]): ExternalJob[] => {
    if (selectedMatchGrade === "ALL") return jobList;
    if (selectedMatchGrade === "A_C") {
      return jobList.filter(
        (j) =>
          j.matchGrade === "A" || j.matchGrade === "B" || j.matchGrade === "C",
      );
    }
    return jobList.filter((j) => j.matchGrade === selectedMatchGrade);
  };

  // Filter jobs by category
  const filterByCategory = (jobList: ExternalJob[]): ExternalJob[] => {
    if (selectedCategory === "ALL") return jobList;
    return jobList.filter((j) => determineCategory(j) === selectedCategory);
  };

  // Apply all filters
  const filteredJobs = filterByCategory(filterByMatchGrade(jobs));

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const generateJob = async (job: ExternalJob) => {
    if (!job) return;
    setGeneratingId(job.id);
    try {
      const res = await fetch(`${BACKEND}/api/coverletters/generate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([job]),
      });
      if (!res.ok) {
        const t = await res.json().catch(() => null);
        throw new Error(t?.error ?? `Status ${res.status}`);
      }
      const data = await res.json();
      setGeneratedLetters((prev) => [...prev, ...(data ?? [])]);
    } catch (e) {
      setGeneratedLetters((prev) => [...prev, { title: job.headline ?? 'Fel', error: (e as Error).message }])
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Alla jobb
        </h1>
        <div className="flex items-center gap-3">
          {!loading && filteredJobs.length > 0 && (
            <span className="text-slate-400 dark:text-white/40 text-sm">
              {filteredJobs.length !== total ? (
                <>
                  {filteredJobs.length.toLocaleString("sv-SE")} av{" "}
                  {total.toLocaleString("sv-SE")} annonser
                </>
              ) : (
                <>{total.toLocaleString("sv-SE")} annonser</>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30"
          />
          <input
            type="text"
            placeholder="Sök titel, kompetens…"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            className="w-full bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500/50"
          />
        </div>

        {/* Employment type (select) */}
        <div className="relative min-w-[180px]">
          <Briefcase
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30"
          />
          <select
            value={filters.employmentType}
            onChange={(e) => update({ employmentType: e.target.value })}
            className="w-full bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-600 dark:text-white/70 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500/50 appearance-none"
          >
            {EMPLOYMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Remote toggle */}
        <button
          onClick={() => update({ remote: !filters.remote })}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-colors ${
            filters.remote
              ? "bg-purple-500/20 border-purple-500/50 text-purple-600 dark:text-purple-300"
              : "bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Wifi size={15} />
          Remote
        </button>
      </div>

      {/* ── Category Filter ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-slate-500 dark:text-white/50 mr-1">
          Kategori:
        </span>

        {CATEGORY_OPTIONS.slice(0, 8).map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedCategory === cat.value
                ? "bg-purple-600 dark:bg-purple-600/90 text-white border-2 border-purple-600 dark:border-purple-500"
                : "bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-purple-300 dark:hover:border-purple-500/30"
            }`}
          >
            {cat.label}
          </button>
        ))}

        {/* Dropdown for remaining categories */}
        <select
          value={
            CATEGORY_OPTIONS.slice(0, 8).some(
              (c) => c.value === selectedCategory,
            )
              ? "more"
              : selectedCategory
          }
          onChange={(e) => {
            if (e.target.value !== "more") {
              setSelectedCategory(e.target.value as CategoryFilter);
            }
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:border-purple-300 dark:hover:border-purple-500/30 transition-all cursor-pointer"
        >
          <option value="more">Fler...</option>
          {CATEGORY_OPTIONS.slice(8).map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>

        {selectedCategory !== "ALL" && (
          <button
            onClick={() => setSelectedCategory("ALL")}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            Rensa kategori
          </button>
        )}

        {(selectedMatchGrade !== "ALL" || selectedCategory !== "ALL") && (
          <button
            onClick={() => {
              setSelectedMatchGrade("ALL");
              setSelectedCategory("ALL");
            }}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-800/60 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
          >
            ✕ Rensa alla filter
          </button>
        )}
      </div>

      {/* Region & City row (multi-select / tags) */}
      <div className="flex flex-wrap gap-3 mt-3">
        <div className="relative min-w-[220px]">
          <MapPin
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30"
          />
          <TagInput
            id="regions"
            values={filters.regions}
            onChange={(v) => update({ regions: v })}
            placeholder="Region / Län (välj eller skriv...)"
            suggestions={regionSuggestions}
          />
        </div>

        <div className="relative min-w-[220px]">
          <MapPin
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30"
          />
          <TagInput
            id="cities"
            values={filters.cities}
            onChange={(v) => update({ cities: v })}
            placeholder="Stad / Kommun (välj eller skriv...)"
            suggestions={displayedCitySuggestions}
          />
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400 dark:text-white/40">
          <Loader2 size={24} className="animate-spin mr-3" />
          Hämtar annonser…
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-500 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && filteredJobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-300 dark:text-white/30">
          <Briefcase size={40} className="mb-3 opacity-30" />
          <p className="text-sm">
            Inga jobb hittades. Prova andra sökord eller filter.
          </p>
        </div>
      )}

      {/* ── Job cards ── */}
      {!loading && filteredJobs.length > 0 && (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-slate-200 dark:border-white/5 hover:border-purple-300 dark:hover:border-purple-500/20 transition-colors group shadow-sm dark:shadow-none"
            >
              <div className="flex items-start gap-4">
                {/* Logo placeholder */}
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex-shrink-0 flex items-center justify-center text-slate-300 dark:text-white/20 overflow-hidden">
                  {job.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={job.logo_url}
                      alt=""
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <Briefcase size={18} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="hover:underline"
                        >
                          {job.headline}
                        </Link>
                      </h2>
                      {job.matchGrade && (
                        <span
                          className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            job.matchGrade === "A"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800/50"
                              : job.matchGrade === "B"
                                ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800/50"
                                : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800/50"
                          }`}
                        >
                          {job.matchGrade} Match
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite({
                            id: job.id,
                            title: job.headline,
                            company: job.employer?.name,
                            location: formatLocation(job.workplace_address),
                            matchGrade: job.matchGrade,
                          });
                        }}
                        className={`flex-shrink-0 transition-colors ${
                          isFavorite(job.id)
                            ? "text-purple-500 dark:text-purple-400"
                            : "text-slate-300 dark:text-white/20 hover:text-purple-500 dark:hover:text-purple-400"
                        }`}
                        title={
                          isFavorite(job.id)
                            ? "Ta bort från favoriter"
                            : "Lägg till i favoriter"
                        }
                      >
                        <Bookmark
                          size={15}
                          fill={isFavorite(job.id) ? "currentColor" : "none"}
                        />
                      </button>
                      {job.webpage_url && (
                        <a
                          href={job.webpage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-slate-300 dark:text-white/20 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
                        >
                          <ExternalLink size={15} />
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-white/50 mt-0.5">
                    {job.employer?.name}
                  </p>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {(job.workplace_address?.municipality ||
                      job.workplace_address?.region) && (
                      <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-white/40">
                        <MapPin size={11} />
                        {formatLocation(job.workplace_address)}
                      </span>
                    )}
                    {job.remote && (
                      <span className="flex items-center gap-1 text-xs text-purple-500 dark:text-purple-400">
                        <Wifi size={11} />
                        Remote
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {job.working_hours_type?.label && (
                  <span className="text-xs border border-slate-200 dark:border-white/10 text-slate-400 dark:text-white/40 rounded-full px-3 py-0.5">
                    {job.working_hours_type.label}
                  </span>
                )}
                {job.employment_type?.label && (
                  <span className="text-xs border border-slate-200 dark:border-white/10 text-slate-400 dark:text-white/40 rounded-full px-3 py-0.5">
                    {job.employment_type.label}
                  </span>
                )}
                {job.application_deadline && (
                  <span className="ml-auto text-xs text-slate-300 dark:text-white/25">
                    Sista ansökningsdag:{" "}
                    {new Date(job.application_deadline).toLocaleDateString(
                      "sv-SE",
                    )}
                  </span>
                )}
                {/* Generera brev tas bort från listvyn; finns endast på jobbsidan */}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Generated letters ── */}
      {generatedLetters.length > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold">Genererade personliga brev</h3>
          {generatedLetters.map((g, i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/5 rounded-xl p-4"
            >
              <div className="text-xs text-slate-500 dark:text-white/50 mb-2">
                {g.title}
              </div>
              {g.error ? (
                <div className="text-red-500 text-sm">Fel: {g.error}</div>
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-white">
                  {g.coverLetter}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="px-4 py-2 rounded-xl bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 text-sm text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors shadow-sm dark:shadow-none"
          >
            ← Föregående
          </button>
          <span className="text-sm text-slate-400 dark:text-white/40">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={currentPage >= totalPages}
            className="px-4 py-2 rounded-xl bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 text-sm text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors shadow-sm dark:shadow-none"
          >
            Nästa →
          </button>
        </div>
      )}
    </div>
  );
}
