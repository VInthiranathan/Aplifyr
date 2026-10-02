import { useEffect, useRef, useState } from "react";
import { useTranslation } from "next-i18next";
import { Button } from "../../components/ui/button";
import { notifyWorkspace } from "../../lib/JobProgressContext";
import type { JobNote } from "../../lib/readJobNotes";
export function JobNotes({ jobId }: { jobId: string }) {
  const { t } = useTranslation("common");
  const [saved, setSaved] = useState<JobNote | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    void fetch(`/api/job-notes?jobId=${encodeURIComponent(jobId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw Error("loadError");
        return res.json();
      })
      .then((body) => {
        if (!controller.signal.aborted) {
          setSaved(body.note);
          setDraft(body.note?.notes ?? "");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("loadError");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => request.current?.abort();
  }, [jobId]);
  async function save(remove = false) {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/job-notes", {
        method: remove ? "DELETE" : "PUT",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          notes: draft,
          updatedAt: saved?.updated_at ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw Error(
          body.code === "capacity"
            ? "capacity"
            : res.status === 409
              ? "conflict"
              : "saveError",
        );
      }
      const body = await res.json();
      if (!controller.signal.aborted) {
        setSaved(body.note ?? null);
        setDraft(body.note?.notes ?? "");
        setSuccess(true);
        notifyWorkspace();
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "saveError");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="app-card-base space-y-4 rounded-2xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("workspace.tabs.notes")}</h2>
      <p className="text-sm text-slate-500 dark:text-white/60">
        {t("workspace.notesHelp")}
      </p>
      {loading ? (
        <p role="status">{t("jobDetail.loading")}</p>
      ) : (
        <>
          <label className="grid gap-2">
            {t("applications.notes")}
            <textarea
              rows={7}
              maxLength={5000}
              disabled={busy || error === "loadError"}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSuccess(false);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#111]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                !draft.trim() ||
                draft === saved?.notes ||
                error === "loadError"
              }
              onClick={() => void save()}
            >
              {t(busy ? "applications.saving" : "applications.save")}
            </Button>
            {saved && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t("workspace.deleteNotesConfirm")))
                    void save(true);
                }}
              >
                {t("applications.delete")}
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert">
          {t(
            error === "capacity"
              ? "applications.capacity"
              : `applications.${error}`,
          )}
        </p>
      )}
      {success && <p role="status">{t("workspace.saved")}</p>}
    </section>
  );
}
