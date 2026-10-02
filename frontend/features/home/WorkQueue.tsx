import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { PreparedJobs, type usePreparedJobs } from "./PreparedJobs";
import {
  activePreparation,
  localDay,
  needsFollowUp,
} from "../../lib/jobProgress";
import { Button } from "../../components/ui/button";
import JobListCard from "../../components/JobListCard";
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
}: {
  preparedJobs: PreparedJob[];
  preparedError?: boolean;
  queue: ReturnType<typeof useWorkQueue>;
  matchCount: number;
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
          href="/#work-queue"
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
export function WorkQueue({
  model,
  queue,
}: {
  model: ReturnType<typeof usePreparedJobs>;
  queue: ReturnType<typeof useWorkQueue>;
}) {
  const { t } = useTranslation("common");
  const submitted = new Set(queue.applications.map((a) => a.job_id));
  const active = model.preparedJobs
    .filter((j) => {
      const p = activePreparation(j);
      return p.hasCv || p.hasLetter;
    })
    .map((j) => {
      const p = activePreparation(j);
      return { ...j, has_cv: p.hasCv, has_cover_letter: p.hasLetter };
    });
  const pending = active.filter(
    (j) => !submitted.has(j.job_id) && !(j.has_cv && j.has_cover_letter),
  );
  const ready = active.filter(
    (j) => !submitted.has(j.job_id) && j.has_cv && j.has_cover_letter,
  );
  return (
    <section id="work-queue" className="scroll-mt-4 space-y-6">
      <header>
        <h2 className="text-xl font-semibold">{t("workspace.queueTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
          {t("workspace.queueHelp")}
        </p>
      </header>
      {queue.error || model.preparedError ? (
        <div role="alert" className="space-y-2">
          <p>{t("applications.loadError")}</p>
          <Button variant="secondary" onClick={() => { queue.retry(); model.retry(); }}>{t("workspace.retry")}</Button>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="font-semibold">
              {t("workspace.needsAction")} · {pending.length}
            </h3>
            {pending.length ? (
              <PreparedJobs model={model} jobs={pending} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-white/60">
                {t("workspace.queueEmpty")}
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold">
              {t("workspace.ready")} · {ready.length}
            </h3>
            {ready.length ? (
              <PreparedJobs model={model} jobs={ready} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-white/60">
                {t("workspace.queueEmpty")}
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold">
              {t("workspace.applied")} · {queue.applications.length}
            </h3>
            <div className="grid gap-3">
              {queue.applications.slice(0, 10).map((a) => (
                <JobListCard
                  key={a.job_id}
                  jobId={a.job_id}
                  title={
                    <Link
                      className="font-semibold hover:underline"
                      href={`/jobs/${a.job_id}?tab=application`}
                    >
                      {a.job_context.title}
                    </Link>
                  }
                  subtitle={a.job_context.company}
                  meta={a.next_step ? <span>{a.next_step}</span> : null}
                  footer={
                    a.next_step_at ? (
                      <p className="text-sm">
                        {t("applications.followUpDate")}: {a.next_step_at}
                      </p>
                    ) : null
                  }
                />
              ))}
            </div>
            <Link
              className="inline-flex min-h-10 items-center text-sm underline"
              href="/applications"
            >
              {t("applications.openTracker")}
            </Link>
          </section>
        </>
      )}
    </section>
  );
}
