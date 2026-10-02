import { useEffect, useRef, useState } from "react";
import { useTranslation } from "next-i18next";
import { Button } from "../../components/ui/button";
import { APPLICATION_STATUSES } from "../../lib/applicationValidation";
import { notifyWorkspace } from "../../lib/JobProgressContext";
import type { ApplicationStatus, JobApplication } from "../../types/api";
export function ApplicationPanel({
  application,
  loading,
  marking,
  onMark,
  onSaved,
}: {
  application: JobApplication | null;
  loading: boolean;
  marking: boolean;
  onMark: () => void;
  onSaved: (application: JobApplication) => void;
}) {
  const { t } = useTranslation("common");
  const [status, setStatus] = useState<ApplicationStatus>("applied");
  const [date, setDate] = useState("");
  const [next, setNext] = useState("");
  const [follow, setFollow] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setStatus(application?.status ?? "applied");
    setDate(application?.applied_at ?? "");
    setNext(application?.next_step ?? "");
    setFollow(application?.next_step_at ?? "");
    setError("");
    setSuccess(false);
    return () => request.current?.abort();
  }, [application]);
  async function save() {
    if (!application || busy) return;
    setBusy(true);
    setError("");
    setSuccess(false);
    const controller = new AbortController();
    request.current = controller;
    try {
      const res = await fetch("/api/applications", {
        method: "PUT",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: application.job_id,
          status,
          appliedAt: date,
          nextStep: next,
          nextStepAt: follow || null,
          notes: application.notes,
          updatedAt: application.updated_at,
        }),
      });
      if (!res.ok) throw Error(res.status === 409 ? "conflict" : "saveError");
      const body = await res.json();
      if (!controller.signal.aborted) {
        onSaved(body.application);
        notifyWorkspace();
        setSuccess(true);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "saveError");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const input =
    "rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#111]";
  return (
    <section className="app-card-base space-y-4 rounded-2xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold">
        {t("workspace.tabs.application")}
      </h2>
      <p className="text-sm text-slate-500 dark:text-white/60">
        {t("workspace.applicationHelp")}
      </p>
      {loading ? (
        <p role="status">{t("jobDetail.loading")}</p>
      ) : !application ? (
        <Button disabled={marking} onClick={onMark}>
          {t(marking ? "applications.marking" : "applications.markApplied")}
        </Button>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset
            disabled={busy}
            className="grid min-w-0 gap-4 sm:grid-cols-2"
          >
            <label className="grid gap-2 text-sm">
              {t("applications.statusLabel")}
              <select
                className={input}
                value={status}
                onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
              >
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`applications.status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              {t("applications.appliedDate")}
              <input
                className={input}
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              {t("applications.nextStep")}
              <input
                className={input}
                maxLength={500}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              {t("applications.followUpDate")}
              <input
                className={input}
                type="date"
                value={follow}
                onChange={(e) => setFollow(e.target.value)}
              />
            </label>
          </fieldset>
          {application.notes && (
            <p className="whitespace-pre-wrap text-sm">{application.notes}</p>
          )}
          <div>
            <Button disabled={busy} type="submit">
              {t(busy ? "applications.saving" : "applications.save")}
            </Button>
          </div>
        </form>
      )}
      {error && <p role="alert">{t(`applications.${error}`)}</p>}
      {success && <p role="status">{t("workspace.saved")}</p>}
    </section>
  );
}
