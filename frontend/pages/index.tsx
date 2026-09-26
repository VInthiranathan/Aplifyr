import { RefreshCw } from "lucide-react";
import type { GetServerSideProps } from "next";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useState } from "react";
import { MatchedJobs } from '../features/home/MatchedJobs';
import { MatchGradeSummary } from '../features/home/MatchGradeSummary';
import { PreparedJobs,usePreparedJobs } from '../features/home/PreparedJobs';
import { useHomeMatches } from '../features/home/useHomeMatches';
import { isDebugUiEnabled } from "../lib/backendUrl";
import { collectMatchSkills,matchProfileKey } from "../lib/matchProfile";
import { serverSupabase } from "../lib/serverSupabase";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import type {
MatchProfileRequest,
PreparedJob
} from "../types/api";

const HOME_INITIAL_COUNT = 30;
const HOME_VIEW_MORE_STEP = 15;

interface Props {
  matchReq: MatchProfileRequest;
  preparedJobs: PreparedJob[];
  showDebug: boolean;
  profileId: string;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
  req,
  res,
  query,
}) => {
  res.setHeader("Cache-Control", "private, no-store");
  const showDebug = isDebugUiEnabled() && query.debug === "1";

  let matchReq: MatchProfileRequest = {};
  let profileId = "";
  let preparedJobs: PreparedJob[] = [];

  if (isSupabaseConfigured) {
    const supabase = serverSupabase(req, res);

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
    const { data: prepared, error: preparedError } = await supabase
      .from("prepared_jobs")
      .select("job_id,job_context,has_cv,cv_expires_at,has_cover_letter,cover_letter_expires_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (preparedError) console.warn("[home] Could not load prepared jobs");
    else preparedJobs = ((prepared ?? []) as PreparedJob[]).map(job => {
      const activeCv = job.has_cv && !!job.cv_expires_at && new Date(job.cv_expires_at).getTime() > Date.now();
      const activeLetter = job.has_cover_letter && !!job.cover_letter_expires_at && new Date(job.cover_letter_expires_at).getTime() > Date.now();
      return {
        ...job,
        has_cv: activeCv,
        cv_expires_at: activeCv ? job.cv_expires_at : null,
        has_cover_letter: activeLetter,
        cover_letter_expires_at: activeLetter ? job.cover_letter_expires_at : null,
      };
    });
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
      preparedJobs,
      showDebug,
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};

export default function Home(props: Props) {
  return <HomeContent key={props.profileId + matchProfileKey(props.matchReq)} {...props} />;
}

function HomeContent({ matchReq, preparedJobs: initialPreparedJobs, showDebug, profileId }: Props) {
  const {t} = useTranslation('common');
  const [activeJobsTab, setActiveJobsTab] = useState<'matched' | 'prepared'>('matched');
  const matches = useHomeMatches(matchReq, profileId);
  const prepared = usePreparedJobs(initialPreparedJobs);
  const {matched, matchLoading, poolLimited, desiredRolesSource, fetchComplete, handleLoadDifferent} = matches;
  const {preparedJobs} = prepared;

  return (
    <div className="app-page-shell">
      {/* Header Section */}
      <div className="app-page-header">
        <h1 className="app-page-title">{t("home.title")}</h1>
        <p className="app-page-subtitle">{t("home.subtitle")}</p>
      </div>

      <MatchGradeSummary {...matches} />

      {/* Job List Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div role="tablist" aria-label={t("home.jobTabsLabel")} className="grid w-full grid-cols-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5 sm:inline-flex sm:w-fit">
            {(["matched", "prepared"] as const).map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeJobsTab === tab}
                onClick={() => setActiveJobsTab(tab)}
                className={`min-w-0 truncate rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 sm:py-2 ${activeJobsTab === tab ? "bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white" : "text-gray-500 hover:text-gray-800 dark:text-white/50 dark:hover:text-white"}`}
              >
                {t(tab === "matched" ? "home.matchedJobs" : "home.preparedJobs")}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {activeJobsTab === "matched" && !fetchComplete && !poolLimited && matched.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/30">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-white/30 animate-pulse" />
                {t("home.findingMoreMatches")}
              </span>
            )}
            {activeJobsTab === "matched" && desiredRolesSource !== null && !matchLoading && matched.length > 0 && (
              <button
                onClick={handleLoadDifferent}
                className="flex min-h-10 items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600 dark:text-white/30 dark:hover:text-white/60"
              >
                <RefreshCw size={11} />
                {t("home.loadDifferentJobs")}
              </button>
            )}
            <span className="text-sm text-slate-500 dark:text-white/50">
              {activeJobsTab === "prepared"
                ? t("home.jobCount", { count: preparedJobs.length })
                : desiredRolesSource !== null && t("home.jobCount", { count: matched.length })}
            </span>
          </div>
        </div>

        {activeJobsTab === "matched" ? <MatchedJobs model={matches} showDebug={showDebug} /> : <PreparedJobs model={prepared} />}

      </div>
    </div>
  );
}
