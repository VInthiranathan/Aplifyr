import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next";
import { getPublicBackendUrl } from "../../lib/backendUrl";
import { getSupabaseBrowserClient } from "../../lib/supabaseClient";
interface Insights {
  matchedSkills: string[];
  mentionedNotInProfile: string[];
  relevantExperience: Array<{ title: string; kind: string; skills: string[] }>;
}
export function MatchExplanation({ jobId }: { jobId: string }) {
  const { t } = useTranslation("common");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setInsights(null);
    setError(false);
    void (async () => {
      const {
        data: { session },
      } = await getSupabaseBrowserClient().auth.getSession();
      if (!session) throw Error();
      const res = await fetch(
        `${getPublicBackendUrl()}/api/jobinsights/${encodeURIComponent(jobId)}`,
        {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!res.ok) throw Error();
      const body = await res.json();
      if (!controller.signal.aborted) setInsights(body);
    })().catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [jobId]);
  return (
    <section className="app-card-base space-y-3 rounded-2xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("workspace.match.title")}</h2>
      {error ? (
        <p role="status">{t("workspace.match.unavailable")}</p>
      ) : !insights ? (
        <p role="status">{t("jobDetail.loading")}</p>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-white/60">
            {t("workspace.match.help")}
          </p>
          <div>
            <h3 className="text-sm font-semibold">
              {t("workspace.match.skills")}
            </h3>
            <p className="mt-1 text-sm">
              {insights.matchedSkills.join(" · ") ||
                t("workspace.match.noSkills")}
            </p>
          </div>
          {!!insights.relevantExperience.length && (
            <div>
              <h3 className="text-sm font-semibold">
                {t("workspace.match.experience")}
              </h3>
              <ul className="mt-1 space-y-1 text-sm">
                {insights.relevantExperience.map((entry, index) => (
                  <li key={index}>
                    {entry.title} · {entry.skills.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!insights.mentionedNotInProfile.length && (
            <div>
              <h3 className="text-sm font-semibold">
                {t("workspace.match.missing")}
              </h3>
              <p className="mt-1 text-sm">
                {insights.mentionedNotInProfile.join(" · ")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/60">
                {t("workspace.match.missingHelp")}
              </p>
            </div>
          )}
          {!!insights.matchedSkills.length && (
            <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
              {t("workspace.match.highlight", {
                skills: insights.matchedSkills.slice(0, 5).join(", "),
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
