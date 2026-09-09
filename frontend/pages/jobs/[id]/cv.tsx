import { useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import AiConsent from '../../../components/AiConsent';
import CvPreview from '../../../components/CvPreview';
import { getPublicBackendUrl } from '../../../lib/backendUrl';
import { getSupabaseBrowserClient } from '../../../lib/supabaseClient';
import { useMatchSession } from '../../../lib/matchSessionContext';
import type { CvJobContext, GeneratedCv } from '../../../types/api';

export default function CvPage() {
  const router = useRouter(); const { t } = useTranslation('common'); const { getSession } = useMatchSession();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const [job, setJob] = useState<CvJobContext | null>(null);
  const [cv, setCv] = useState<GeneratedCv | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const generating = useRef(false);
  const owner = useRef<string | null>(null);
  async function call(generate: boolean, controller: AbortController) {
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
    if (!session) throw new Error('authentication');
    owner.current = session.user.id;
    const response = await fetch(`${getPublicBackendUrl()}/api/cvs/${encodeURIComponent(id)}${generate ? '/generate' : ''}`, {
      method: generate ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error ?? (response.status === 401 ? 'authentication' : response.status === 429 ? 'quota' : 'unavailable'));
    }
    const data = await response.json();
    if (data.job?.id !== id || (data.cv && data.cv.job_id !== id)) throw new Error('invalidJob');
    if (!controller.signal.aborted) { setJob(data.job); setCv(data.cv); }
  }
  function displayError(e: unknown) {
    const key = e instanceof Error ? e.message : 'unavailable';
    setError(t(`cv.errors.${key}`, { defaultValue: t('cv.errors.unavailable') }));
  }
  useEffect(() => {
    if (!router.isReady) return;
    const controller = new AbortController(); request.current = controller;
    setJob(null); setCv(null); setError(''); setLoading(true); setBusy(false); generating.current = false;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) { setError(t('cv.errors.invalidJob')); setLoading(false); return; }
    call(false, controller).catch(e => { if (!controller.signal.aborted) displayError(e); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (owner.current !== null && session?.user.id !== owner.current)) { request.current?.abort(); setCv(null); setJob(null); setError(t('cv.errors.authentication')); }
    });
    return () => { controller.abort(); request.current?.abort(); subscription.unsubscribe(); };
  }, [id, router.isReady]);
  async function generate() {
    if (generating.current) return;
    generating.current = true; setBusy(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try { await call(true, controller); } catch (e) { if (!controller.signal.aborted) displayError(e); }
    finally { if (!controller.signal.aborted) { setBusy(false); generating.current = false; } }
  }
  const grade = getSession().matched.find(j => j.id === id)?.matchGrade;
  return <div className="app-page-shell space-y-6">
    <header className="app-page-header"><h1 className="app-page-title">{t('cv.title')}</h1><p className="app-page-subtitle">{t('cv.description')}</p></header>
    <section className="app-card-base sticky top-0 z-10 p-4 space-y-2 bg-white dark:bg-[#1a1a1a]">
      <p className="text-sm text-gray-500 dark:text-white/60">{t('cv.forJob')}</p>
      <h2 className="text-xl font-semibold">{job?.title || t('jobDetail.defaultJobTitle')}</h2>
      {job?.company && <p>{job.company}</p>}{job?.location && <p>{job.location}</p>}
      {grade && <p>{t('cv.match', { grade })}</p>}
      {id && <Link className="underline" href={`/jobs/${encodeURIComponent(id)}`}>{t('cv.back')}</Link>}
    </section>
    {loading && <p role="status">{t('cv.loading')}</p>}
    {error && <p role="alert" className="app-card-base p-4">{error}</p>}
    {job && <>
      <p>{t('cv.disclosure')}</p><AiConsent providers={['gemini']} />
      <div className="flex flex-wrap gap-3 items-center">
        <Button disabled={busy} onClick={generate}>{busy && <Loader2 className="animate-spin mr-2" size={16} />}{t(busy ? 'cv.generating' : cv ? 'cv.regenerate' : 'cv.generate')}</Button>
        <Link className="underline" href="/user">{t('cv.profile')}</Link>
      </div>
      <p role="status" aria-live="polite">{busy ? t('cv.progress') : cv ? t('cv.saved') : t('cv.ready')}</p>
      {cv && <><p>{t('cv.review')}</p>{cv.metadata.sourceLimited && <p>{t('cv.limited')}</p>}<CvPreview content={cv.content} /></>}
    </>}
  </div>;
}
export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({ props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) } });
