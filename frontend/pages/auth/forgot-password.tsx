import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useTheme } from "next-themes";
import AuthShell from "../../components/AuthShell";
import { Button } from "../../components/ui/button";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../../lib/supabaseClient";

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

  useEffect(() => setMountedTheme(true), []);

  const isDark = resolvedTheme === "dark";

  const title = useMemo(() => t("auth.forgotPasswordTitle"), [t]);
  const subtitle = useMemo(() => t("auth.forgotPasswordSubtitle"), [t]);

  const handleSubmit = async () => {
    if (!isSupabaseConfigured) {
      setError(t("auth.errors.missingSupabaseEnv"));
      return;
    }

    if (!email) {
      setError(t("auth.errors.missingEmail"));
      return;
    }

    const supabase = getSupabaseBrowserClient();

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setInfo(t("auth.resetPasswordEmailSent"));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
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
          <button
            onClick={() => router.push("/auth")}
            className="text-sm text-sky-600 dark:text-sky-400 font-medium hover:underline"
          >
            {t("auth.backToSignIn")}
          </button>
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
          <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
            {t("auth.email")}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {info && (
          <div className="text-sm text-gray-600 dark:text-white/70">{info}</div>
        )}

        <Button
          type="submit"
          className="w-full mt-4 rounded-none h-12 text-sm font-medium uppercase tracking-widest"
          disabled={submitting || !isSupabaseConfigured}
        >
          {submitting ? t("auth.working") : t("auth.sendResetLink")}
        </Button>
      </form>
    </AuthShell>
  );
}