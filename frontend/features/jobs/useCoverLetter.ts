import {notifyWorkspace} from '../../lib/JobProgressContext';
import { generationDestination } from '../../lib/generationAccess';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect,useRef,useState } from 'react';
import { aiFailureCode } from '../../lib/aiFailure';
import { getPublicBackendUrl } from '../../lib/backendUrl';
import { getSupabaseBrowserClient } from '../../lib/supabaseClient';
const BACKEND = getPublicBackendUrl();
export function useCoverLetter(job: any, setFetchError: (message: string | null) => void, enabled = true) {
  const router = useRouter();
  const {id} = router.query;
  const {t} = useTranslation('common');
  const [generating, setGenerating] = useState(false);
  const generationRequest = useRef<AbortController | null>(null);
  const [loadingLetter, setLoadingLetter] = useState(true);
  const [letterLoadError, setLetterLoadError] = useState(false);
  const [reloadLetter, setReloadLetter] = useState(0);
  const [letter, setLetter] = useState<string | null>(null);
  const [letterRevision, setLetterRevision] = useState('');
  const [savingLetter, setSavingLetter] = useState(false);
  const [letterExpiresAt, setLetterExpiresAt] = useState<string | null>(null);
  const [deletingLetter, setDeletingLetter] = useState(false);
  // debug toggle removed
  const [consentOpen, setConsentOpen] = useState(false);
  const requestGeneration = async () => {
    if (generating || loadingLetter || letterLoadError) return;
    try {
      const destination = await generationDestination(`/jobs/${id}`);
      if (destination) { await router.push(destination); return; }
      setShowModal(false); setConsentOpen(true);
    } catch { setFetchError(t('guest.profileUnavailable')); }
  };
  useEffect(() => { setConsentOpen(false); }, [id]);
  const [showModal, setShowModal] = useState(false);
  const [career, setCareer] = useState<any[]>([]);
  const [selectedCareer, setSelectedCareer] = useState<string[]>([]);
  const [careerError, setCareerError] = useState(false);
  const [careerLoaded, setCareerLoaded] = useState(false);
  async function loadCareer() {
    setCareerError(false);
    try { const r=await fetch('/api/career');if(!r.ok)throw Error();setCareer((await r.json()).entries);setCareerLoaded(true); }
    catch {setCareerError(true);}
  }

  useEffect(() => {
    if (!enabled) { setLetter(null); setShowModal(false); setConsentOpen(false); setLoadingLetter(false); setLetterLoadError(false); setCareer([]); setSelectedCareer([]); setCareerLoaded(false); return; }
    if (!router.isReady || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return;
    const controller = new AbortController();
    generationRequest.current?.abort(); setGenerating(false);
    setLetter(null); setLetterRevision(''); setLetterExpiresAt(null); setShowModal(false); setLoadingLetter(true); setLetterLoadError(false);
    void (async () => {
      try {
        const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
        if (!session) throw new Error('authentication');
        const response = await fetch(`${BACKEND}/api/coverletters/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('storage');
        const saved = (await response.json()).letter;
        if (!controller.signal.aborted && saved && typeof saved.content === 'string' && typeof saved.expires_at === 'string') {
          setLetter(saved.content); setLetterRevision(saved.updated_at??'');
          setLetterExpiresAt(saved.expires_at);
          if (router.query.letter === '1') setShowModal(true);
        }
      } catch (error) {
        if (!controller.signal.aborted) setLetterLoadError(true);
      } finally { if (!controller.signal.aborted) setLoadingLetter(false); }
    })();
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        controller.abort(); generationRequest.current?.abort();
        setShowModal(false); setLetter(null); setLetterRevision(''); setLetterExpiresAt(null); notifyWorkspace(); setConsentOpen(false);
      }
    });
    return () => { controller.abort(); generationRequest.current?.abort(); subscription.unsubscribe(); };
  }, [id, router.isReady, router.query.letter, enabled, reloadLetter]);

  const generate = async () => {
    if (!enabled || !job || generating || loadingLetter || letterLoadError) return;
    const controller = new AbortController(); generationRequest.current = controller;
    setGenerating(true);
    setFetchError(null);
    try {
      // Get user profile for personalized letter
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) { await router.push(`/auth?returnTo=${encodeURIComponent(`/jobs/${id}`)}`); return; }
      let userProfile = null;
      if (session) {
        try {
          const profileRes = await fetch("/api/profile", {
            credentials: "same-origin", signal: controller.signal,
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            if (profileData.profile) {
              userProfile = {
                name: profileData.profile.full_name,
                title: profileData.profile.title,
                location: profileData.profile.location,
                bio: profileData.profile.bio,
                tech_stack: profileData.profile.tech_stack,
                roles: profileData.profile.roles,
                career: career.filter(e=>selectedCareer.includes(e.id)).slice(0,3).map(e=>({kind:e.kind,title:e.title,organization:e.organization,start_month:e.start_month,end_month:e.end_month,skills:e.skills})),
              };
            }
          }
        } catch (e) {
          console.error("Failed to fetch user profile:", e);
        }
      }

      if (!userProfile) { setFetchError(t('guest.profileUnavailable')); return; }
      if (controller.signal.aborted) return;
      const res = await fetch(`${BACKEND}/api/coverletters/generate-all`, {
        method: "POST", signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          jobs: [{id:String(job.id??id).slice(0,100),title:String(job.headline??job.title??'').slice(0,200),employer:{name:String(job.employer?.name??'').slice(0,200)},workplace_address:{municipality:String(job.workplace_address?.municipality??'').slice(0,200)},description:{text:String(typeof job.description==='string'?job.description:job.description?.text??'').slice(0,16000)}}],
          user: userProfile,
        }),
      });

      const data = await res.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setFetchError(t(`consent.errors.${aiFailureCode(data, res.status)}`));
        return;
      }

      if (Array.isArray(data) && data[0]?.coverLetter) {
        setLetter(data[0].coverLetter); setLetterRevision(''); notifyWorkspace();
        // Generation's response retains its contract; load the actual persisted revision.
        let savedExpiresAt = typeof data[0].expiresAt === 'string' ? data[0].expiresAt : null;
        try {
          const persisted = await fetch(`${BACKEND}/api/coverletters/${encodeURIComponent(String(id))}`, {signal:controller.signal,headers:{Authorization:`Bearer ${session.access_token}`}});
          if (!persisted.ok) throw new Error('storage');
          const saved = (await persisted.json()).letter;
          if (controller.signal.aborted) return;
          if (!saved || typeof saved.content !== 'string' || typeof saved.updated_at !== 'string' || !saved.updated_at || typeof saved.expires_at !== 'string') throw new Error('storage');
          setLetter(saved.content); setLetterRevision(saved.updated_at);
          savedExpiresAt = saved.expires_at;
        } catch {
          if (!controller.signal.aborted) setLetterLoadError(true);
        }
        if (controller.signal.aborted) return;
        setLetterExpiresAt(savedExpiresAt);
        setShowModal(true);
      } else if (Array.isArray(data) && data[0]?.error) {
        setFetchError(t(`consent.errors.${aiFailureCode(data, res.status)}`));
      } else {
        setFetchError(t('consent.generateError'));
      }
    } catch (e) {
      if (!controller.signal.aborted) setFetchError(t('consent.generateError'));
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
    }
  };

  const deleteCoverLetter = async () => {
    if (typeof id !== 'string' || deletingLetter || !window.confirm(t('coverLetter.deleteConfirm'))) return;
    setDeletingLetter(true);
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session) throw new Error('authentication');
      const response = await fetch(`${BACKEND}/api/coverletters/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('storage');
      setShowModal(false); setLetter(null); setLetterRevision(''); setLetterExpiresAt(null); notifyWorkspace();
    } catch {
      setFetchError(t('coverLetter.deleteError'));
    } finally {
      setDeletingLetter(false);
    }
  };

  const saveLetter = async (content: string): Promise<void> => {
    if (!enabled || typeof id !== 'string' || !letterRevision || savingLetter) throw new Error('storage');
    setSavingLetter(true);
    const controller = new AbortController(); generationRequest.current = controller;
    try {
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      if (!session) throw new Error('authentication');
      const response=await fetch(`${BACKEND}/api/coverletters/${encodeURIComponent(id)}`,{method:'PATCH',signal:controller.signal,headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({content,updatedAt:letterRevision})});
      const body=await response.json();
      if (!response.ok) throw new Error(body.error??'storage');
      if (!controller.signal.aborted) {setLetter(body.letter.content);setLetterRevision(body.letter.updated_at);setLetterExpiresAt(body.letter.expires_at);notifyWorkspace();}
    } finally {if(!controller.signal.aborted)setSavingLetter(false);}
  };

  return {saveLetter, letterRevision, savingLetter, generating, loadingLetter, letterLoadError, retryLetter: () => setReloadLetter(value => value + 1), letter, letterExpiresAt, deletingLetter, consentOpen, setConsentOpen,
    showModal, setShowModal, career, selectedCareer, setSelectedCareer, careerError, careerLoaded,
    loadCareer, requestGeneration, generate, deleteCoverLetter};
}
