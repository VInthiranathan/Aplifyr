import { ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { Sun, Moon } from "lucide-react";
import AnimatedBackground from "./AnimatedBackground";
import { Button } from "./ui/button";

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
  const { t } = useTranslation('common');
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-[#0d0d0d]">
      {/* Form panel: full-width on mobile, fixed sidebar on sm+ */}
      <div className="w-full sm:w-[30vw] sm:min-w-[360px] h-full flex flex-col justify-center overflow-y-auto bg-white dark:bg-[#1a1a1a] sm:border-r sm:border-gray-200 sm:dark:border-white/5 p-8 sm:p-16">
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
        <Link href="/privacy" className="mt-4 text-sm underline">{t('privacy.title')}</Link>

        <div className="mt-6 flex items-center gap-2 px-1 justify-center">
          <Button
            onClick={onToggleLocale}
            variant="secondary"
            size="sm"
            className="h-auto rounded-lg py-2 text-xs"
          >
            {locale === "en" ? "SV" : "EN"}
          </Button>

          {mountedTheme && (
            <Button
              onClick={onToggleTheme}
              variant="secondary"
              size="sm"
              className="h-auto rounded-lg py-2"
              title={themeLabel}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </Button>
          )}
        </div>
      </div>

      {/* Animated background: hidden on mobile, visible on sm+ */}
      <div className="hidden sm:flex flex-1 h-full">
        <AnimatedBackground isFocused={isFocused} />
      </div>
    </div>
  );
}
