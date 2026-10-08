import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getPublicBackendUrl } from '../../lib/backendUrl';

const BACKEND = getPublicBackendUrl();

export function useJobDetails() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useTranslation('common');
  const [job, setJob] = useState<any | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [jobHtml, setJobHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const controller = new AbortController();
    setJob(null); setJobHtml(null); setFetchError(null); setFetching(false);
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
      setFetchError(t('jobDetail.notFound'));
      return;
    }
    setFetching(true);
    void (async () => {
      try {
        // Always load the canonical ad. Legacy query data may describe another
        // job or contain a forged application destination.
        const response = await fetch(`${BACKEND}/api/externaljobs/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? 'notFound' : 'unavailable');
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!body || typeof body !== 'object' || body.error || body.tracking_id) throw new Error('unavailable');
        if (String(body.cause?.code) === '404') throw new Error('notFound');
        if (typeof body.html === 'string') { setJobHtml(body.html); return; }
        const ad = Array.isArray(body.hits) ? body.hits.find((hit: any) => String(hit?.id) === id) : body.result ?? body;
        if (!ad || typeof ad !== 'object' || String(ad.id) !== id) throw new Error('notFound');
        setJob(ad);
      } catch (error) {
        if (!controller.signal.aborted) setFetchError(t(error instanceof Error && error.message === 'notFound' ? 'jobDetail.notFound' : 'consent.jobError'));
      } finally {
        if (!controller.signal.aborted) setFetching(false);
      }
    })();
    return () => controller.abort();
  }, [id, router.isReady, router.locale]);

  return { job, fetching, fetchError, setFetchError, jobHtml };
}
