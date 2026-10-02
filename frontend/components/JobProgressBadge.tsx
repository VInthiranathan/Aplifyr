import { useTranslation } from "next-i18next";
import { jobStage, type JobProgress } from "../lib/jobProgress";
export default function JobProgressBadge({
  progress,
}: {
  progress?: JobProgress;
}) {
  const { t } = useTranslation("common");
  const stage = jobStage(progress);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
      {t(
        ["new", "preparing", "ready"].includes(stage)
          ? `workspace.stage.${stage}`
          : `applications.status.${stage}`,
      )}
      {!progress?.status && progress?.hasCv && (
        <span> · {t("home.cvReady")}</span>
      )}
      {!progress?.status && progress?.hasLetter && (
        <span> · {t("home.coverLetterReady")}</span>
      )}
    </span>
  );
}
