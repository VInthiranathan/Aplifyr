import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useTheme } from "next-themes";
import AuthShell from "../../components/AuthShell";
import { Button } from "../../components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../../lib/supabaseClient";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { locale, push, asPath } = router;
  const { setTheme, resolvedTheme } = useTheme();

  const [mountedTheme, setMountedTheme] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => setMountedTheme(true), []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(t("auth.errors.missingSupabaseEnv"));
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setRecoveryReady(true);
        setInfo(null);
      } else {
        setInfo(t("auth.resetPasswordOpenFromEmail"));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setRecoveryReady(true);
        setError(null);
        setInfo(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [t]);

  const isDark = resolvedTheme === "dark";

  const title = useMemo(() => t("auth.resetPasswordTitle"), [t]);
  const subtitle = useMemo(() => t("auth.resetPasswordSubtitle"), [t]);

  const handleSubmit = async () => {
    if (!isSupabaseConfigured) {
      setError(t("auth.errors.missingSupabaseEnv"));
      return;
    }

    if (!password || !confirmPassword) {
      setError(t("auth.errors.missingNewPassword"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.errors.passwordsDoNotMatch"));
      return;
    }

    const supabase = getSupabaseBrowserClient();

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
        return;
      }

      setInfo(t("auth.resetPasswordSuccess"));
      await router.replace("/");
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
          <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
            {t("auth.newPassword")}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors pr-10"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            <Button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 text-gray-500 dark:text-white/60"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
            {t("auth.confirmNewPassword")}
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors pr-10"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            <Button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 text-gray-500 dark:text-white/60"
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {info && (
          <div className="text-sm text-gray-600 dark:text-white/70">{info}</div>
        )}

        <Button
          type="submit"
          className="mt-4 h-12 w-full uppercase tracking-widest"
          disabled={submitting || !isSupabaseConfigured || !recoveryReady}
        >
          {submitting ? t("auth.working") : t("auth.updatePassword")}
        </Button>
      </form>
    </AuthShell>
  );
}