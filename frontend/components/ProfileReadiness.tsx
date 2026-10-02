import { useTranslation } from "next-i18next";
import { useCareerEntries } from "../lib/CareerEntriesContext";
import type { User } from "../types/api";
export default function ProfileReadiness({
  profile,
  onManage,
}: {
  profile: User | null | undefined;
  onManage: (section: "overview" | "work" | "education") => void;
}) {
  const { t } = useTranslation("common");
  const { entries, loading, loadError } = useCareerEntries();
  if (!profile || loading || loadError) return null;
  const ready =
    !!profile.name.trim() &&
    (!!profile.bio.trim() ||
      profile.tags.some((s) => s.trim()) ||
      entries.some((e) => e.title.trim()));
  const recommendations: Array<{
    key: string;
    section: "overview" | "work" | "education";
  }> = [];
  if (!profile.name.trim())
    recommendations.push({ key: "name", section: "overview" });
  if (!profile.bio.trim())
    recommendations.push({ key: "bio", section: "overview" });
  if (!profile.tags.length && !entries.some((e) => e.skills.length))
    recommendations.push({ key: "skills", section: "overview" });
  for (const kind of ["work", "education"] as const) {
    if (
      entries.some(
        (e) =>
          e.kind === kind &&
          !e.description.trim() &&
          !e.achievements.trim() &&
          !e.learned.trim(),
      )
    )
      recommendations.push({
        key: kind === "work" ? "responsibilities" : "learning",
        section: kind,
      });
  }
  if (!profile.linkedinUrl && !profile.websiteUrl)
    recommendations.push({ key: "links", section: "overview" });
  return (
    <section className="app-card-base mb-5 space-y-3 rounded-2xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold">
        {t(ready ? "workspace.profile.ready" : "workspace.profile.incomplete")}
      </h2>
      <p className="text-sm text-slate-500 dark:text-white/60">
        {t("workspace.profile.help")}
      </p>
      {!!recommendations.length && (
        <ul className="space-y-2">
          {recommendations.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onManage(item.section)}
                className="min-h-10 text-left text-sm text-sky-700 underline dark:text-sky-300"
              >
                {t(`workspace.profile.${item.key}`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
