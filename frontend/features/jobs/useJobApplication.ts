import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect,useState } from 'react';
import { getPublicBackendUrl } from '../../lib/backendUrl';
import { formatLocation } from '../../lib/utils';
import type { JobApplication } from '../../types/api';
const BACKEND = getPublicBackendUrl();
export function useJobApplication(job: any, setFetchError: (message: string | null) => void) {
  const router = useRouter();
  const {id} = router.query;
  const {t} = useTranslation('common');
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [applicationLoading, setApplicationLoading] = useState(true);
  const [applicationSaving, setApplicationSaving] = useState(false);
  useEffect(() => {
    if (!router.isReady || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return;
    const controller = new AbortController();
    setApplication(null); setApplicationLoading(true);
    void fetch(`/api/applications?jobId=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async response => response.ok ? (await response.json()).application : null)
      .then(saved => { if (!controller.signal.aborted) setApplication(saved ?? null); })
      .catch(error => { if (!(error instanceof Error && error.name === "AbortError")) setApplication(null); })
      .finally(() => { if (!controller.signal.aborted) setApplicationLoading(false); });
    return () => controller.abort();
  }, [id, router.isReady]);

  const markAsApplied = async () => {
    if (!job || typeof id !== "string" || applicationSaving) return;
    setApplicationSaving(true); setFetchError(null);
    const today = new Date();
    const appliedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: id,
          appliedAt,
          jobContext: {
            id,
            title: String(job.headline ?? job.title ?? t("jobDetail.defaultJobTitle")).slice(0, 200),
            company: String(job.employer?.name ?? job.advertiser ?? "").slice(0, 200),
            location: formatLocation(job.workplace_address).slice(0, 200),
          },
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.code === 'capacity' ? 'capacity' : 'save');
      }
      setApplication((await response.json()).application as JobApplication);
    } catch (cause) {
      setFetchError(t(cause instanceof Error && cause.message === 'capacity' ? 'applications.capacity' : 'applications.markError'));
    } finally { setApplicationSaving(false); }
  };

  return {application, applicationLoading, applicationSaving, markAsApplied};
}
