import { hasGenerationProfile, safeReturnTo, signInHref } from './guestAccess';
import { getSupabaseBrowserClient } from './supabaseClient';
/** Check current state at the action boundary; backend independently enforces it. */
export async function generationDestination(destination: string): Promise<string | null> {
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
  if (!session) return signInHref(destination);
  const [profile, career] = await Promise.all([fetch('/api/profile'), fetch('/api/career')]);
  if (profile.status === 401 || career.status === 401) return signInHref(destination);
  if (!profile.ok || !career.ok) throw new Error('profileUnavailable');
  if (!hasGenerationProfile((await profile.json()).profile, (await career.json()).entries ?? []))
    return `/user?returnTo=${encodeURIComponent(safeReturnTo(destination))}`;
  return null;
}
