import {
Bookmark,
Briefcase,
ClipboardCheck,
ExternalLink,
Loader2,
MapPin,
Wifi
} from "lucide-react";
import type { GetServerSideProps } from "next";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Link from "next/link";
import { useRouter } from "next/router";
import JobListCard from "../../components/JobListCard";
import { JobSearchFilters } from '../../features/jobs/JobSearchFilters';
import { useJobSearch } from '../../features/jobs/useJobSearch';
import { useApplicationStatuses } from "../../lib/useApplicationStatuses";
import { useFavorites } from "../../lib/useFavorites";
import { formatLocation } from "../../lib/utils";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? "en", ["common"])) },
});

export default function AllJobsPage() {
  const { t } = useTranslation("common");
  const { locale } = useRouter();
  const { toggleFavorite, isFavorite } = useFavorites();
  const localeTag = locale === "sv" ? "sv-SE" : "en-US";
  const search = useJobSearch();
  const {filteredJobs, total, loading, error, offset, setOffset, LIMIT, totalPages, currentPage} = search;
  const applicationStatuses = useApplicationStatuses();

  return (
    <div className="app-page-shell">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h1 className="min-w-0 text-xl font-bold text-slate-900 dark:text-white">
          {t("jobs.title")}
        </h1>
        <div className="flex items-center gap-3">
          {!loading && filteredJobs.length > 0 && (
            <span className="text-right text-xs text-slate-400 dark:text-white/40 sm:text-sm">
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

      <JobSearchFilters model={search} />

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
          {filteredJobs.map((job) => {
            const applicationStatus = applicationStatuses[job.id];
            return <JobListCard
              key={job.id}
              title={
                <Link
                  href={`/jobs/${job.id}`}
                  className="text-lg font-semibold text-gray-900 dark:text-white hover:underline leading-snug"
                >
                  {job.headline}
                </Link>
              }
              badges={(applicationStatus || job.matchGrade) ? (
                <div className="flex flex-wrap items-center gap-2">
                  {applicationStatus && (
                    <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <ClipboardCheck size={13} aria-hidden="true" />
                      {applicationStatus === "applied"
                        ? t("jobs.applied")
                        : t("jobs.appliedWithStatus", { status: t(`applications.status.${applicationStatus}`) })}
                    </span>
                  )}
                  {job.matchGrade && <span
                    className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full ${
                      job.matchGrade === "A"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800/50"
                        : job.matchGrade === "B"
                          ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800/50"
                          : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800/50"
                    }`}
                  >
                    {job.matchGrade} {t("jobs.match")}
                  </span>}
                </div>
              ) : null}
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
            />;
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-4 sm:justify-center sm:gap-3">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="app-secondary-button min-w-0 flex-1 px-3 py-2 text-sm sm:flex-none sm:px-4"
          >
            ← {t("jobs.previous")}
          </button>
          <span className="text-sm text-slate-400 dark:text-white/40">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={currentPage >= totalPages}
            className="app-secondary-button min-w-0 flex-1 px-3 py-2 text-sm sm:flex-none sm:px-4"
          >
            {t("jobs.next")} →
          </button>
        </div>
      )}
    </div>
  );
}
