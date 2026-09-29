import { Bookmark,Briefcase,ClipboardCheck,Eye,MapPin,Wifi } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import JobListCard from '../../components/JobListCard';
import { useApplicationStatuses } from '../../lib/useApplicationStatuses';
import { useFavorites } from '../../lib/useFavorites';
import { formatLocation } from '../../lib/utils';
import type { useHomeMatches } from './useHomeMatches';
export function MatchedJobs({model, showDebug}: {model: ReturnType<typeof useHomeMatches>; showDebug: boolean}) {
  const {t} = useTranslation('common');
  const {toggleFavorite, isFavorite} = useFavorites();
  const applicationStatuses = useApplicationStatuses();
  const [openGradeId, setOpenGradeId] = useState<string | null>(null);
  const {matched, matchLoading, matchError, poolLimited, desiredRolesSource, visibleCount, fetchComplete, retry, loadMore} = model;
  // Close grade tooltip when clicking anywhere outside
  useEffect(() => {
    if (!openGradeId) return;
    const close = () => setOpenGradeId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openGradeId]);

  const locationTierLabel: Record<string, string> = {
    same_municipality:  t("home.tierSameMunicipality"),
    same_region:        t("home.tierSameRegion"),
    same_region_nearby: t("home.tierNearbyArea"),
    same_region_strict: t("home.tierSameRegionStrict"),
    remote:             t("home.tierRemote"),
    country:            t("home.tierCountry"),
    no_preference:      t("home.tierNoPreference"),
    out_of_region:      t("home.tierOutOfRegion"),
  };

  return <>
        {/* Loading skeleton — first paint before matches arrive */}
        {desiredRolesSource === null && !matchError && (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#1a1a1a] sm:rounded-3xl sm:p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-200 dark:bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {poolLimited && <p role="status" className="app-card-base p-4">{t('consent.poolLimit')}</p>}
        {matchError && !matchLoading && (
          <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-white/5 dark:bg-[#1a1a1a] sm:rounded-3xl sm:p-12">
            <p className="text-gray-400 dark:text-white/40">
              {t("home.matchLoadError")}
            </p>
            <button type="button" className="app-secondary-button mt-4" onClick={retry}>{t('career.retry')}</button>
          </div>
        )}

        {/* No roles — guide user to set up their profile */}
        {desiredRolesSource === "none" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-white/5 dark:bg-[#1a1a1a] sm:rounded-3xl sm:p-12">
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t("home.noRolesTitle")}
            </p>
            <p className="text-gray-400 dark:text-white/40 mb-6">
              {t("home.noRolesDescription")}
            </p>
            <Link href="/user" className="app-primary-button inline-flex items-center gap-2">
              {t("home.goToProfile")}
            </Link>
          </div>
        )}

        {/* Has roles but no matches */}
        {desiredRolesSource !== "none" &&
          desiredRolesSource !== null &&
          matched.length === 0 &&
          !matchLoading && !matchError && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-white/5 dark:bg-[#1a1a1a] sm:rounded-3xl sm:p-12">
            <p className="text-gray-400 dark:text-white/40">
              {t(fetchComplete ? "home.noMatchesDescription" : "home.loadingMatches")}
            </p>
          </div>
        )}

        {/* Matched job cards — sliced to visible count */}
        {matched.slice(0, visibleCount).length > 0 && (
          <div className="grid gap-4">
            {matched.slice(0, visibleCount).map((job) => {
              const applicationStatus = applicationStatuses[job.id];
              return <JobListCard
                key={job.id}
                leading={
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-white/20 overflow-hidden">
                    <Briefcase size={20} />
                  </div>
                }
                title={
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-lg font-semibold text-gray-900 dark:text-white hover:underline leading-snug"
                  >
                    {job.headline}
                  </Link>
                }
                badges={
                  <div className="flex flex-wrap items-center gap-2">
                    {applicationStatus && (
                      <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <ClipboardCheck size={13} aria-hidden="true" />
                        {applicationStatus === "applied"
                          ? t("jobs.applied")
                          : t("jobs.appliedWithStatus", { status: t(`applications.status.${applicationStatus}`) })}
                      </span>
                    )}
                    <div className="relative group/grade flex-shrink-0">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenGradeId(openGradeId === job.id ? null : job.id);
                        }}
                        className={`text-xs font-bold px-3 py-1 rounded-full cursor-pointer ${
                          job.matchGrade === "A"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800/50"
                            : job.matchGrade === "B"
                              ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800/50"
                              : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800/50"
                        }`}
                      >
                        {job.matchGrade} {t("home.match")}
                      </span>
                      {/* Score tooltip — visible on hover (desktop) or tap (mobile) */}
                      <div
                        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20
                        pointer-events-none transition-opacity duration-150
                        bg-gray-900 dark:bg-[#111] text-white text-xs rounded-xl p-3
                        shadow-xl border border-white/10 whitespace-nowrap
                        ${openGradeId === job.id ? 'opacity-100' : 'opacity-0 group-hover/grade:opacity-100'}`}
                      >
                        <div className="font-semibold text-white/90 mb-1.5">
                          {t("home.gradeScoreLabel")}: {job.matchDebug.totalScore}
                        </div>
                        <div className="text-white/60">{job.matchDebug.scoreBreakdown}</div>
                        <div className="text-white/60 mt-0.5">
                          {locationTierLabel[job.matchDebug.locationTier] ?? job.matchDebug.locationTier}
                        </div>
                        {/* Caret pointing down */}
                        <div
                          className="absolute top-full left-1/2 -translate-x-1/2
                          border-[5px] border-transparent border-t-gray-900 dark:border-t-[#111]"
                        />
                      </div>
                    </div>
                  </div>
                }
                subtitle={job.employer?.name}
                meta={
                  <>
                    {(job.workplace_address?.municipality ||
                      job.workplace_address?.region) && (
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
                    <Link
                      href={`/jobs/${job.id}`}
                      className="app-secondary-button px-3 py-2 text-sm"
                      title={t("home.viewJob")}
                    >
                      <Eye size={15} />
                    </Link>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite({
                          id: job.id,
                          title: job.headline,
                          company: job.employer?.name ?? "",
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
                          ? t("home.removeFavorite")
                          : t("home.addFavorite")
                      }
                    >
                      <Bookmark
                        size={18}
                        fill={isFavorite(job.id) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                }
                footer={
                  showDebug && job.matchDebug ? (
                    <div className="text-xs text-gray-400 dark:text-white/30 font-mono space-y-0.5">
                      {job.matchDebug.reasons.map((r, i) => (
                        <div key={i}>{r}</div>
                      ))}
                    </div>
                  ) : undefined
                }
              />;
            })}
          </div>
        )}

        {/* View more — only when there may be more jobs waiting in the backend */}
        {!matchLoading && matched.length > 0 && matched.length >= visibleCount && (
          <div className="flex justify-center pt-2">
            <button
              onClick={loadMore}
              className="app-secondary-button"
            >
              {t("jobs.loadMore")}
            </button>
          </div>
        )}

        {/* Spinner for subsequent loads (e.g. after View more) */}
        {matchLoading && matched.length > 0 && (
          <div className="flex justify-center pt-2">
            <span className="text-sm text-gray-400 dark:text-white/40">
              {t("home.loadingMatches")}
            </span>
          </div>
        )}
  </>;
}
