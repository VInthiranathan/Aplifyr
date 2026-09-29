import { Briefcase,MapPin,Search,Wifi,X } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useEffect,useMemo,useRef,useState } from 'react';
import employmentOptionsData from '../../data/employment_types.json';
import municipalitiesByRegion from '../../data/municipalities_by_region.json';
import type { useJobSearch } from './useJobSearch';
const EMPLOYMENT_OPTIONS = employmentOptionsData as {value: string; label: string}[];
const REGION_CITY_MAP = municipalitiesByRegion as Record<string, string[]>;
const REGION_SUGGESTIONS = Object.keys(REGION_CITY_MAP);
export function JobSearchFilters({model}: {model: ReturnType<typeof useJobSearch>}) {
  const {t} = useTranslation('common');
  const {filters, occupationOptions, selectedOccupationLabel, setSelectedOccupationLabel, update, hasActiveFilters} = model;
  const [showLocationPanel, setShowLocationPanel] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const locationPanelRef = useRef<HTMLDivElement | null>(null);
  const employmentOptions = useMemo(
    () =>
      EMPLOYMENT_OPTIONS.map((option) => ({
        ...option,
        label: option.value === "" ? t("jobs.allTypes") : option.label,
      })),
    [t],
  );

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

  return <>
      {/* ── Filter bar ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(180px,auto)_auto]">
        {/* Search */}
        <div className="relative min-w-0">
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
        <div className="relative min-w-0">
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
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors sm:w-auto ${
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(260px,1fr)_minmax(220px,auto)_auto] sm:items-center">
            <div className="relative min-w-0" ref={locationPanelRef}>
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

              {showLocationPanel && <>
                <div aria-hidden="true" onClick={() => setShowLocationPanel(false)} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] sm:hidden" />
                <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] top-[calc(4.25rem+env(safe-area-inset-top))] z-50 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#111] sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-2 sm:h-auto sm:max-h-[70vh] sm:w-[min(640px,calc(100vw-7rem))] sm:flex-row sm:rounded-xl sm:shadow-lg">
                  <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5 sm:hidden">
                    <strong className="text-sm">{t("jobs.selectRegionPlaceholder")}</strong>
                    <button type="button" onClick={() => setShowLocationPanel(false)} aria-label={t("privacy.close")} className="app-hover-standard flex h-10 w-10 items-center justify-center rounded-xl"><X size={18} /></button>
                  </div>
                  <div className="max-h-[42%] w-full overflow-auto border-b border-slate-100 pb-3 dark:border-white/5 sm:max-h-[360px] sm:w-1/2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
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

                  <div className="min-h-0 w-full flex-1 overflow-auto pt-3 sm:max-h-[360px] sm:w-1/2 sm:pl-4 sm:pt-0">
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
              </>}
            </div>

            <div className="relative min-w-0">
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
                className="app-secondary-button min-h-11 w-full px-3 py-1.5 text-xs text-red-700 dark:text-red-400 border-red-300 dark:border-red-800/60 hover:bg-red-200 dark:hover:bg-red-900/40 hover:text-red-700 dark:hover:text-red-300 sm:w-auto"
              >
                ✕ {t("jobs.clearFilters")}
              </button>
            )}
          </div>

  </>;
}
