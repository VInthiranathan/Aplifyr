import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { GetServerSideProps } from "next";
import type { ExternalJob, AFSearchResult } from "../../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import employmentOptionsData from "../../data/employment_types.json";
import municipalitiesByRegion from "../../data/municipalities_by_region.json";
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
import { getPublicBackendUrl } from "../../lib/backendUrl";
import Link from "next/link";
import { useRouter } from "next/router";
import JobListCard from "../../components/JobListCard";
import { Button } from "../../components/ui/button";
import { useFavorites } from "../../lib/useFavorites";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? "en", ["common"])) },
});

const BACKEND = getPublicBackendUrl();

interface Filters {
  q: string;
  municipalities: string[];
  regions: string[];
  occupationCodes: string[];
  remote: boolean;
  employmentType: string;
}

type OccupationOption = {
  codes: string[];
  label: string;
  count: number;
};

type EmploymentOption = {
  value: string;
  label: string;
};

const EMPLOYMENT_OPTIONS = employmentOptionsData as EmploymentOption[];
const REGION_CITY_MAP = municipalitiesByRegion as Record<string, string[]>;
const REGION_SUGGESTIONS = Object.keys(REGION_CITY_MAP);

export default function AllJobsPage() {
  const { t } = useTranslation("common");
  const { locale } = useRouter();
  const { toggleFavorite, isFavorite } = useFavorites();
  const localeTag = locale === "sv" ? "sv-SE" : "en-US";
  const employmentOptions = useMemo(
    () =>
      EMPLOYMENT_OPTIONS.map((option) => ({
        ...option,
        label: option.value === "" ? t("jobs.allTypes") : option.label,
      })),
    [t],
  );

  const [filters, setFilters] = useState<Filters>({
    q: "",
    municipalities: [],
    regions: [],
    occupationCodes: [],
    remote: false,
    employmentType: "",
  });
  const [occupationOptions, setOccupationOptions] = useState<OccupationOption[]>([]);
  const [selectedOccupationLabel, setSelectedOccupationLabel] = useState("");
  const [showLocationPanel, setShowLocationPanel] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const requestIdRef = useRef(0);
  const locationPanelRef = useRef<HTMLDivElement | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    if (!showLocationPanel) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (
        locationPanelRef.current &&
        !locationPanelRef.current.contains(event.target as Node)
      ) {
        setShowLocationPanel(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showLocationPanel]);

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
    const reqId = ++requestIdRef.current;
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      // Send regions and municipalities (if any). Backend now supports
      // resolving multiple municipality params to AF codes, so always send
      // both when selected. This ensures AF does server-side filtering and
      // pagination is consistent (no empty pages before results).
      if (filters.regions?.length) {
        filters.regions.forEach((r) => params.append("region", r));
      }
      if (filters.municipalities?.length) {
        filters.municipalities.forEach((m) => params.append("municipality", m));
      }
      if (filters.remote) params.set("remote", "true");
      if (filters.employmentType) {
        params.set("employmentType", filters.employmentType);
      }
      if (filters.occupationCodes.length > 0) {
        filters.occupationCodes.forEach((occupationCode) =>
          params.append("occupation", occupationCode),
        );
      }
      params.set("limit", String(LIMIT));
      params.set("offset", String(offset));

      const requestUrl = `${BACKEND}/api/externaljobs?${params}`;
      const res = await fetch(requestUrl);
      const text = await res.text();
      // Ignore stale responses
      if (reqId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(`${res.status}`);
      let data: AFSearchResult | any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      const hits: ExternalJob[] = (data && (data.hits ?? data.jobs)) || [];
      const serverTotal = (data && (data.total?.value ?? data.total)) ?? hits.length;

      // If this response is stale (a newer request started), ignore it.
      if (reqId !== requestIdRef.current) return;

      // If the current offset is beyond the server-reported total, clamp to
      // the last available page and trigger a refetch. This prevents empty
      // pages when filters reduce the result set or when the user navigated
      // to a later page before applying filters.
      if (serverTotal > 0 && offset >= serverTotal) {
        const newOffset = Math.max(0, Math.floor((serverTotal - 1) / LIMIT) * LIMIT);
        setOffset(newOffset);
        // Do not clear loading here; the subsequent fetch will set loading.
        return;
      }

      setJobs(hits);
      setTotal(serverTotal);
    } catch (e) {
      // Only set error for the latest request
      if (requestIdRef.current === reqId) {
        setError(t("jobs.fetchError"));
        setJobs([]);
      }
    } finally {
      // Only update loading state for the latest request
      if (requestIdRef.current === reqId) setLoading(false);
    }
  }, [
    debouncedQ,
    filters.municipalities,
    filters.regions,
    filters.remote,
    filters.employmentType,
    filters.occupationCodes,
    offset,
    t,
  ]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    let cancelled = false;

    const fetchOccupationOptions = async () => {
      try {
        const params = new URLSearchParams();
        if (debouncedQ) params.set("q", debouncedQ);
        if (filters.regions.length > 0) {
          filters.regions.forEach((region) => params.append("region", region));
        }
        if (filters.municipalities.length > 0) {
          filters.municipalities.forEach((municipality) =>
            params.append("municipality", municipality),
          );
        }
        if (filters.remote) params.set("remote", "true");
        if (filters.employmentType) {
          params.set("employmentType", filters.employmentType);
        }

        const response = await fetch(
          `${BACKEND}/api/externaljobs/occupations?${params}`,
        );

        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const data = (await response.json()) as OccupationOption[];
        if (cancelled) return;

        setOccupationOptions(data);

        const selectedOption = data.find((option) =>
          option.codes.some((code) => filters.occupationCodes.includes(code)),
        );
        if (selectedOption) {
          setSelectedOccupationLabel(selectedOption.label);
        } else if (filters.occupationCodes.length === 0) {
          setSelectedOccupationLabel("");
        }
      } catch {
        if (!cancelled) {
          setOccupationOptions([]);
        }
      }
    };

    fetchOccupationOptions();

    return () => {
      cancelled = true;
    };
  }, [
    debouncedQ,
    filters.regions,
    filters.municipalities,
    filters.remote,
    filters.employmentType,
    filters.occupationCodes,
  ]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
    setJobs([]);
    setTotal(0);
  };

  const filteredJobs = jobs;
  const hasActiveFilters =
    filters.q.trim() !== "" ||
    filters.regions.length > 0 ||
    filters.municipalities.length > 0 ||
    filters.remote ||
    filters.employmentType !== "" ||
    filters.occupationCodes.length > 0;

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {t("jobs.title")}
        </h1>
        <div className="flex items-center gap-3">
          {!loading && filteredJobs.length > 0 && (
            <span className="text-slate-400 dark:text-white/40 text-sm">
              {filteredJobs.length !== total ? (
                t("jobs.filteredTotalAds", {
                  shown: filteredJobs.length.toLocaleString(localeTag),
                  total: total.toLocaleString(localeTag),
                })
              ) : (
                t("jobs.totalAds", {
                  count: total,
                  countLabel: total.toLocaleString(localeTag),
                })
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
            placeholder={t("jobs.searchPlaceholder")}
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
            {employmentOptions.map((o) => (
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
          {t("jobs.remoteLabel")}
        </button>
      </div>

          {/* ── Compact filters: Location + Occupation ── */}
          <div className="flex flex-wrap gap-3 mt-3 items-center">
            <div className="relative min-w-[300px]" ref={locationPanelRef}>
              <MapPin
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30"
              />
              <button
                onClick={() => setShowLocationPanel((s) => !s)}
                className="w-full text-left bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-600 dark:text-white/70 focus:outline-none"
              >
                {filters.municipalities.length > 0
                  ? filters.municipalities.join(", ")
                  : filters.regions.length > 0
                  ? filters.regions.join(", ")
                  : t("jobs.selectRegionPlaceholder")}
              </button>

              {showLocationPanel && (
                <div className="absolute z-50 mt-2 w-[640px] bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-3 flex">
                  <div className="w-1/2 max-h-[360px] overflow-auto pr-3 border-r border-slate-100 dark:border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <strong className="text-sm">{t("jobs.regions")}</strong>
                      <button
                        onClick={() => {
                          setActiveRegion(null);
                          update({ regions: [], municipalities: [] });
                        }}
                        className="text-xs text-purple-600"
                      >
                        {t("jobs.clear")}
                      </button>
                    </div>
                    {REGION_SUGGESTIONS.map((r) => (
                      <div
                        key={r}
                        onClick={() => {
                          setActiveRegion(r);
                          update({ regions: [r], municipalities: [] });
                        }}
                        className={`px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex items-center justify-between ${
                          activeRegion === r
                            ? "bg-slate-100 dark:bg-white/5 font-semibold"
                            : ""
                        }`}
                      >
                        <span className="text-sm truncate">{r}</span>
                        <span className="text-slate-400 text-xs">›</span>
                      </div>
                    ))}
                  </div>

                  <div className="w-1/2 pl-4 max-h-[360px] overflow-auto">
                    <div className="flex items-center justify-between mb-2">
                      <strong className="text-sm">{t("jobs.municipalities")}</strong>
                      <div className="text-xs text-slate-500">
                        {activeRegion ? activeRegion : t("jobs.regions")}
                      </div>
                    </div>
                    {activeRegion ? (
                      <div>
                        <label className="flex items-center gap-2 mb-2 text-sm">
                          <input
                            type="checkbox"
                            checked={
                              (REGION_CITY_MAP[activeRegion] || []).every((c) =>
                                  filters.municipalities.includes(c),
                              ) && (REGION_CITY_MAP[activeRegion] || []).length > 0
                            }
                            onChange={(e) => {
                              const list = REGION_CITY_MAP[activeRegion] || [];
                              if (e.target.checked) {
                                  update({ municipalities: list });
                              } else {
                                  // remove all of these
                                  update({ municipalities: filters.municipalities.filter((c) => !list.includes(c)) });
                              }
                            }}
                          />
                          {t("jobs.selectAllMunicipalities")}
                        </label>

                        <div className="grid grid-cols-1 gap-2">
                          {(REGION_CITY_MAP[activeRegion] || []).map((m) => (
                            <label key={m} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={filters.municipalities.includes(m)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    update({ municipalities: Array.from(new Set([...filters.municipalities, m])) });
                                  } else {
                                    update({ municipalities: filters.municipalities.filter((c) => c !== m) });
                                  }
                                }}
                              />
                              <span>{m}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">{t("jobs.selectRegionPrompt")}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative min-w-[220px]">
              <Briefcase
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30"
              />
              <select
                value={selectedOccupationLabel}
                onChange={(e) => {
                  const nextOption = occupationOptions.find(
                    (option) => option.label === e.target.value,
                  );
                  setSelectedOccupationLabel(nextOption?.label ?? "");
                  update({ occupationCodes: nextOption?.codes ?? [] });
                }}
                className="w-full bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-600 dark:text-white/70 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500/50 appearance-none"
              >
                <option value="">{t("jobs.allOccupations")}</option>
                {selectedOccupationLabel &&
                  !occupationOptions.some(
                    (option) => option.label === selectedOccupationLabel,
                  ) && (
                    <option value={selectedOccupationLabel}>
                      {selectedOccupationLabel || t("jobs.selectedOccupation")}
                    </option>
                  )}
                {occupationOptions.map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setActiveRegion(null);
                  setShowLocationPanel(false);
                  setSelectedOccupationLabel("");
                  update({
                    q: "",
                    regions: [],
                    municipalities: [],
                    occupationCodes: [],
                    remote: false,
                    employmentType: "",
                  });
                }}
                className="app-secondary-button ml-2 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 border-red-300 dark:border-red-800/60 hover:bg-red-200 dark:hover:bg-red-900/40 hover:text-red-700 dark:hover:text-red-300"
              >
                ✕ {t("jobs.clearFilters")}
              </button>
            )}
          </div>

      {/* Note: previous tag-style multi selects removed — replaced by compact dropdowns above. */}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400 dark:text-white/40">
          <Loader2 size={24} className="animate-spin mr-3" />
          {t("jobs.loading")}
        </div>
      )}

      {/* API log removed for production UI */}

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
          <p className="text-sm">{t("jobs.empty")}</p>
        </div>
      )}

      {/* ── Job cards ── */}
      {!loading && filteredJobs.length > 0 && (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobListCard
              key={job.id}
              title={
                <Link
                  href={`/jobs/${job.id}`}
                  className="text-lg font-semibold text-gray-900 dark:text-white hover:underline leading-snug"
                >
                  {job.headline}
                </Link>
              }
              badges={
                job.matchGrade ? (
                  <span
                    className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full ${
                      job.matchGrade === "A"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800/50"
                        : job.matchGrade === "B"
                          ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800/50"
                          : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800/50"
                    }`}
                  >
                    {job.matchGrade} {t("jobs.match")}
                  </span>
                ) : null
              }
              leading={
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-white/20 overflow-hidden">
                  <Briefcase size={20} />
                </div>
              }
              subtitle={job.employer?.name}
              meta={
                <>
                  {(job.workplace_address?.municipality || job.workplace_address?.region) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={13} />
                      {formatLocation(job.workplace_address)}
                    </span>
                  )}
                  {job.remote && (
                    <span className="flex items-center gap-1 text-purple-500 dark:text-purple-400">
                      <Wifi size={13} />
                      {t("jobs.remoteLabel")}
                    </span>
                  )}
                </>
              }
              tags={
                <>
                  {job.working_hours_type?.label && (
                    <span className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10">
                      {job.working_hours_type.label}
                    </span>
                  )}
                  {job.employment_type?.label && (
                    <span className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10">
                      {job.employment_type.label}
                    </span>
                  )}
                </>
              }
              aside={
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
                    className={`flex-shrink-0 transition-colors p-2 ${
                      isFavorite(job.id)
                        ? "text-purple-500 dark:text-purple-400"
                        : "text-slate-300 dark:text-white/20 hover:text-purple-500 dark:hover:text-purple-400"
                    }`}
                    title={
                      isFavorite(job.id)
                        ? t("jobs.removeFavorite")
                        : t("jobs.addFavorite")
                    }
                  >
                    <Bookmark
                      size={18}
                      fill={isFavorite(job.id) ? "currentColor" : "none"}
                    />
                  </button>
                  {job.webpage_url && (
                    <a
                      href={job.webpage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-secondary-button px-3 py-2 text-sm"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              }
              footer={
                job.application_deadline ? (
                  <div className="flex justify-end">
                    <span className="text-xs text-slate-400 dark:text-white/30">
                      {t("jobs.deadline", {
                        date: new Date(job.application_deadline).toLocaleDateString(localeTag),
                      })}
                    </span>
                  </div>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="app-secondary-button px-4 py-2 text-sm"
          >
            ← {t("jobs.previous")}
          </button>
          <span className="text-sm text-slate-400 dark:text-white/40">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={currentPage >= totalPages}
            className="app-secondary-button px-4 py-2 text-sm"
          >
            {t("jobs.next")} →
          </button>
        </div>
      )}
    </div>
  );
}
