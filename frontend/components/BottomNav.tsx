import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { Home, Bookmark, Briefcase, User } from "lucide-react";

const tabs = [
  { key: "nav.home", href: "/", icon: Home },
  { key: "nav.favorites", href: "/favorites", icon: Bookmark },
  { key: "nav.allJobs", href: "/jobs", icon: Briefcase },
  { key: "nav.userDetails", href: "/user", icon: User },
];

export default function BottomNav() {
  const { pathname } = useRouter();
  const { t } = useTranslation("common");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start border-t border-slate-200 bg-white px-2 pt-1 dark:border-white/10 dark:bg-[#111] md:hidden">
      {tabs.map(({ key, href, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
              active
                ? "text-slate-900 dark:text-white"
                : "text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70"
            }`}
          >
            <Icon size={20} />
            <span className="max-w-full truncate px-1 text-[10px] font-medium leading-tight">
              {t(key)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
