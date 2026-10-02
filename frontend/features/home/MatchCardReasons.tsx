import Link from "next/link";
import { useTranslation } from "next-i18next";
import type { MatchedJob } from "../../types/api";
export function MatchCardReasons({ job }: { job: MatchedJob }) {
  const { t } = useTranslation("common");
  const info = job.matchDebug;
  return (
    <div className="space-y-1 text-sm text-slate-600 dark:text-white/70">
      {!!info?.matchedTechTerms?.length && (
        <p>
          {t("workspace.match.cardSkills", {
            skills: info.matchedTechTerms.slice(0, 6).join(", "),
          })}
        </p>
      )}
      {!!info?.roleMatchedValue && (
        <p>{t("workspace.match.role", { role: info.roleMatchedValue })}</p>
      )}
      {["same_municipality", "same_region_nearby", "remote"].includes(
        info?.locationTier,
      ) && <p>{t("workspace.match.location")}</p>}
      <Link
        className="inline-flex min-h-10 items-center text-sky-700 underline dark:text-sky-300"
        href={`/jobs/${job.id}`}
      >
        {t("workspace.match.view")}
      </Link>
    </div>
  );
}
