import type { GetServerSideProps } from "next";
import type {
  MatchedJob,
  MatchedJobsResponse,
  Progression,
  MatchProfileRequest,
} from "../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/auth-helpers-nextjs";
import { useTranslation } from "next-i18next";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { getPublicBackendUrl } from "../lib/backendUrl";
import Link from "next/link";
import JobListCard from "../components/JobListCard";
import { useFavorites } from "../lib/useFavorites";
import { MapPin, Wifi, Briefcase, Bookmark, RefreshCw, Eye } from "lucide-react";
import { formatLocation } from "../lib/utils";
import { useMatchSession } from "../lib/matchSessionContext";
import { useState, useEffect } from "react";

const HOME_INITIAL_COUNT = 30;
const HOME_VIEW_MORE_STEP = 15;
const BACKEND = getPublicBackendUrl();

interface Props {
  matchReq: MatchProfileRequest;
  progression: Progression;
  showDebug: boolean;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
  req,
  res,
  query,
}) => {
  // Progression is hardcoded — real data is out of scope until a later slice.
  const progression: Progression = { applied: 0, readyToApply: 0, readyToGenerate: 0 };
  const showDebug = query.debug === "1";

  let matchReq: MatchProfileRequest = {};

  if (isSupabaseConfigured) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        cookies: {
          getAll() {
            return parseCookieHeader(req.headers.cookie ?? "").map((c) => ({
              name: c.name,
              value: c.value ?? "",
            }));
          },
          setAll(cookies) {
            const setCookie = cookies.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, options),
            );
            const existing = res.getHeader("Set-Cookie");
            const existingArray =
              typeof existing === "string"
                ? [existing]
                : Array.isArray(existing)
                  ? existing
                  : [];
            res.setHeader("Set-Cookie", [...existingArray, ...setCookie]);
          },
        },
      },
    );

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return {
          redirect: {
            destination: "/auth",
            permanent: false,
          },
        };
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("title, location, location_preferences, tech_stack, roles")
        .eq("id", user.id)
        .maybeSingle();

      matchReq = {
        roles: profile?.roles ?? [],
        title: profile?.title ?? undefined,
        tags: profile?.tech_stack ?? [],
        location: profile?.location ?? undefined,
        locationPreferences: profile?.location_preferences ?? [],
      };
    } catch (error) {
      console.error("[home] Failed to load Supabase session/profile", error);
      return {
        redirect: {
          destination: "/auth",
          permanent: false,
        },
      };
    }
  }

  return {
    props: {
      matchReq,
      progression,
      showDebug,
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};

export default function Home({ matchReq, progression, showDebug }: Props) {
  const { t } = useTranslation("common");
  const { toggleFavorite, isFavorite } = useFavorites();

  // ── Session context — persists matched jobs across SPA navigations ────────
  const { getSession, updateSession } = useMatchSession();

  // Stable hash of the current SSR profile — detects profile changes between navigations.
  const [currentHash] = useState<string>(() =>
    JSON.stringify({
      roles: [...(matchReq.roles ?? [])].sort(),
      title: matchReq.title ?? null,
      tags: [...(matchReq.tags ?? [])].sort(),
      location: matchReq.location ?? null,
      locationPreferences: [...(matchReq.locationPreferences ?? [])].sort(),
    })
  );

  // Restore session if the profile hasn't changed since the last visit.
  const [_snap] = useState(() => {
    const s = getSession();
    return s.matchReqHash === currentHash && s.matched.length > 0 ? s : null;
  });

  // ── Matched jobs client state ────────────────────────────────────────────
  const [matched, setMatched] = useState<MatchedJob[]>(_snap?.matched ?? []);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [desiredRolesSource, setDesiredRolesSource] = useState<
    "roles" | "title_fallback" | "none" | null
  >(_snap?.desiredRolesSource ?? null);

  // ── Visible count + seed (used by Load Different to shuffle the cached pool) ──
  const [visibleCount, setVisibleCount] = useState(_snap?.visibleCount ?? HOME_INITIAL_COUNT);
  const [seed, setSeed] = useState(_snap?.seed ?? 0);
  const [fetchComplete, setFetchComplete] = useState(_snap?.fetchComplete ?? false);
  // Grade badge tap-to-reveal state (for touch devices)
  const [openGradeId, setOpenGradeId] = useState<string | null>(null);

  // ── Fetch matches after mount (and whenever visibleCount / seed changes) ──
  useEffect(() => {
    // Only refetch when we need more jobs than we already have loaded.
    if (matched.length >= visibleCount) return;

    const controller = new AbortController();

    async function loadMatches() {
      setMatchLoading(true);
      setMatchError(null);
      try {
        const res = await fetch(
          `${BACKEND}/api/externaljobs/match?limit=${visibleCount}&seed=${seed}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(matchReq),
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error(`backend ${res.status}`);
        const data: MatchedJobsResponse = await res.json();

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
        setMatchLoading(false);
      }
    }

    loadMatches();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, seed]);

  const total =
    progression.applied + progression.readyToApply + progression.readyToGenerate || 1;
  const appliedPct = (progression.applied / total) * 100;
  const readyPct =
    ((progression.applied + progression.readyToApply) / total) * 100;

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
      fetchComplete: false,
      matchReqHash: currentHash,
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 dark:bg-[#0d0d0d] dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#161616] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">{t("home.overview")}</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("home.heading")}</h1>
              </div>
              <Link href="/user" className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5">
                {t("home.editProfile")}
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/50">{t("home.applied")}</p>
                <p className="mt-2 text-2xl font-bold">{progression.applied}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/50">{t("home.readyToApply")}</p>
                <p className="mt-2 text-2xl font-bold">{progression.readyToApply}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/50">{t("home.readyToGenerate")}</p>
                <p className="mt-2 text-2xl font-bold">{progression.readyToGenerate}</p>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between text-sm text-gray-500 dark:text-white/50">
                <span>{t("home.progress")}</span>
                <span>{Math.round(readyPct)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                <div className="h-full bg-purple-600 transition-all" style={{ width: `${Math.max(appliedPct, readyPct)}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#161616] sm:p-8">
            <p className="text-sm font-medium text-purple-600 dark:text-purple-400">{t("home.matchSummary")}</p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[["A", gradeA], ["B", gradeB], ["C", gradeC]].map(([grade, count]) => (
                <div key={String(grade)} className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
                  <p className="text-xs text-gray-500 dark:text-white/50">{t("home.grade", { grade })}</p>
                  <p className="mt-2 text-2xl font-bold">{count ?? "–"}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-[#161616] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-purple-600 dark:text-purple-400">{t("home.recommendedJobs")}</p>
              <h2 className="mt-1 text-2xl font-bold">{t("home.matchesForYou")}</h2>
            </div>
            <button onClick={handleLoadDifferent} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5" disabled={matchLoading}>
              <RefreshCw className={`h-4 w-4 ${matchLoading ? "animate-spin" : ""}`} />
              {t("home.loadDifferent")}
            </button>
          </div>

          {matchLoading && matched.length === 0 && <p className="mt-6 text-sm text-gray-500 dark:text-white/50">{t("home.loadingMatches")}</p>}
          {matchError && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{matchError}</p>}

          <div className="mt-6 grid gap-4">
            {matched.slice(0, visibleCount).map((job) => (
              <JobListCard
                key={job.id}
                href={`/jobs/${job.id}`}
                title={job.headline}
                company={job.employer?.name ?? ""}
                location={formatLocation(job.workplace_address)}
                matchGrade={job.matchGrade}
                isFavorite={isFavorite(job.id)}
                onToggleFavorite={() => toggleFavorite(job.id)}
              />
            ))}
          </div>

          {matched.length > 0 && matched.length >= visibleCount && !fetchComplete && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setVisibleCount((count) => count + HOME_VIEW_MORE_STEP)}
                className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {t("home.viewMore")}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
