import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { CareerEntry } from '../types/api';

type CareerEntriesState = {
  entries: CareerEntry[];
  setEntries: Dispatch<SetStateAction<CareerEntry[]>>;
  loading: boolean;
  loadError: string;
  load: () => Promise<void>;
};
const CareerEntriesContext = createContext<CareerEntriesState | null>(null);

/** One source of saved facts for the overview and both editors. Drafts stay in the editors. */
export function CareerEntriesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CareerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/career', { credentials: 'same-origin', signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setLoadError(response.status === 401 ? 'unauthenticated' : 'loadError');
        return;
      }
      const data = await response.json();
      if (!Array.isArray(data.entries)) throw new Error('Invalid career response');
      if (!controller.signal.aborted) setEntries(data.entries);
    } catch {
      if (!controller.signal.aborted) setLoadError('loadError');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [load]);
  return <CareerEntriesContext.Provider value={{ entries, setEntries, loading, loadError, load }}>{children}</CareerEntriesContext.Provider>;
}

export function useCareerEntries() {
  const state = useContext(CareerEntriesContext);
  if (!state) throw new Error('CareerEntriesProvider is required');
  return state;
}
