import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect,useRef,useState } from 'react';
import { aiFailureCode } from '../../lib/aiFailure';
import { getPublicBackendUrl } from '../../lib/backendUrl';
import { getSupabaseBrowserClient } from '../../lib/supabaseClient';
const BACKEND = getPublicBackendUrl();
export function useCoverLetter(job: any, setFetchError: (message: string | null) => void) {
  const router = useRouter();
  const {id} = router.query;
  const {t} = useTranslation('common');
  const [generating, setGenerating] = useState(false);
  const generationRequest = useRef<AbortController | null>(null);
  const [loadingLetter, setLoadingLetter] = useState(true);
  const [letter, setLetter] = useState<string | null>(null);
  const [letterExpiresAt, setLetterExpiresAt] = useState<string | null>(null);
  const [deletingLetter, setDeletingLetter] = useState(false);
  // debug toggle removed
  const [consentOpen, setConsentOpen] = useState(false);
  const requestGeneration = () => { if (!generating) { setShowModal(false); setConsentOpen(true); } };
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
    if (!router.isReady || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return;
    const controller = new AbortController();
    generationRequest.current?.abort(); setGenerating(false);
    setLetter(null); setLetterExpiresAt(null); setShowModal(false); setLoadingLetter(true);
    void (async () => {
      try {
        const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
        if (!session) return;
        const response = await fetch(`${BACKEND}/api/coverletters/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal,
        });
        if (!response.ok) return;
        const saved = (await response.json()).letter;
        if (!controller.signal.aborted && saved && typeof saved.content === 'string' && typeof saved.expires_at === 'string') {
          setLetter(saved.content);
          setLetterExpiresAt(saved.expires_at);
          if (router.query.letter === '1') setShowModal(true);
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) console.error('Could not load saved cover letter');
      } finally { if (!controller.signal.aborted) setLoadingLetter(false); }
    })();
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        controller.abort(); generationRequest.current?.abort();
        setShowModal(false); setLetter(null); setLetterExpiresAt(null); setConsentOpen(false);
      }
    });
    return () => { controller.abort(); generationRequest.current?.abort(); subscription.unsubscribe(); };
  }, [id, router.isReady, router.query.letter]);

  const generate = async () => {
    if (!job || generating) return;
    const controller = new AbortController(); generationRequest.current = controller;
    setGenerating(true);
    setFetchError(null);
    try {
      // Get user profile for personalized letter
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

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
        setLetter(data[0].coverLetter);
        setLetterExpiresAt(typeof data[0].expiresAt === 'string' ? data[0].expiresAt : null);
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
      setShowModal(false); setLetter(null); setLetterExpiresAt(null);
    } catch {
      setFetchError(t('coverLetter.deleteError'));
    } finally {
      setDeletingLetter(false);
    }
  };

  return {generating, loadingLetter, letter, letterExpiresAt, deletingLetter, consentOpen, setConsentOpen,
    showModal, setShowModal, career, selectedCareer, setSelectedCareer, careerError, careerLoaded,
    loadCareer, requestGeneration, generate, deleteCoverLetter};
}
