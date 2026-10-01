import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabaseClient';
const AuthSessionContext = createContext({ userId: null as string | null, loading: true });
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ userId: null as string | null, loading: true });
  useEffect(() => {
    if (!isSupabaseConfigured) { setState({ userId: null, loading: false }); return; }
    let active = true, version = 0;
    const auth = getSupabaseBrowserClient().auth;
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      version++; if (active) setState({ userId: session?.user.id ?? null, loading: false });
    });
    const initial = version;
    auth.getSession().then(({ data }) => {
      if (active && version === initial) setState({ userId: data.session?.user.id ?? null, loading: false });
    }).catch(() => { if (active && version === initial) setState({ userId: null, loading: false }); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthSessionContext.Provider value={state}>{children}</AuthSessionContext.Provider>;
}
export const useAuthSession = () => useContext(AuthSessionContext);
