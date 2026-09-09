import { useState, useEffect, useRef } from 'react';
import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabaseClient';

export interface FavoriteJob {
  id: number | string;
  title: string;
  company: string;
  location: string;
  type?: string;
  grade?: 'A' | 'B' | 'C';
  matchGrade?: 'A' | 'B' | 'C';
  perks?: string[];
  isNew?: boolean;
  badge?: string | null;
  savedAt: number;
}
const keyFor = (id: string) => `aplifyr_favorites:${id}`;
const validJob = (job: any): job is FavoriteJob => job &&
  ['string', 'number'].includes(typeof job.id) && typeof job.title === 'string' &&
  Number.isFinite(job.savedAt);

export function useFavorites() {
  const [state, setState] = useState<{ owner: string | null; favorites: FavoriteJob[]; loaded: boolean }>({ owner: null, favorites: [], loaded: false });
  const owner = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    // The legacy key has no owner, so assigning it to the next login would expose another user's data.
    try { localStorage.removeItem('applifyr_favorites'); } catch { /* Storage unavailable. */ }
    const switchOwner = (id: string | null) => {
      if (!active) return;
      owner.current = id;
      let favorites: FavoriteJob[] = [];
      try {
        const parsed = id ? JSON.parse(localStorage.getItem(keyFor(id)) ?? '[]') : [];
        if (Array.isArray(parsed)) favorites = parsed.filter(validJob).slice(0, 1000);
      } catch { /* Invalid local data must not crash the page. */ }
      setState({ owner: id, favorites, loaded: true });
    };
    if (!isSupabaseConfigured) { switchOwner(null); return; }
    const supabase = getSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      version++;
      switchOwner(session?.user.id ?? null);
    });
    const initialVersion = version;
    supabase.auth.getUser().then(({ data, error }) => {
      if (version === initialVersion) switchOwner(error ? null : data.user?.id ?? null);
    }).catch(() => { if (version === initialVersion) switchOwner(null); });
    const refresh = () => switchOwner(owner.current);
    window.addEventListener('storage', refresh);
    window.addEventListener('aplifyr-favorites', refresh);
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener('storage', refresh); window.removeEventListener('aplifyr-favorites', refresh); };
  }, []);

  const change = (update: (jobs: FavoriteJob[]) => FavoriteJob[]) => {
    const id = owner.current;
    if (!id || id !== state.owner || !state.loaded) return;
    let current = state.favorites;
    try {
      const parsed = JSON.parse(localStorage.getItem(keyFor(id)) ?? '[]');
      if (Array.isArray(parsed)) current = parsed.filter(validJob);
    } catch { /* Use current in-memory state. */ }
    const favorites = update(current).slice(0, 1000);
    try { localStorage.setItem(keyFor(id), JSON.stringify(favorites)); } catch { /* Keep in memory. */ }
    window.dispatchEvent(new Event('aplifyr-favorites'));
    setState({ owner: id, favorites, loaded: true });
  };
  const isFavorite = (id: number | string) => state.favorites.some(job => String(job.id) === String(id));
  const addFavorite = (job: Omit<FavoriteJob, 'savedAt'>) => change(jobs => jobs.some(item => String(item.id) === String(job.id)) ? jobs : [...jobs, { ...job, savedAt: Date.now() }]);
  const removeFavorite = (id: number | string) => change(jobs => jobs.filter(job => String(job.id) !== String(id)));
  const toggleFavorite = (job: Omit<FavoriteJob, 'savedAt'>) => change(jobs => jobs.some(item => String(item.id) === String(job.id)) ? jobs.filter(item => String(item.id) !== String(job.id)) : [...jobs, { ...job, savedAt: Date.now() }]);
  return { favorites: state.favorites, loaded: state.loaded, isFavorite, addFavorite, removeFavorite, toggleFavorite, clearAllFavorites: () => change(() => []) };
}
