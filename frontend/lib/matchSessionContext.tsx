import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabaseClient";
import { createContext, useContext, useRef, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import type { MatchedJob } from "../types/api";

export interface MatchSession {
  matched: MatchedJob[];
  visibleCount: number;
  desiredRolesSource: "roles" | "title_fallback" | "none" | null;
  seed: number;
  fetchComplete: boolean;
  matchReqHash: string;
}

interface MatchSessionContextValue {
  getSession: () => MatchSession;
  updateSession: (patch: Partial<MatchSession>) => void;
  clearSession: () => void;
}

const INITIAL_SESSION: MatchSession = {
  matched: [],
  visibleCount: 30,
  desiredRolesSource: null,
  seed: 0,
  fetchComplete: false,
  matchReqHash: "",
};

const MatchSessionContext = createContext<MatchSessionContextValue>({
  getSession: () => ({ ...INITIAL_SESSION }),
  updateSession: () => {},
  clearSession: () => {},
});

export function MatchSessionProvider({ children }: { children: ReactNode }) {
  const ref = useRef<MatchSession>({ ...INITIAL_SESSION });
  const getSession = useCallback((): MatchSession => ref.current, []);
  const updateSession = useCallback((patch: Partial<MatchSession>) => {
    ref.current = { ...ref.current, ...patch };
  }, []);
  const clearSession = useCallback(() => {
    ref.current = { ...INITIAL_SESSION };
  }, []);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let owner: string | null = null;
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
      const nextOwner = session?.user.id ?? null;
      if (nextOwner !== owner || !nextOwner) clearSession();
      owner = nextOwner;
    });
    return () => subscription.unsubscribe();
  }, [clearSession]);
  return (
    <MatchSessionContext.Provider value={{ getSession, updateSession, clearSession }}>
      {children}
    </MatchSessionContext.Provider>
  );
}

export function useMatchSession(): MatchSessionContextValue {
  return useContext(MatchSessionContext);
}
