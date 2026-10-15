import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import {
  activePreparation,
  localDay,
  needsFollowUp,
} from "../../lib/jobProgress";
import type { JobApplication, PreparedJob } from "../../types/api";
export type QueueApplication = Pick<
  JobApplication,
  | "job_id"
  | "job_context"
  | "status"
  | "applied_at"
  | "next_step"
  | "next_step_at"
  | "updated_at"
>;
export function useWorkQueue(initial: QueueApplication[], failed: boolean) {
  const [applications, setApplications] = useState(initial);
  const [error, setError] = useState(failed);
  const [retryVersion, setRetryVersion] = useState(0);
  const retry = () => setRetryVersion(value => value + 1);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    setNow(new Date());
    async function refresh() {
      const v = ++version;
      try {
        const r = await fetch("/api/work-queue", { signal: controller.signal });
        if (!r.ok) throw Error();
        const body = await r.json();
        if (!controller.signal.aborted && v === version) {
          setApplications(body.applications);
          setError(false);
          setNow(new Date());
        }
      } catch {
        if (!controller.signal.aborted && v === version) setError(true);
      }
    }
    if (retryVersion > 0) void refresh();
    const handler = () => void refresh();
    window.addEventListener("focus", handler);
    window.addEventListener("aplifyr-workspace", handler);
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", handler);
      window.removeEventListener("aplifyr-workspace", handler);
    };
  }, [retryVersion]);
  return { retry, applications, error, today: now ? localDay(now) : null };
}
export function NextActions({
  preparedJobs,
  preparedError = false,
  queue,
  matchCount,
  onShowPrepared,
  onShowMatched,
}: {
  preparedJobs: PreparedJob[];
  preparedError?: boolean;
  queue: ReturnType<typeof useWorkQueue>;
  matchCount: number;
  onShowPrepared?: () => void;
  onShowMatched?: () => void;
}) {
  const { t } = useTranslation("common");
  const submitted = new Set(queue.applications.map((a) => a.job_id));
  const ready = preparedJobs.filter(
    (j) =>
      !submitted.has(j.job_id) &&
      activePreparation(j).hasCv &&
      activePreparation(j).hasLetter,
  ).length;
  const follow = queue.today
    ? queue.applications.filter((a) =>
        needsFollowUp(a.status, a.next_step_at, queue.today!),
      ).length
    : null;
  return (
    <section className="app-card-base space-y-4 rounded-2xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("workspace.nextTitle")}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-200"
          href="#matched-jobs"
          onClick={onShowPrepared}
        >
          {(queue.error || preparedError)
            ? t("applications.loadError")
            : t("workspace.readyCount", { count: ready })}
        </Link>
        <Link
          className="rounded-xl bg-purple-50 p-4 text-sm text-purple-900 dark:bg-purple-500/10 dark:text-purple-200"
          href="/applications?followUp=1"
        >
          {queue.error
            ? t("applications.loadError")
            : follow === null
              ? t("jobDetail.loading")
              : t("workspace.followUpCount", { count: follow })}
        </Link>
        <a
          className="rounded-xl bg-slate-100 p-4 text-sm dark:bg-white/5"
          href="#matched-jobs"
          onClick={onShowMatched}
        >
          {t("workspace.matchesCount", { count: matchCount })}
        </a>
      </div>
      <p className="text-xs text-slate-500 dark:text-white/60">
        {t("workspace.readyHelp")}
      </p>
    </section>
  );
}
export function preparationGroups(jobs: PreparedJob[], applications: QueueApplication[]) {
  const submitted = new Set(applications.map(application => application.job_id));
  const active = jobs.flatMap(job => {
    const {hasCv, hasLetter} = activePreparation(job);
    return !submitted.has(job.job_id) && (hasCv || hasLetter)
      ? [{...job, has_cv: hasCv, has_cover_letter: hasLetter}]
      : [];
  });
  return {
    pending: active.filter(job => !(job.has_cv && job.has_cover_letter)),
    ready: active.filter(job => job.has_cv && job.has_cover_letter),
  };
}
