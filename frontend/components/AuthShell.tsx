import { ReactNode } from "react";
import { Sun, Moon } from "lucide-react";
import AnimatedBackground from "./AnimatedBackground";

interface AuthShellProps {
  title: string;
  subtitle: string;
  locale?: string;
  mountedTheme: boolean;
  isDark: boolean;
  themeLabel: string;
  onToggleLocale: () => void;
  onToggleTheme: () => void;
  isFocused: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export default function AuthShell({
  title,
  subtitle,
  locale,
  mountedTheme,
  isDark,
  themeLabel,
  onToggleLocale,
  onToggleTheme,
  isFocused,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-[#0d0d0d]">
      <div className="w-[30vw] min-w-[360px] h-full flex flex-col justify-center bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-white/5 p-16">
        <div className="mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-white/60">
            {subtitle}
          </p>
        </div>

        {children}

        {footer}

        <div className="mt-6 flex items-center gap-2 px-1 justify-center">
          <button
            onClick={onToggleLocale}
            className="text-xs font-semibold py-2 px-3 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {locale === "en" ? "SV" : "EN"}
          </button>

          {mountedTheme && (
            <button
              onClick={onToggleTheme}
              className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
              title={themeLabel}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 h-full">
        <AnimatedBackground isFocused={isFocused} />
      </div>
    </div>
  );
}