import { useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import AiGenerationConsent from '../../../components/AiGenerationConsent';
import CvTemplateThumbnail from '../../../components/CvTemplateThumbnail';
import { cvTemplateIds, type CvTemplateId } from '../../../lib/cvTemplates';
import CvPreview from '../../../components/CvPreview';
import { getPublicBackendUrl } from '../../../lib/backendUrl';
import { getSupabaseBrowserClient } from '../../../lib/supabaseClient';
import { useMatchSession } from '../../../lib/matchSessionContext';
import type { CvJobContext, GeneratedCv } from '../../../types/api';

export default function CvPage() {
  const router = useRouter(); const { t, i18n } = useTranslation('common'); const { getSession } = useMatchSession();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const [job, setJob] = useState<CvJobContext | null>(null);
  const [template, setTemplate] = useState<CvTemplateId>('elegant');
  const [cv, setCv] = useState<GeneratedCv | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const downloads = useRef(0);
  const templateGallery = useRef<HTMLDivElement | null>(null);
  const downloadingRef = useRef(false);
  const [consentOpen, setConsentOpen] = useState(false);
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
    downloads.current = 0; setTemplate('elegant');
    setConsentOpen(false); setJob(null); setCv(null); setError(''); setLoading(true); setBusy(false); generating.current = false;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) { setError(t('cv.errors.invalidJob')); setLoading(false); return; }
    call(false, controller).catch(e => { if (!controller.signal.aborted) displayError(e); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (owner.current !== null && session?.user.id !== owner.current)) { request.current?.abort(); setConsentOpen(false); setCv(null); setJob(null); setError(t('cv.errors.authentication')); }
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
  async function download() {
    if (!cv || !job || downloadingRef.current) return;
    downloadingRef.current = true; setDownloading(true); setError('');
    try {
      const { downloadCv } = await import('../../../lib/downloadCv.js');
      await downloadCv(cv.content, job.company, downloads.current + 1, t, request.current?.signal, template);
      downloads.current += 1;
    } catch { setError(t('cv.downloadError')); }
    finally { downloadingRef.current = false; setDownloading(false); }
  }
  async function deleteCv() {
    if (!cv || deleting || !window.confirm(t('cv.deleteConfirm'))) return;
    setDeleting(true); setError('');
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session) throw new Error('authentication');
      const response = await fetch(`${getPublicBackendUrl()}/api/cvs/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('storage');
      setCv(null);
    } catch (e) { displayError(e); }
    finally { setDeleting(false); }
  }
  function scrollTemplates(direction: -1 | 1) {
    const gallery = templateGallery.current;
    if (!gallery) return;
    gallery.scrollBy({ left: direction * Math.max(gallery.clientWidth * 0.82, 240), behavior: 'smooth' });
  }
  const grade = getSession().matched.find(j => j.id === id)?.matchGrade;
  return <div className="app-page-shell space-y-6">
    <header className="app-page-header"><h1 className="app-page-title">{t('cv.title')}</h1><p className="app-page-subtitle">{t('cv.description')}</p></header>
    <section className="app-card-base space-y-2 rounded-2xl p-4">
      {id && <Link className="mb-1 inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-sky-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 dark:text-sky-400" href={`/jobs/${encodeURIComponent(id)}`}><ArrowLeft aria-hidden="true" size={18} />{t('cv.back')}</Link>}
      <p className="text-sm text-gray-500 dark:text-white/60">{t('cv.forJob')}</p>
      <h2 className="break-words text-lg font-semibold sm:text-xl">{job?.title || t('jobDetail.defaultJobTitle')}</h2>
      {job?.company && <p>{job.company}</p>}{job?.location && <p>{job.location}</p>}
      {grade && <p>{t('cv.match', { grade })}</p>}
    </section>
    {loading && <p role="status">{t('cv.loading')}</p>}
    {error && <p role="alert" className="app-card-base p-4">{error}</p>}
    {job && <>
      <fieldset disabled={downloading} aria-describedby="cv-template-help" className="min-w-0 space-y-3">
        <legend className="sr-only">{t('cv.templates.title')}</legend>
        <div className="flex items-center justify-between gap-3">
          <span aria-hidden="true" className="text-lg font-semibold">{t('cv.templates.title')}</span>
          <div className="flex shrink-0 gap-2" aria-label={t('cv.templates.navigation')}>
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" onClick={() => scrollTemplates(-1)} aria-label={t('cv.templates.previous')}><ChevronLeft aria-hidden="true" /></button>
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" onClick={() => scrollTemplates(1)} aria-label={t('cv.templates.next')}><ChevronRight aria-hidden="true" /></button>
          </div>
        </div>
        <p id="cv-template-help" className="text-sm text-gray-600 dark:text-white/70">{t('cv.templates.help')}</p>
        <div ref={templateGallery} data-testid="cv-template-gallery" className="-mx-1 flex max-w-full touch-pan-x snap-x snap-proximity gap-4 overflow-x-auto overscroll-x-contain scroll-smooth px-1 pb-4 pr-10 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
          {cvTemplateIds.map(styleId => <label key={styleId} data-template-card={styleId} className={`app-card-base app-hover-standard relative w-[min(15rem,calc(100vw-4rem))] shrink-0 snap-start cursor-pointer rounded-2xl p-3 focus-within:ring-2 focus-within:ring-sky-700 ${template === styleId ? 'ring-2 ring-sky-700 dark:ring-sky-400' : ''}`}>
            <input type="radio" name="cv-template" value={styleId} checked={template === styleId} onChange={() => setTemplate(styleId)} className="sr-only" />
            <CvTemplateThumbnail
              template={styleId}
              name={t(`cv.templates.${styleId}.sampleName`)}
              title={t(`cv.templates.${styleId}.sampleTitle`)}
              summaryLabel={t('cv.summary')}
              experienceLabel={t('cv.experience')}
              educationLabel={t('cv.education')}
            />
            <span className="mt-3 flex items-center justify-between gap-3">
              <span className="font-semibold">{t(`cv.templates.${styleId}.name`)}</span>
              <span aria-hidden="true" className={`h-3 w-3 rounded-full border ${template === styleId ? 'border-sky-700 bg-sky-700 ring-2 ring-sky-200' : 'border-gray-400'}`} />
            </span>
            <span className="mt-1 block text-sm text-gray-600 dark:text-white/70">{t(`cv.templates.${styleId}.description`)}</span>
          </label>)}
        </div>
      </fieldset>
      <p>{t('cv.disclosure')}</p>
      {consentOpen && <AiGenerationConsent key={id} onClose={()=>setConsentOpen(false)} onConfirm={()=>{setConsentOpen(false);void generate();}} />}
      <div className="flex flex-wrap gap-3 items-center">
        <Button className="w-full sm:w-auto" disabled={busy || downloading} onClick={()=>setConsentOpen(true)}>{busy && <Loader2 className="animate-spin mr-2" size={16} />}{t(busy ? 'cv.generating' : cv ? 'cv.regenerate' : 'cv.generate')}</Button>
        <Link className="underline" href="/user">{t('cv.profile')}</Link>
      </div>
      <p role="status" aria-live="polite">{busy ? t('cv.progress') : cv ? t('cv.saved', { date: new Intl.DateTimeFormat(i18n?.language ?? router.locale ?? 'en', { dateStyle: 'medium' }).format(new Date(cv.expires_at)) }) : t('cv.ready')}</p>
      {cv && <><div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap"><Button className="min-w-0" disabled={downloading || busy || deleting} onClick={download}>{t(downloading ? 'cv.downloading' : 'cv.download')}</Button><Button className="min-w-0" variant="secondary" disabled={deleting || busy || downloading} onClick={deleteCv}>{deleting ? <Loader2 className="animate-spin mr-2" size={16} /> : <Trash2 className="mr-2" size={16} />}{t(deleting ? 'cv.deleting' : 'cv.delete')}</Button></div><p>{t('cv.review')}</p>{cv.metadata.sourceLimited && <p>{t('cv.limited')}</p>}{cv.content.omittedUnsupportedContent && <p role="status" data-testid="cv-omissions" className="app-card-base p-4">{t('cv.omissions')}</p>}<CvPreview content={cv.content} template={template} /></>}
    </>}
  </div>;
}
export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({ props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) } });
