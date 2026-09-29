import { Eye,FileText,MapPin } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { useState } from 'react';
import JobListCard from '../../components/JobListCard';
import { getPublicBackendUrl } from '../../lib/backendUrl';
import { getSupabaseBrowserClient } from '../../lib/supabaseClient';
import type { PreparedJob } from '../../types/api';
export function usePreparedJobs(initialPreparedJobs: PreparedJob[]) {
  const {t} = useTranslation('common');
  const [preparedJobs, setPreparedJobs] = useState(initialPreparedJobs);
  const [deletingCv, setDeletingCv] = useState<string | null>(null);
  const [deletingLetter, setDeletingLetter] = useState<string | null>(null);
  const [preparedError, setPreparedError] = useState("");
  const deleteCv = async (jobId: string) => {
    if (!window.confirm(t("home.deleteCvConfirm"))) return;
    setDeletingCv(jobId);
    setPreparedError("");
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session) throw new Error("authentication");
      const response = await fetch(`${getPublicBackendUrl()}/api/cvs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error("delete");
      setPreparedJobs(current => current.flatMap(job => {
        if (job.job_id !== jobId) return [job];
        if (!job.has_cover_letter) return [];
        return [{ ...job, has_cv: false, cv_expires_at: null }];
      }));
    } catch {
      setPreparedError(t("home.deleteCvError"));
    } finally {
      setDeletingCv(null);
    }
  };

  const deleteCoverLetter = async (jobId: string) => {
    if (!window.confirm(t("home.deleteCoverLetterConfirm"))) return;
    setDeletingLetter(jobId);
    setPreparedError("");
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session) throw new Error("authentication");
      const response = await fetch(`${getPublicBackendUrl()}/api/coverletters/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error("delete");
      setPreparedJobs(current => current.flatMap(job => {
        if (job.job_id !== jobId) return [job];
        if (!job.has_cv) return [];
        return [{ ...job, has_cover_letter: false, cover_letter_expires_at: null }];
      }));
    } catch {
      setPreparedError(t("home.deleteCoverLetterError"));
    } finally {
      setDeletingLetter(null);
    }
  };

  return {preparedJobs, preparedError, deletingCv, deletingLetter, deleteCv, deleteCoverLetter};
}
export function PreparedJobs({model}: {model: ReturnType<typeof usePreparedJobs>}) {
  const {t, i18n} = useTranslation('common');
  const {preparedJobs, preparedError, deletingCv, deletingLetter, deleteCv, deleteCoverLetter} = model;
  return <>
          {preparedError && <p role="alert" className="app-card-base p-4">{preparedError}</p>}
          {preparedJobs.length === 0 ? (
            <div className="app-card-base rounded-2xl p-6 text-center sm:p-12">
              <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("home.noPreparedJobsTitle")}</p>
              <p className="text-gray-500 dark:text-white/50">{t("home.noPreparedJobsDescription")}</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {preparedJobs.map(job => (
                <JobListCard
                  key={job.job_id}
                  leading={<div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400"><FileText size={20} /></div>}
                  title={<Link href={`/jobs/${job.job_id}`} className="text-lg font-semibold text-gray-900 dark:text-white hover:underline leading-snug">{job.job_context.title || t("jobDetail.defaultJobTitle")}</Link>}
                  badges={<div className="flex flex-wrap gap-2">
                    {job.has_cv && <span className="text-xs font-semibold rounded-full px-3 py-1 bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{t("home.cvReady")}</span>}
                    {job.has_cover_letter && <span className="text-xs font-semibold rounded-full px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">{t("home.coverLetterReady")}</span>}
                  </div>}
                  subtitle={job.job_context.company}
                  meta={<>
                    {job.job_context.location && <span className="flex items-center gap-1"><MapPin size={13} />{job.job_context.location}</span>}
                    {job.has_cv && job.cv_expires_at && <span>{t("home.cvExpires", { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(job.cv_expires_at)) })}</span>}
                    {job.has_cover_letter && job.cover_letter_expires_at && <span>{t("home.coverLetterExpires", { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(job.cover_letter_expires_at)) })}</span>}
                  </>}
                  aside={<div className="flex flex-wrap items-center gap-2">
                    {job.has_cv && <Link href={`/jobs/${job.job_id}/cv`} className="app-secondary-button px-3 py-2 text-sm">{t("home.openCv")}</Link>}
                    {job.has_cv && <button type="button" disabled={deletingCv === job.job_id} onClick={() => void deleteCv(job.job_id)} className="app-secondary-button px-3 py-2 text-sm disabled:opacity-50">{t(deletingCv === job.job_id ? "home.deletingCv" : "home.deleteCv")}</button>}
                    {job.has_cover_letter && <Link href={`/jobs/${job.job_id}?letter=1`} className="app-secondary-button px-3 py-2 text-sm">{t("home.openCoverLetter")}</Link>}
                    {job.has_cover_letter && <button type="button" disabled={deletingLetter === job.job_id} onClick={() => void deleteCoverLetter(job.job_id)} className="app-secondary-button px-3 py-2 text-sm disabled:opacity-50">{t(deletingLetter === job.job_id ? "home.deletingCoverLetter" : "home.deleteCoverLetter")}</button>}
                    <Link href={`/jobs/${job.job_id}`} className="app-secondary-button px-3 py-2 text-sm" title={t("home.viewJob")}><Eye size={15} /></Link>
                  </div>}
                />
              ))}
            </div>
          )}
  </>;
}
