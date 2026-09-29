import { Bookmark,Briefcase,ClipboardCheck,Loader2,MapPin,Wifi } from "lucide-react";
import type { GetServerSideProps } from "next";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Link from "next/link";
import { useRouter } from "next/router";
import AiGenerationConsent from '../../components/AiGenerationConsent';
import CoverLetterModal from "../../components/CoverLetterModal";
import { getAfUrl,renderAFDescription,renderApplicationDeadline,renderApplicationInstructions,renderOtherInformation,renderQualifications } from "../../components/JobAdContent";
import { Button } from "../../components/ui/button";
import { useCoverLetter } from '../../features/jobs/useCoverLetter';
import { useJobApplication } from '../../features/jobs/useJobApplication';
import { useJobDetails } from '../../features/jobs/useJobDetails';
import { safeExternalUrl,safeHtml } from "../../lib/safeHtml";
import { useFavorites } from "../../lib/useFavorites";
import { formatLocation } from "../../lib/utils";

export default function JobDetailPage() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { id, data } = router.query;
  const { toggleFavorite, isFavorite } = useFavorites();
  const localeTag = router.locale === "sv" ? "sv-SE" : "en-US";

  const {job, fetching, fetchError, setFetchError, jobHtml} = useJobDetails();
  const {application, applicationLoading, applicationSaving, markAsApplied} = useJobApplication(job, setFetchError);
  const {generating, loadingLetter, letter, letterExpiresAt, deletingLetter, consentOpen, setConsentOpen,
    showModal, setShowModal, career, selectedCareer, setSelectedCareer, careerError, careerLoaded,
    loadCareer, requestGeneration, generate, deleteCoverLetter} = useCoverLetter(job, setFetchError);

  const getApplicationUrl = () => {
    if (!job) return undefined;
    const app = job.application_details || {};
    return (
      app.url ||
      app.application_url ||
      job.application_url ||
      job.webpage_url ||
      undefined
    );
  };

  if (!job && !jobHtml) {
    return (
      <div className="app-page-shell">
        {fetching ? (
          <p className="text-sm text-slate-400">{t("jobDetail.loading")}</p>
        ) : (
          <p className="text-sm text-slate-400">
            {t("jobDetail.notFound")}
          </p>
        )}
        {fetchError && (
          <div className="mt-2 text-red-500 text-sm">{t("jobDetail.error", { message: fetchError })}</div>
        )}
        <div className="mt-4">
          <Button asChild variant="secondary" className="h-auto px-4 py-2">
            <Link href="/jobs">← {t("jobDetail.backToJobs")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
      <div className="app-page-shell">
      {/* Debug UI removed */}
      {jobHtml ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-lg font-bold">{t("jobDetail.ad")}</h1>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button asChild variant="external" className="h-auto px-3 py-2">
                <a
                  href={`https://arbetsformedlingen.se/platsbanken/annonser/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("jobDetail.openOriginal")}
                </a>
              </Button>
              <Button asChild variant="secondary" className="h-auto px-3 py-2">
                <Link href="/jobs">{t("jobDetail.backToJobs")}</Link>
              </Button>
            </div>
          </div>

          <div className="prose max-w-none text-sm text-slate-700 dark:text-white bg-white dark:bg-[#111] p-4 rounded-lg">
            <div dangerouslySetInnerHTML={{ __html: safeHtml(jobHtml ?? "") }} />
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                <Briefcase />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h1 className="min-w-0 flex-1 break-words text-2xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-3xl">
                    {job.headline ?? job.title ?? t("jobDetail.defaultJobTitle")}
                  </h1>
                  <Button
                    onClick={() => {
                      toggleFavorite({
                        id: job.id,
                        title: job.headline ?? job.title,
                        company: job.employer?.name,
                        location: formatLocation(job.workplace_address),
                        matchGrade: job.matchGrade,
                      });
                    }}
                    title={
                      isFavorite(job.id)
                        ? t("jobs.removeFavorite")
                        : t("jobs.addFavorite")
                    }
                    variant="ghost"
                    size="icon"
                    className={isFavorite(job.id)
                      ? "text-purple-500 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-400"
                      : "text-slate-300 dark:text-white/20 hover:text-purple-500 dark:hover:text-purple-400"
                    }
                  >
                    <Bookmark
                      size={24}
                      fill={isFavorite(job.id) ? "currentColor" : "none"}
                    />
                  </Button>
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {job.employer?.name}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                  {(job.workplace_address?.municipality ||
                    job.workplace_address?.region) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} />
                      {formatLocation(job.workplace_address)}
                    </span>
                  )}
                  {job.remote && (
                    <span className="flex items-center gap-1 text-purple-500">
                      <Wifi size={14} />
                      {t("jobDetail.remoteLabel")}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  {job.employment_type?.label && (
                    <span className="mr-4">{job.employment_type.label}</span>
                  )}
                  {job.working_hours_type?.label && (
                    <span className="mr-4">{job.working_hours_type.label}</span>
                  )}
                </div>
              </div>
            </div>

            {typeof id === 'string' && <Button asChild className="mt-6 w-full sm:w-auto"><Link href={`/jobs/${encodeURIComponent(id)}/cv`}>{t('cv.generate')}</Link></Button>}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="min-w-0 space-y-6 lg:col-span-2">
                <section className="rounded-2xl bg-white p-4 dark:bg-[#111] sm:p-6">
                  <h2 className="mb-4 text-xl font-semibold sm:text-2xl">{t("jobDetail.aboutJob")}</h2>
                  <div className="prose max-w-none text-sm text-slate-700 dark:text-white">
                    {renderAFDescription(job, t)}
                  </div>
                </section>

                {/* Qualifications & Other information sections (Arbetsförmedlingen often provides these fields) */}

                {renderQualifications(job, t)}
                {renderOtherInformation(job, t)}
              </div>

              <aside className="min-w-0 lg:col-span-1">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/5 dark:bg-[#0b0b0b] sm:p-6">
                  <h3 className="font-semibold mb-2">{t("jobDetail.applyJob")}</h3>
                  <p className="text-sm text-slate-500 mb-3">
                    {renderApplicationDeadline(job, t, localeTag)}
                  </p>
                  <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-white">
                    {(() => {
                      const app = job.application_details || {};
                      const hasEmail = !!app.email;
                      const externalUrl =
                        app.url ||
                        app.application_url ||
                        job.application_url ||
                        job.application_details?.application_url ||
                        job.application_details?.external_url;

                      if (hasEmail) {
                        return (
                          <div className="space-y-1">
                            <div>
                              {t("jobDetail.applyByEmail")} {" "}
                              <a
                                href={`mailto:${app.email}`}
                                className="text-purple-600"
                              >
                                {app.email}
                              </a>
                            </div>
                            {app.reference && (
                              <div>
                                {t("jobDetail.reference")} <strong>{app.reference}</strong>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (externalUrl) {
                        return (
                          <Button asChild variant="external" className="h-auto w-full px-4 py-2.5">
                            <a
                              href={safeExternalUrl(externalUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("jobDetail.applyExternal")}
                            </a>
                          </Button>
                        );
                      }

                      // Fallback: show generic instructions and AF page link
                      return (
                        <>
                          {renderApplicationInstructions(job, t)}
                          <Button asChild variant="external" className="h-auto w-full px-4 py-2.5">
                            <a
                              href={safeExternalUrl(getAfUrl(job))}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("jobDetail.openAf")}
                            </a>
                          </Button>
                        </>
                      );
                    })()}
                    {!applicationLoading && (application ? (
                      <Button asChild variant="secondary" className="h-auto w-full px-4 py-2.5">
                        <Link href="/applications"><ClipboardCheck size={15} />{t("applications.openTracker")}</Link>
                      </Button>
                    ) : (
                      <Button type="button" variant="secondary" disabled={applicationSaving} onClick={() => void markAsApplied()} className="h-auto w-full px-4 py-2.5">
                        {applicationSaving ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={15} />}
                        {t(applicationSaving ? "applications.marking" : "applications.markApplied")}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">

                  <div className="my-3 space-y-2">
                    <p>{t('consent.careerScope')}</p>
                    {!careerLoaded && <Button variant="secondary" onClick={loadCareer}>{t('consent.chooseFacts')}</Button>}
                    {careerError && <p role="alert">{t('consent.error')}</p>}
                    {careerLoaded && career.map(entry=><label key={entry.id} className="flex gap-2">
                      <input type="checkbox" checked={selectedCareer.includes(entry.id)} disabled={generating || (!selectedCareer.includes(entry.id)&&selectedCareer.length>=3)}
                        onChange={e=>setSelectedCareer(ids=>e.target.checked?[...ids,entry.id]:ids.filter(id=>id!==entry.id))}/>
                      {entry.title} — {entry.organization}
                    </label>)}
                  </div>
                  {fetchError && <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{fetchError}</p>}
                  <Button
                    onClick={() => letter ? setShowModal(true) : requestGeneration()}
                    disabled={generating || loadingLetter || deletingLetter}
                    className="h-auto w-full px-4 py-2.5"
                  >
                    {generating ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {t("jobDetail.generateCoverLetter")}
                      </>
                    ) : (
                      t(loadingLetter ? "coverLetter.loadingSaved" : letter ? "coverLetter.openSaved" : "jobDetail.generateCoverLetter")
                    )}
                  </Button>
                  <Button asChild variant="secondary" className="mt-2 h-auto w-full px-4 py-2.5">
                    <Link href="/jobs">{t("jobDetail.backToJobs")}</Link>
                  </Button>
                </div>
              </aside>
            </div>
          </div>
        </>
      )}

      {consentOpen && <AiGenerationConsent key={String(id)} onClose={()=>setConsentOpen(false)} onConfirm={()=>{setConsentOpen(false);void generate();}} />}
      {/* Cover Letter Modal */}
      {letter && (
        <CoverLetterModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          letter={letter}
          jobTitle={job?.headline || job?.title || t("jobDetail.defaultJobTitle")}
          company={job?.employer?.name || job?.advertiser || ""}
          applicationUrl={safeExternalUrl(getApplicationUrl())}
          onRegenerate={requestGeneration}
          isRegenerating={generating}
          expiresAt={letterExpiresAt}
          onDelete={() => void deleteCoverLetter()}
          isDeleting={deletingLetter}
        />
      )}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};
