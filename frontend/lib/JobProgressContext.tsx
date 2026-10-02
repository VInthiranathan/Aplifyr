import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuthSession } from "./AuthSessionContext";
import type { JobProgress } from "./jobProgress";
const ReadyContext = createContext(false);
const Context = createContext<Record<string, JobProgress>>({});
export function JobProgressProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuthSession();
  const [state, setState] = useState<{
    owner: string;
    progress: Record<string, JobProgress>;
  }>({ owner: "", progress: {} });
  useEffect(() => {
    if (!userId) {
      setState({ owner: "", progress: {} });
      return;
    }
    const controller = new AbortController();
    let version = 0;
    async function load() {
      const current = ++version;
      try {
        const res = await fetch("/api/workspace", {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = await res.json();
        if (
          !controller.signal.aborted &&
          current === version &&
          body.owner === userId
        )
          setState({ owner: userId!, progress: body.progress });
      } catch {
        /* Supplementary badges never block browsing. */
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("aplifyr-workspace", refresh);
    return () => {
      clearInterval(timer);
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("aplifyr-workspace", refresh);
    };
  }, [userId]);
  return (
    <ReadyContext.Provider value={!!userId && state.owner === userId}>
      <Context.Provider value={state.owner === userId ? state.progress : {}}>
        {children}
      </Context.Provider>
    </ReadyContext.Provider>
  );
}
export const useJobProgressReady = () => useContext(ReadyContext);
export const useJobProgress = () => useContext(Context);
export function notifyWorkspace() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("aplifyr-workspace"));
}
