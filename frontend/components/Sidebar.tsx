import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabaseClient";
import {
  Home,
  User,
  Briefcase,
  HelpCircle,
  Sun,
  Moon,
  LogOut,
  Bookmark,
} from "lucide-react";
import { Button } from "./ui/button";

const navItemDefs = [
  { key: "nav.userDetails", href: "/user", icon: User },
  { key: "nav.home", href: "/", icon: Home },
  { key: "nav.allJobs", href: "/jobs", icon: Briefcase },
  { key: "nav.favorites", href: "/favorites", icon: Bookmark },
  { key: "nav.support", href: "/support", icon: HelpCircle },
];

export default function Sidebar() {
  const { pathname, locale, push, asPath } = useRouter();
  const { t } = useTranslation("common");
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [initials, setInitials] = useState<string>("");
  useEffect(() => {
    if (!mounted) return;
    (async () => {
      try {
        // Use server-side API route which reads profiles using server credentials
        const res = await fetch("/api/profile", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        let name = data?.profile?.full_name ?? null;

        // If profile exists but full_name is null/empty, try browser auth metadata as fallback
        if (!name) {
          try {
            const supabase = getSupabaseBrowserClient();
            const {
              data: { user: authUser },
            } = await supabase.auth.getUser();
            const metaName =
              (authUser as any)?.user_metadata?.full_name ||
              (authUser as any)?.raw_user_meta_data?.full_name ||
              authUser?.email;
            if (metaName) name = metaName;
          } catch (e) {
            // ignore fallback errors
          }
        }

        setDisplayName(name);

        const computeInitials = (s: string | null) => {
          if (!s) return "";
          const parts = s.trim().split(/\s+/);
          if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
          return (parts[0][0] + parts[1][0]).toUpperCase();
        };

        setInitials(computeInitials(name));
      } catch (err) {
        // ignore
      }
    })();
  }, [mounted]);

  const isDark = resolvedTheme === "dark";

  const toggleLanguage = () => {
    const next = locale === "en" ? "sv" : "en";
    push(asPath, asPath, { locale: next });
  };

  return (
    <aside className="flex flex-col h-screen w-48 bg-white dark:bg-[#111] text-slate-800 dark:text-white border-r border-slate-200 dark:border-white/10 flex-shrink-0">
      {/* top branding */}
      <div className="mt-5 px-4">
        <Link
          href="/"
          className="text-xl font-bold tracking-[0.2em] transition-colors duration-200 cursor-default text-slate-900 dark:text-white hover:text-sky-500 dark:hover:text-[rgba(0,140,255,1)]"
          style={{ fontFamily: "'Roboto', sans-serif" }}
        >
          Aplifyr
        </Link>
      </div>
      {/* language + theme toggles */}
      <div className="flex items-center gap-2 px-1 mt-2">
        {/* language toggle */}
        <Button
          onClick={toggleLanguage}
          variant="secondary"
          size="sm"
          className="flex-1 h-auto rounded-lg py-1.5 text-xs"
        >
          {locale === "en" ? "SV" : "EN"}
        </Button>

        {/* theme toggle */}
        {mounted && (
          <Button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            variant="secondary"
            size="sm"
            className="flex-1 h-auto rounded-lg py-1.5"
            title={isDark ? t("theme.light") : t("theme.dark")}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </Button>
        )}
      </div>

      {/* nav links */}
      <nav className="flex flex-col gap-1 px-2 mt-4">
        {navItemDefs.map(({ key, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white font-medium"
                  : "text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
              }`}
            >
              <Icon size={16} />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      {/* bottom controls */}
      <div className="mt-auto px-3 pb-5 flex flex-col gap-2">
        {/* user badge */}
        <Link
          href="/user"
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {initials || "U"}
          </div>
          <div className="leading-tight">
            <p className="text-sm text-slate-800 dark:text-white font-medium">
              {displayName ?? t("nav.guest")}
            </p>
            <p className="text-xs text-slate-400 dark:text-white/40">
              {t("nav.userDetails")}
            </p>
          </div>
        </Link>

        {/* sign out button */}
        <Button
          onClick={() => (window.location.href = "/api/auth/signout")}
          variant="ghost"
          className="justify-start rounded-lg px-3 py-2 text-sm"
        >
          <LogOut size={16} />
          {t("auth.signOut")}
        </Button>
      </div>
    </aside>
  );
}
