import { createContext, useContext, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import type { MatchedJob } from "../types/api";

export interface MatchSession {
  matched: MatchedJob[];
  visibleCount: number;
  desiredRolesSource: "roles" | "title_fallback" | "none" | null;
  jobPage: number;
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
  jobPage: 0,
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
  return (
    <MatchSessionContext.Provider value={{ getSession, updateSession, clearSession }}>
      {children}
    </MatchSessionContext.Provider>
  );
}

export function useMatchSession(): MatchSessionContextValue {
  return useContext(MatchSessionContext);
}
