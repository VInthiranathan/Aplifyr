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
    <div className="flex min-h-[100dvh] w-full overflow-x-hidden bg-gray-50 dark:bg-[#0d0d0d] sm:h-[100dvh] sm:overflow-hidden">
      {/* Form panel: full-width on mobile, fixed sidebar on sm+ */}
      <div className="flex min-h-[100dvh] w-full flex-col justify-center overflow-y-auto bg-white px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] dark:bg-[#1a1a1a] sm:h-full sm:min-h-0 sm:w-[30vw] sm:min-w-[360px] sm:border-r sm:border-gray-200 sm:p-12 sm:dark:border-white/5 lg:p-16">
        <div className="mb-8 sm:mb-12">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
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
