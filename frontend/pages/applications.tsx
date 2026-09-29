import type { GetServerSideProps } from "next";
import { serverSupabase } from "../lib/serverSupabase";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { BriefcaseBusiness, CalendarDays, Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { readApplications } from "../lib/readApplications";
import { APPLICATION_STATUSES } from "../lib/applicationValidation";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import type { ApplicationStatus, JobApplication } from "../types/api";

interface Props { applications: JobApplication[]; loadError: boolean }

interface Draft {
  status: ApplicationStatus;
  appliedAt: string;
  nextStep: string;
  nextStepAt: string;
  notes: string;
}

const ACTIVE_STATUSES: ApplicationStatus[] = ["applied", "screening", "interview", "offer"];

export const getServerSideProps: GetServerSideProps<Props> = async ({ locale, req, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  let applications: JobApplication[] = [];
  let loadError = false;
  if (isSupabaseConfigured) {
    const supabase = serverSupabase(req, res);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { redirect: { destination: "/auth", permanent: false } };
    try { applications = await readApplications(supabase, user.id); }
    catch { loadError = true; }
  }
  return { props: { applications, loadError, ...(await serverSideTranslations(locale ?? "en", ["common"])) } };
};

function dateValue(value: string): Date { return new Date(`${value}T00:00:00`); }

export default function ApplicationsPage({ applications: initialApplications, loadError }: Props) {
  const { t } = useTranslation("common");
  const router = useRouter();
  const [applications, setApplications] = useState(initialApplications);
  const [filter, setFilter] = useState<"active" | "all" | ApplicationStatus>("active");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const locale = router.locale === "sv" ? "sv-SE" : "en-US";

  const counts = useMemo(() => ({
    active: applications.filter(item => ACTIVE_STATUSES.includes(item.status)).length,
    interview: applications.filter(item => item.status === "interview").length,
    offer: applications.filter(item => item.status === "offer" || item.status === "accepted").length,
  }), [applications]);

  const visible = useMemo(() => applications.filter(item =>
    filter === "all" || (filter === "active" ? ACTIVE_STATUSES.includes(item.status) : item.status === filter)
  ), [applications, filter]);

  const startEditing = (application: JobApplication) => {
    setEditingId(application.job_id);
    setDraft({
      status: application.status,
      appliedAt: application.applied_at,
      nextStep: application.next_step ?? "",
      nextStepAt: application.next_step_at ?? "",
      notes: application.notes,
    });
    setError("");
  };

  const save = async (application: JobApplication) => {
    if (!draft || savingId) return;
    setSavingId(application.job_id); setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: application.job_id,
          status: draft.status,
          appliedAt: draft.appliedAt,
          nextStep: draft.nextStep,
          nextStepAt: draft.nextStepAt || null,
          notes: draft.notes,
          updatedAt: application.updated_at,
        }),
      });
      if (response.status === 409) throw new Error("conflict");
      if (!response.ok) throw new Error("save");
      const updated = (await response.json()).application as JobApplication;
      setApplications(current => current.map(item => item.job_id === updated.job_id ? updated : item));
      setEditingId(null); setDraft(null);
    } catch (cause) {
      setError(t(cause instanceof Error && cause.message === "conflict" ? "applications.conflict" : "applications.saveError"));
    } finally { setSavingId(null); }
  };

  const remove = async (application: JobApplication) => {
    if (savingId || !window.confirm(t("applications.deleteConfirm"))) return;
    setSavingId(application.job_id); setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: application.job_id,
          updatedAt: application.updated_at,
        }),
      });
      if (response.status === 409) throw new Error("conflict");
      if (!response.ok) throw new Error("delete");
      setApplications(current => current.filter(item => item.job_id !== application.job_id));
      if (editingId === application.job_id) { setEditingId(null); setDraft(null); }
    } catch (cause) {
      setError(t(cause instanceof Error && cause.message === "conflict" ? "applications.conflict" : "applications.deleteError"));
    } finally { setSavingId(null); }
  };

  return (
    <div className="app-page-shell">
      <div className="app-page-header">
        <h1 className="app-page-title">{t("applications.title")}</h1>
        <p className="app-page-subtitle">{t("applications.subtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {(["active", "interview", "offer"] as const).map(key => (
          <div key={key} className="app-card-base rounded-2xl p-3 sm:p-5">
            <p className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{counts[key]}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/50 sm:text-sm">{t(`applications.summary.${key}`)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}
            aria-label={t("applications.filterLabel")}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm text-slate-800 outline-none focus:border-purple-400 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white">
            <option value="active">{t("applications.filters.active")}</option>
            <option value="all">{t("applications.filters.all")}</option>
            {APPLICATION_STATUSES.map(status => <option key={status} value={status}>{t(`applications.status.${status}`)}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <span className="text-sm text-slate-500 dark:text-white/50">{t("applications.count", { count: visible.length })}</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{t("applications.loadError")}</p>}

      {!loadError && applications.length === 0 ? (
        <div className="app-card-base rounded-2xl p-8 text-center sm:p-14">
          <BriefcaseBusiness size={48} className="mx-auto mb-4 text-slate-300 dark:text-white/20" />
          <h2 className="text-xl font-semibold">{t("applications.emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-500 dark:text-white/50">{t("applications.emptyDescription")}</p>
          <Button asChild className="mt-5"><Link href="/jobs">{t("applications.exploreJobs")}</Link></Button>
        </div>
      ) : !loadError && visible.length === 0 ? (
        <div className="app-card-base rounded-2xl p-8 text-center text-slate-500 dark:text-white/50">{t("applications.noResults")}</div>
      ) : !loadError ? (
        <div className="grid gap-4">
          {visible.map(application => {
            const editing = editingId === application.job_id && draft;
            return (
              <article key={application.job_id} className="app-card-base rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/jobs/${application.job_id}`} className="break-words text-lg font-semibold hover:underline">
                        {application.job_context.title}
                      </Link>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold application-status-${application.status}`}>
                        {t(`applications.status.${application.status}`)}
                      </span>
                    </div>
                    {application.job_context.company && <p className="mt-1 text-sm text-slate-600 dark:text-white/60">{application.job_context.company}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-white/50">
                      <span className="flex items-center gap-1"><CalendarDays size={14} />{t("applications.appliedOn", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(dateValue(application.applied_at)) })}</span>
                      {application.next_step_at && <span>{t("applications.followUpOn", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(dateValue(application.next_step_at)) })}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => editing ? (setEditingId(null), setDraft(null)) : startEditing(application)}>
                      <Pencil size={14} />{t(editing ? "applications.cancel" : "applications.edit")}
                    </Button>
                    <Button variant="ghost" size="icon" disabled={savingId === application.job_id} onClick={() => void remove(application)} title={t("applications.delete")} className="text-red-500 hover:text-red-600">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>

                {!editing && (application.next_step || application.notes) && (
                  <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 text-sm dark:border-white/10 sm:grid-cols-2">
                    {application.next_step && <div><p className="font-semibold">{t("applications.nextStep")}</p><p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-white/60">{application.next_step}</p></div>}
                    {application.notes && <div><p className="font-semibold">{t("applications.notes")}</p><p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-white/60">{application.notes}</p></div>}
                  </div>
                )}

                {editing && (
                  <form className="mt-5 grid gap-4 border-t border-slate-200 pt-5 dark:border-white/10" onSubmit={event => { event.preventDefault(); void save(application); }}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium">{t("applications.statusLabel")}
                        <select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as ApplicationStatus })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#111]">
                          {APPLICATION_STATUSES.map(status => <option key={status} value={status}>{t(`applications.status.${status}`)}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">{t("applications.appliedDate")}
                        <input required type="date" value={draft.appliedAt} onChange={event => setDraft({ ...draft, appliedAt: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#111]" />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">{t("applications.nextStep")}
                        <input maxLength={500} value={draft.nextStep} onChange={event => setDraft({ ...draft, nextStep: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#111]" />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">{t("applications.followUpDate")}
                        <input type="date" value={draft.nextStepAt} onChange={event => setDraft({ ...draft, nextStepAt: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#111]" />
                      </label>
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium">{t("applications.notes")}
                      <textarea rows={4} maxLength={5000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-[#111]" />
                    </label>
                    <div className="flex justify-end"><Button type="submit" disabled={savingId === application.job_id}><Check size={15} />{t(savingId === application.job_id ? "applications.saving" : "applications.save")}</Button></div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
