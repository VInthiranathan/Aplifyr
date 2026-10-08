import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useTheme } from "next-themes";
import AuthShell from "../../components/AuthShell";
import { Button } from "../../components/ui/button";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../../lib/supabaseClient";
import { authErrorKey } from "../../lib/authFlow";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { locale, push, asPath } = router;
  const { setTheme, resolvedTheme } = useTheme();

  const [mountedTheme, setMountedTheme] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const pending = useRef(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => setMountedTheme(true), []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const isDark = resolvedTheme === "dark";

  const title = useMemo(() => t("auth.forgotPasswordTitle"), [t]);
  const subtitle = useMemo(() => t("auth.forgotPasswordSubtitle"), [t]);

  const handleSubmit = async () => {
    if (pending.current || Date.now() < retryAt) return;
    if (!isSupabaseConfigured) {
      setError(t("auth.errors.missingSupabaseEnv"));
      return;
    }

    if (!email.trim()) {
      setError(t("auth.errors.missingEmail"));
      return;
    }

    const supabase = getSupabaseBrowserClient();

    pending.current = true;
    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const redirectTo = `${window.location.origin}${locale === 'sv' ? '/sv' : ''}/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        setError(t(authErrorKey(error, 'recovery')));
        return;
      }

      setInfo(t("auth.resetPasswordEmailSent"));
      setNow(Date.now());
      setRetryAt(Date.now() + 60000);
    } catch {
      setError(t('auth.errors.unavailable'));
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={title}
      subtitle={subtitle}
      locale={locale}
      mountedTheme={mountedTheme}
      isDark={isDark}
      themeLabel={isDark ? t("theme.light") : t("theme.dark")}
      onToggleLocale={() => {
        const next = locale === "en" ? "sv" : "en";
        push(asPath, asPath, { locale: next });
      }}
      onToggleTheme={() => setTheme(isDark ? "light" : "dark")}
      isFocused={isFocused}
      footer={
        <div className="mt-8 text-center">
          <Button
            onClick={() => router.push("/auth")}
            variant="link"
            className="h-auto px-0 py-0 text-sm"
          >
            {t("auth.backToSignIn")}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="recovery-email" className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
            {t("auth.email")}
          </label>
          <input
            id="recovery-email"
            autoComplete="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        </div>

        {error && (
          <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {info && (
          <div className="text-sm text-gray-600 dark:text-white/70">{info}</div>
        )}

        <Button
          type="submit"
          className="mt-4 h-12 w-full uppercase tracking-widest"
          disabled={submitting || !isSupabaseConfigured || now < retryAt}
        >
          {submitting ? t("auth.working") : now < retryAt
            ? t('auth.resendWait', { seconds: Math.ceil((retryAt - now) / 1000) }) : t("auth.sendResetLink")}
        </Button>
      </form>
    </AuthShell>
  );
}
