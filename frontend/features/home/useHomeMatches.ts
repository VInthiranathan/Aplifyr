import { useEffect,useState } from 'react';
import { getPublicBackendUrl } from '../../lib/backendUrl';
import { matchProfileKey } from '../../lib/matchProfile';
import { useMatchSession } from '../../lib/matchSessionContext';
import type { MatchedJob,MatchedJobsResponse,MatchProfileRequest } from '../../types/api';
const HOME_INITIAL_COUNT = 30;
const HOME_VIEW_MORE_STEP = 15;
export function useHomeMatches(matchReq: MatchProfileRequest, profileId: string) {
  // ── Session context — persists matched jobs across SPA navigations ────────
  const { getSession, updateSession } = useMatchSession();

  // Stable hash of the current SSR profile — detects profile changes between navigations.
  const currentHash = profileId + matchProfileKey(matchReq);

  // Restore session if the profile hasn't changed since the last visit.
  const [_snap] = useState(() => {
    const s = getSession();
    return s.matchReqHash === currentHash && s.matched.length > 0 ? s : null;
  });

  // ── Matched jobs client state ────────────────────────────────────────────
  const [matched, setMatched] = useState<MatchedJob[]>(_snap?.matched ?? []);
  const [poolRevision, setPoolRevision] = useState(0);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [poolLimited,setPoolLimited]=useState(false);
  const [desiredRolesSource, setDesiredRolesSource] = useState<
    "roles" | "title_fallback" | "none" | null
  >(_snap?.desiredRolesSource ?? null);

  // ── Visible count + seed (used by Load Different to shuffle the cached pool) ──
  const [visibleCount, setVisibleCount] = useState(_snap?.visibleCount ?? HOME_INITIAL_COUNT);
  const [seed, setSeed] = useState(_snap?.seed ?? 0);
  const [fetchComplete, setFetchComplete] = useState(_snap?.fetchComplete ?? false);
  // Grade badge tap-to-reveal state (for touch devices)

  // ── Fetch matches after mount (and whenever visibleCount / seed changes) ──
  useEffect(() => {
    // Only refetch when we need more jobs than we already have loaded.
    if (poolRevision === 0 && matched.length >= visibleCount) return;

    const controller = new AbortController();

    async function loadMatches() {
      setMatchLoading(true);
      setMatchError(null);
      try {
        const backendBase = getPublicBackendUrl();
        const res = await fetch(
          `${backendBase}/api/externaljobs/match?limit=${visibleCount}&seed=${seed}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(matchReq),
            signal: controller.signal,
          },
        );
        if(res.status===422)setPoolLimited(true);
        if (!res.ok) throw new Error(`backend ${res.status}`);
        const data: MatchedJobsResponse = await res.json();

        if (controller.signal.aborted) return;
        setMatched(data.matched);
        setDesiredRolesSource(data.profileUsed.desiredRolesSource);
        setFetchComplete(data.stats.fetchComplete);
        updateSession({
          matched: data.matched,
          desiredRolesSource: data.profileUsed.desiredRolesSource,
          visibleCount,
          seed,
          fetchComplete: data.stats.fetchComplete,
          matchReqHash: currentHash,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setMatchError(
          err instanceof Error ? err.message : "Could not load matches",
        );
      } finally {
        if (!controller.signal.aborted) setMatchLoading(false);
      }
    }

    loadMatches();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, seed, poolRevision]);

  const gradeA = desiredRolesSource !== null ? matched.filter((j) => j.matchGrade === "A").length : null;
  const gradeB = desiredRolesSource !== null ? matched.filter((j) => j.matchGrade === "B").length : null;
  const gradeC = desiredRolesSource !== null ? matched.filter((j) => j.matchGrade === "C").length : null;

  const handleLoadDifferent = () => {
    // Generate a non-zero seed so the backend shuffles within grade buckets.
    // seed=0 means "default sorted order"; non-zero values produce a distinct subset.
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    setSeed(newSeed);
    setMatched([]);
    setDesiredRolesSource(null);
    setVisibleCount(HOME_INITIAL_COUNT);
    updateSession({
      seed: newSeed,
      matched: [],
      desiredRolesSource: null,
      visibleCount: HOME_INITIAL_COUNT,
      matchReqHash: currentHash,
      // fetchComplete intentionally NOT reset — the background pool keeps growing
    });
  };

  // ── Background poll — grows the cached job pool page-by-page ─────────────
  // Fires every 5 s until the backend signals fetchComplete=true.
  // Skips when the tab is backgrounded to conserve AF API quota.
  useEffect(() => {
    if (fetchComplete || poolLimited || desiredRolesSource === null || desiredRolesSource === "none") return;
    const backendBase = getPublicBackendUrl();
    let inFlight = false;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (inFlight) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetch(`${backendBase}/api/externaljobs/match/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(matchReq),
          signal: controller.signal,
        });
        if(res.status===422){setPoolLimited(true);return;}
        if (!res.ok) return;
        const result = await res.json() as { fetchComplete: boolean; addedCount: number; cacheExpired?: boolean };
        if (controller.signal.aborted) return;
        if (result.addedCount > 0 || result.cacheExpired) setPoolRevision(value => value + 1);
        if (result.fetchComplete) {
          setFetchComplete(true);
          updateSession({ fetchComplete: true });
        }
      } catch {
        // Retry temporary upstream failures on the next tick.
      } finally { inFlight = false; }
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchComplete, desiredRolesSource, poolLimited]);

  const loadMore = () => {
    const newCount = visibleCount + HOME_VIEW_MORE_STEP;
    setVisibleCount(newCount);
    updateSession({visibleCount: newCount});
  };
  const retry = () => setPoolRevision(value => value + 1);
  return {matched, matchLoading, matchError, poolLimited, desiredRolesSource, visibleCount, fetchComplete,
    gradeA, gradeB, gradeC, handleLoadDifferent, loadMore, retry};
}
