import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useTheme } from "next-themes";
import AuthShell from "../../components/AuthShell";
import { Button } from "../../components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../../lib/supabaseClient";
import { authErrorKey, navigateAfterAuth } from "../../lib/authFlow";
import { exchangeAuthCallback } from "../../lib/authCallback";
import Link from 'next/link';

export const getServerSideProps: GetServerSideProps = async ({ locale, req, res, query }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (query.code !== undefined || query.error !== undefined || query.error_code !== undefined || query.sb_flow_id !== undefined) {
    const result = await exchangeAuthCallback(req, res, query);
    return { redirect: { destination: `${locale === 'sv' ? '/sv' : ''}/auth/reset-password?result=${result}#`, permanent: false } };
  }
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
  const pending = useRef(false);
  const owner = useRef<string | null>(null);
  const epoch = useRef(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => setMountedTheme(true), []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(t("auth.errors.missingSupabaseEnv"));
      return;
    }

    const supabase = getSupabaseBrowserClient();

    let active = true, version = 0;
    const applySession = (session: { user: { id: string } } | null) => {
      if (!active) return;
      const nextOwner = session?.user.id ?? null;
      if (nextOwner !== owner.current) {
        owner.current = nextOwner; epoch.current++;
        setPassword(''); setConfirmPassword(''); setCompleted(false); setError(null);
      }
      setRecoveryReady(Boolean(nextOwner));
      setInfo(nextOwner ? null : t('auth.resetPasswordOpenFromEmail'));
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      version++; applySession(session);
    });
    const initial = version;
    void supabase.auth.getSession().then(({ data }) => {
      if (version === initial) applySession(data.session);
    }).catch(() => {
      if (active && version === initial) { applySession(null); setError(t('auth.errors.unavailable')); }
    });
    return () => {
      active = false; epoch.current++;
      subscription.unsubscribe();
    };
  }, [t]);

  const isDark = resolvedTheme === "dark";

  const title = useMemo(() => t("auth.resetPasswordTitle"), [t]);
  const subtitle = useMemo(() => t("auth.resetPasswordSubtitle"), [t]);
  const callbackFailed = ['sign-in', 'invalid', 'unavailable'].includes(String(router.query.result));

  const handleSubmit = async () => {
    if (pending.current || completed || callbackFailed || !recoveryReady || !owner.current) return;
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

    const submittedEpoch = epoch.current;
    pending.current = true;
    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (epoch.current !== submittedEpoch) return;

      if (error) {
        setError(t(authErrorKey(error, 'password')));
        return;
      }

      setPassword(''); setConfirmPassword(''); setCompleted(true);
      setInfo(t("auth.resetPasswordSuccess"));
      await navigateAfterAuth(() => router.replace("/"));
    } catch {
      if (epoch.current === submittedEpoch) setError(t('auth.errors.unavailable'));
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
          <label htmlFor="new-password" className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
            {t("auth.newPassword")}
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              disabled={submitting || completed || callbackFailed || !recoveryReady}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors pr-10"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            <Button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={`${t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}: ${t('auth.newPassword')}`}
              aria-controls="new-password"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 text-gray-500 dark:text-white/60"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirm-new-password" className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
            {t("auth.confirmNewPassword")}
          </label>
          <div className="relative">
            <input
              id="confirm-new-password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              disabled={submitting || completed || callbackFailed || !recoveryReady}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors pr-10"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            <Button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={`${t(showConfirmPassword ? 'auth.hidePassword' : 'auth.showPassword')}: ${t('auth.confirmNewPassword')}`}
              aria-controls="confirm-new-password"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 text-gray-500 dark:text-white/60"
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          </div>
        </div>

        {(error || callbackFailed) && (
          <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error || t('auth.errors.recoveryLinkInvalid')}</div>
        )}

        {info && (
          <div className="text-sm text-gray-600 dark:text-white/70">{info}</div>
        )}
        {completed && <Link href="/" className="underline">{t('auth.continueToApp')}</Link>}

        <Button
          type="submit"
          className="mt-4 h-12 w-full uppercase tracking-widest"
          disabled={submitting || completed || callbackFailed || !isSupabaseConfigured || !recoveryReady}
        >
          {submitting ? t("auth.working") : t("auth.updatePassword")}
        </Button>
      </form>
    </AuthShell>
  );
}
