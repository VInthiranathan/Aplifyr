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
import { isDebugUiEnabled } from "../lib/backendUrl";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import Link from "next/link";
import JobListCard from "../components/JobListCard";
import { useFavorites } from "../lib/useFavorites";
import { MapPin, Wifi, Briefcase, Bookmark, RefreshCw, Eye } from "lucide-react";
import { formatLocation } from "../lib/utils";
import { useMatchSession } from "../lib/matchSessionContext";
import { getPublicBackendUrl } from "../lib/backendUrl";
import { collectMatchSkills, matchProfileKey } from "../lib/matchProfile";
import { useState, useEffect } from "react";

const HOME_INITIAL_COUNT = 30;
const HOME_VIEW_MORE_STEP = 15;

interface Props {
  matchReq: MatchProfileRequest;
  progression: Progression;
  showDebug: boolean;
  profileId: string;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
  req,
  res,
  query,
}) => {
  // Progression is hardcoded — real data is out of scope until a later slice.
  const progression: Progression = { applied: 0, readyToApply: 0, readyToGenerate: 0 };
  res.setHeader("Cache-Control", "private, no-store");
  const showDebug = isDebugUiEnabled() && query.debug === "1";

  let matchReq: MatchProfileRequest = {};
  let profileId = "";

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

    profileId = user.id;
    const { data: careerEntries, error: careerError } = await supabase
      .from("profile_career_entries").select("skills").eq("user_id", user.id)
      .order("id");
    if (careerError) console.warn("[home] Could not load career skills for matching");
    matchReq = {
      roles: profile?.roles ?? [],
      title: profile?.title ?? "",
      tags: collectMatchSkills(profile?.tech_stack, careerEntries ?? []),
      location: profile?.location ?? "",
      locationPreferences: profile?.location_preferences ?? [],
    };
  }

  return {
    props: {
      matchReq,
      profileId,
      progression,
      showDebug,
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};

export default function Home(props: Props) {
  return <HomeContent key={props.profileId + matchProfileKey(props.matchReq)} {...props} />;
}

function HomeContent({ matchReq, progression, showDebug, profileId }: Props) {
  const { t } = useTranslation("common");
  const { toggleFavorite, isFavorite } = useFavorites();

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
      matchReqHash: currentHash,
      // fetchComplete intentionally NOT reset — the background pool keeps growing
    });
  };

  // ── Background poll — grows the cached job pool page-by-page ─────────────
  // Fires every 5 s until the backend signals fetchComplete=true.
  // Skips when the tab is backgrounded to conserve AF API quota.
  useEffect(() => {
    if (fetchComplete || desiredRolesSource === null || desiredRolesSource === "none") return;
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
  }, [fetchComplete, desiredRolesSource]);

  // Close grade tooltip when clicking anywhere outside
  useEffect(() => {
    if (!openGradeId) return;
    const close = () => setOpenGradeId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openGradeId]);

  const locationTierLabel: Record<string, string> = {
    same_municipality:  t("home.tierSameMunicipality"),
    same_region:        t("home.tierSameRegion"),
    same_region_nearby: t("home.tierNearbyArea"),
    same_region_strict: t("home.tierSameRegionStrict"),
    remote:             t("home.tierRemote"),
    country:            t("home.tierCountry"),
    no_preference:      t("home.tierNoPreference"),
    out_of_region:      t("home.tierOutOfRegion"),
  };

  return (
    <div className="app-page-shell">
      {/* Header Section */}
      <div className="app-page-header">
        <h1 className="app-page-title">{t("home.title")}</h1>
        <p className="app-page-subtitle">{t("home.subtitle")}</p>
      </div>

      {/* Stats Grid - Progression + Grades */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Progression Card */}
        <div className="lg:col-span-1 bg-gradient-to-br from-orange-300 via-purple-500 to-purple-700 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
          <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider mb-6">
            {t("home.progression")}
          </h3>

          <div className="flex justify-center mb-8">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="2.5"
                  strokeDasharray={`${readyPct} ${100 - readyPct}`}
                  strokeLinecap="round"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeDasharray={`${appliedPct} ${100 - appliedPct}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {progression.applied}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-white" />
                <span className="text-sm text-white/90">{t("home.applied")}</span>
              </div>
              <span className="text-sm font-semibold text-white">
                {progression.applied}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-white/50" />
                <span className="text-sm text-white/90">{t("home.readyToApply")}</span>
              </div>
              <span className="text-sm font-semibold text-white">
                {progression.readyToApply}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-white/20" />
                <span className="text-sm text-white/90">{t("home.readyToGenerate")}</span>
              </div>
              <span className="text-sm font-semibold text-white">
                {progression.readyToGenerate}
              </span>
            </div>
          </div>
        </div>

        {/* Grade Match Cards */}
        <div className="lg:col-span-3 grid grid-cols-3 gap-6">
          {/* A Grade */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-4 sm:p-8 border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md dark:shadow-none transition-all hover:scale-[1.02] group">
            <div className="flex items-center justify-center mb-4 sm:mb-6">
              <div className="px-4 py-2 rounded-full bg-green-100 dark:bg-green-500/20 group-hover:scale-110 transition-transform">
                <span className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">
                  A
                </span>
              </div>
            </div>
            <div>
              <p className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">
                {gradeA ?? <span className="text-gray-300 dark:text-white/20">—</span>}
              </p>
              <p className="text-sm text-gray-500 dark:text-white/50">
                {t("home.matches")}
              </p>
            </div>
          </div>

          {/* B Grade */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-4 sm:p-8 border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md dark:shadow-none transition-all hover:scale-[1.02] group">
            <div className="flex items-center justify-center mb-4 sm:mb-6">
              <div className="px-4 py-2 rounded-full bg-yellow-100 dark:bg-yellow-500/20 group-hover:scale-110 transition-transform">
                <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                  B
                </span>
              </div>
            </div>
            <div>
              <p className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">
                {gradeB ?? <span className="text-gray-300 dark:text-white/20">—</span>}
              </p>
              <p className="text-sm text-gray-500 dark:text-white/50">
                {t("home.matches")}
              </p>
            </div>
          </div>

          {/* C Grade */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-4 sm:p-8 border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md dark:shadow-none transition-all hover:scale-[1.02] group">
            <div className="flex items-center justify-center mb-4 sm:mb-6">
              <div className="px-4 py-2 rounded-full bg-red-100 dark:bg-red-500/20 group-hover:scale-110 transition-transform">
                <span className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                  C
                </span>
              </div>
            </div>
            <div>
              <p className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">
                {gradeC ?? <span className="text-gray-300 dark:text-white/20">—</span>}
              </p>
              <p className="text-sm text-gray-500 dark:text-white/50">
                {t("home.matches")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Job List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            {t("home.matchedJobs")}
          </h2>
          <div className="flex items-center gap-3">
            {!fetchComplete && matched.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/30">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-white/30 animate-pulse" />
                {t("home.findingMoreMatches")}
              </span>
            )}
            {desiredRolesSource !== null && !matchLoading && matched.length > 0 && (
              <button
                onClick={handleLoadDifferent}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition-colors"
              >
                <RefreshCw size={11} />
                {t("home.loadDifferentJobs")}
              </button>
            )}
            <span className="text-sm text-slate-500 dark:text-white/50">
              {desiredRolesSource !== null &&
                t("home.jobCount", { count: matched.length })}
            </span>
          </div>
        </div>

        {/* Loading skeleton — first paint before matches arrive */}
        {desiredRolesSource === null && !matchError && (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-6 border border-gray-200 dark:border-white/5 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-200 dark:bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {matchError && !matchLoading && (
          <div role="alert" className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-12 border border-gray-200 dark:border-white/5 text-center">
            <p className="text-gray-400 dark:text-white/40">
              {t("home.matchLoadError")}
            </p>
            <button type="button" className="app-secondary-button mt-4" onClick={() => setPoolRevision(value => value + 1)}>{t('career.retry')}</button>
          </div>
        )}

        {/* No roles — guide user to set up their profile */}
        {desiredRolesSource === "none" && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-12 border border-gray-200 dark:border-white/5 text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t("home.noRolesTitle")}
            </p>
            <p className="text-gray-400 dark:text-white/40 mb-6">
              {t("home.noRolesDescription")}
            </p>
            <Link href="/user" className="app-primary-button inline-flex items-center gap-2">
              {t("home.goToProfile")}
            </Link>
          </div>
        )}

        {/* Has roles but no matches */}
        {desiredRolesSource !== "none" &&
          desiredRolesSource !== null &&
          matched.length === 0 &&
          !matchLoading && !matchError && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-12 border border-gray-200 dark:border-white/5 text-center">
            <p className="text-gray-400 dark:text-white/40">
              {t(fetchComplete ? "home.noMatchesDescription" : "home.loadingMatches")}
            </p>
          </div>
        )}

        {/* Matched job cards — sliced to visible count */}
        {matched.slice(0, visibleCount).length > 0 && (
          <div className="grid gap-4">
            {matched.slice(0, visibleCount).map((job) => (
              <JobListCard
                key={job.id}
                leading={
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-white/20 overflow-hidden">
                    {job.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={job.logo_url}
                        alt=""
                        className="w-full h-full object-contain p-1.5"
                      />
                    ) : (
                      <Briefcase size={20} />
                    )}
                  </div>
                }
                title={
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-lg font-semibold text-gray-900 dark:text-white hover:underline leading-snug"
                  >
                    {job.headline}
                  </Link>
                }
                badges={
                  <div className="relative group/grade flex-shrink-0">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenGradeId(openGradeId === job.id ? null : job.id);
                      }}
                      className={`text-xs font-bold px-3 py-1 rounded-full cursor-pointer ${
                        job.matchGrade === "A"
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800/50"
                          : job.matchGrade === "B"
                            ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800/50"
                            : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800/50"
                      }`}
                    >
                      {job.matchGrade} {t("home.match")}
                    </span>
                    {/* Score tooltip — visible on hover (desktop) or tap (mobile) */}
                    <div
                      className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20
                        pointer-events-none transition-opacity duration-150
                        bg-gray-900 dark:bg-[#111] text-white text-xs rounded-xl p-3
                        shadow-xl border border-white/10 whitespace-nowrap
                        ${openGradeId === job.id ? 'opacity-100' : 'opacity-0 group-hover/grade:opacity-100'}`}
                    >
                      <div className="font-semibold text-white/90 mb-1.5">
                        {t("home.gradeScoreLabel")}: {job.matchDebug.totalScore}
                      </div>
                      <div className="text-white/60">{job.matchDebug.scoreBreakdown}</div>
                      <div className="text-white/60 mt-0.5">
                        {locationTierLabel[job.matchDebug.locationTier] ?? job.matchDebug.locationTier}
                      </div>
                      {/* Caret pointing down */}
                      <div
                        className="absolute top-full left-1/2 -translate-x-1/2
                          border-[5px] border-transparent border-t-gray-900 dark:border-t-[#111]"
                      />
                    </div>
                  </div>
                }
                subtitle={job.employer?.name}
                meta={
                  <>
                    {(job.workplace_address?.municipality ||
                      job.workplace_address?.region) && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} />
                        {formatLocation(job.workplace_address)}
                      </span>
                    )}
                    {job.remote && (
                      <span className="flex items-center gap-1 text-purple-500 dark:text-purple-400">
                        <Wifi size={13} />
                        {t("jobs.remoteLabel")}
                      </span>
                    )}
                  </>
                }
                tags={
                  <>
                    {job.working_hours_type?.label && (
                      <span className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10">
                        {job.working_hours_type.label}
                      </span>
                    )}
                    {job.employment_type?.label && (
                      <span className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10">
                        {job.employment_type.label}
                      </span>
                    )}
                  </>
                }
                aside={
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="app-secondary-button px-3 py-2 text-sm"
                      title={t("home.viewJob")}
                    >
                      <Eye size={15} />
                    </Link>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite({
                          id: job.id,
                          title: job.headline,
                          company: job.employer?.name ?? "",
                          location: formatLocation(job.workplace_address),
                          matchGrade: job.matchGrade,
                        });
                      }}
                      className={`flex-shrink-0 transition-colors p-2 ${
                        isFavorite(job.id)
                          ? "text-purple-500 dark:text-purple-400"
                          : "text-slate-300 dark:text-white/20 hover:text-purple-500 dark:hover:text-purple-400"
                      }`}
                      title={
                        isFavorite(job.id)
                          ? t("home.removeFavorite")
                          : t("home.addFavorite")
                      }
                    >
                      <Bookmark
                        size={18}
                        fill={isFavorite(job.id) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                }
                footer={
                  showDebug && job.matchDebug ? (
                    <div className="text-xs text-gray-400 dark:text-white/30 font-mono space-y-0.5">
                      {job.matchDebug.reasons.map((r, i) => (
                        <div key={i}>{r}</div>
                      ))}
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}

        {/* View more — only when there may be more jobs waiting in the backend */}
        {!matchLoading && matched.length > 0 && matched.length >= visibleCount && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                const newCount = visibleCount + HOME_VIEW_MORE_STEP;
                setVisibleCount(newCount);
                updateSession({ visibleCount: newCount });
              }}
              className="app-secondary-button"
            >
              {t("jobs.loadMore")}
            </button>
          </div>
        )}

        {/* Spinner for subsequent loads (e.g. after View more) */}
        {matchLoading && matched.length > 0 && (
          <div className="flex justify-center pt-2">
            <span className="text-sm text-gray-400 dark:text-white/40">
              {t("home.loadingMatches")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
