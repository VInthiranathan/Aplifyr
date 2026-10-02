import Link from "next/link";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
export type WorkspaceTab =
  | "overview"
  | "cv"
  | "letter"
  | "application"
  | "notes";
const tabs: WorkspaceTab[] = [
  "overview",
  "cv",
  "letter",
  "application",
  "notes",
];
export function WorkspaceNav({
  jobId,
  active,
}: {
  jobId: string;
  active: WorkspaceTab;
}) {
  const { t } = useTranslation("common");
  const router = useRouter();
  return (
    <nav
      aria-label={t("workspace.title")}
      className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-white/5"
    >
      {tabs.map((tab) => (
        <Link
          key={tab}
          aria-current={active === tab ? "page" : undefined}
          href={
            tab === "cv" ? `/jobs/${jobId}/cv` : `/jobs/${jobId}?tab=${tab}`
          }
          onClick={(event) => {
            if (tab !== "cv" && router.pathname === "/jobs/[id]") {
              event.preventDefault();
              void router.push(
                { pathname: router.pathname, query: { ...router.query, tab } },
                undefined,
                { shallow: true },
              );
            }
          }}
          className={`shrink-0 rounded-lg px-4 py-3 text-sm font-semibold ${active === tab ? "bg-white shadow-sm dark:bg-white/10" : "text-slate-500 dark:text-white/60"}`}
        >
          {t(`workspace.tabs.${tab}`)}
        </Link>
      ))}
    </nav>
  );
}
