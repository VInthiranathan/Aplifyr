import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect,useState } from 'react';
import { getPublicBackendUrl } from '../../lib/backendUrl';
const BACKEND = getPublicBackendUrl();
function decodeJob(encoded?: string) {
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(atob(decodeURIComponent(encoded)));
    return JSON.parse(json);
  } catch {
    try {
      const json2 = decodeURIComponent(encoded);
      return JSON.parse(json2);
    } catch {
      return null;
    }
  }
}

export function useJobDetails() {
  const router = useRouter();
  const {id, data} = router.query;
  const {t} = useTranslation('common');
  const [job, setJob] = useState<any | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // raw API response logging removed
  const [jobHtml, setJobHtml] = useState<string | null>(null);
  useEffect(() => {
    // If `data` param exists (old behavior) prefer it, else fetch by id from backend
    if (data) {
      const decoded = Array.isArray(data) ? data[0] : data;
      const j = decodeJob(decoded as string);
      if (j) {
        setJob(j);
        return;
      }
    }

    if (!id) return;
    const fetchJob = async () => {
      setFetching(true);
      setFetchError(null);
      try {
        const res = await fetch(`${BACKEND}/api/externaljobs/${id}`);
        const text = await res.text();
        if (!res.ok) {
          setFetchError(t('consent.jobError'));
          return;
        }
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (err) {
          data = text;
        }
        // If backend returned a structured error (e.g. Arbetsförmedlingen API provided
        // { cause: { code: '404', ... } }) treat as not-found and surface a message
        if (
          data &&
          typeof data === "object" &&
          data.cause &&
          data.cause.code === "404"
        ) {
          setFetchError(t("jobDetail.notFound"));
          setJob(null);
          setJobHtml(null);
          return;
        }

        // If backend returned a non-API error shape, surface it
        if (
          data &&
          typeof data === "object" &&
          (data.error || data.tracking_id)
        ) {
          setFetchError(t('consent.jobError'));
          setJob(null);
          setJobHtml(null);
          return;
        }

        // If backend returned a html fallback: { html: '...' }
        if (data && typeof data === "object" && typeof data.html === "string") {
          setJobHtml(data.html);
          setJob(null);
        }
        // API might return object with 'hits' or the job directly
        else if (
          data &&
          data.hits &&
          Array.isArray(data.hits) &&
          data.hits.length > 0
        )
          setJob(data.hits[0]);
        else if (data && data.result != null) setJob(data.result);
        else setJob(data);
      } catch (e) {
        console.error("Could not fetch job", e);
        setFetchError(t('consent.jobError'));
      } finally {
        setFetching(false);
      }
    };

    fetchJob();
  }, [data, id]);

  return {job, fetching, fetchError, setFetchError, jobHtml};
}
