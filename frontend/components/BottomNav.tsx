import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { Home, Bookmark, Briefcase, User, HelpCircle } from "lucide-react";

const tabs = [
  { key: "nav.home", href: "/", icon: Home },
  { key: "nav.favorites", href: "/favorites", icon: Bookmark },
  { key: "nav.allJobs", href: "/jobs", icon: Briefcase },
  { key: "nav.userDetails", href: "/user", icon: User },
  { key: "nav.support", href: "/support", icon: HelpCircle },
];

export default function BottomNav() {
  const { pathname } = useRouter();
  const { t } = useTranslation("common");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 h-16 bg-white dark:bg-[#111] border-t border-slate-200 dark:border-white/10 flex items-center md:hidden">
      {tabs.map(({ key, href, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${
              active
                ? "text-slate-900 dark:text-white"
                : "text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70"
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium leading-tight">
              {t(key)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
