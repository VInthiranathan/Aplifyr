import { useTranslation } from "next-i18next";
import type { CvContent, GeneratedCv } from "../../types/api";
export function CvAdaptations({
  content,
  metadata,
}: {
  content: CvContent;
  metadata?: GeneratedCv["metadata"];
}) {
  const { t } = useTranslation("common");
  const cited = new Set(
    [
      ...content.professionalSummary,
      ...content.experience.flatMap((e) => e.bullets),
      ...content.education.flatMap((e) => e.bullets),
    ].flatMap(
      (f) => f.sourceFactIds ?? (f.sourceFactId ? [f.sourceFactId] : []),
    ),
  );
  return (
    <details className="app-card-base rounded-2xl p-4">
      <summary className="cursor-pointer font-semibold">
        {t("workspace.adaptations.title")}
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        <p>{t("workspace.adaptations.help")}</p>
        {!content.userEdited && metadata?.adaptations && (
          <>
            <p>
              {t("workspace.adaptations.matched", {
                skills:
                  metadata.adaptations.matchedSkills.join(", ") ||
                  t("workspace.match.noSkills"),
              })}
            </p>
            <p>
              {t("workspace.adaptations.rewritten", {
                count: metadata.adaptations.rewrittenStatements,
              })}
            </p>
          </>
        )}
        <p>
          {t("workspace.adaptations.skills", {
            skills:
              content.skills.slice(0, 8).join(", ") ||
              t("workspace.match.noSkills"),
          })}
        </p>
        <p>{t("workspace.adaptations.evidence", { count: cited.size })}</p>
        {!!content.experience.length && (
          <p>
            {t("workspace.adaptations.experience", {
              titles: content.experience.map((e) => e.title).join(", "),
            })}
          </p>
        )}
        {!!content.education.length && (
          <p>
            {t("workspace.adaptations.education", {
              titles: content.education.map((e) => e.title).join(", "),
            })}
          </p>
        )}
        {content.userEdited && <p>{t("workspace.adaptations.edited")}</p>}
      </div>
    </details>
  );
}
