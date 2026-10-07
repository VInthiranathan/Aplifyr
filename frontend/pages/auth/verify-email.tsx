import { safeReturnTo, signInHref } from "../../lib/guestAccess";
import { useEffect, useRef, useState } from "react";
import { authErrorKey, confirmationHref } from "../../lib/authFlow";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../../lib/supabaseClient";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import { MailCheck } from "lucide-react";
import AuthShell from "../../components/AuthShell";
import { Button } from "../../components/ui/button";

export const getServerSideProps: GetServerSideProps = async ({ locale, res }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  return { props: { ...(await serverSideTranslations(locale ?? "en", ["common"])) } };
};

export default function VerifyEmailPage() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { locale, push, asPath } = router;
  const { setTheme, resolvedTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const submission = useRef(false);
  const returnTo = safeReturnTo(router.query.returnTo);
  const result = router.query.result;
  const confirmed = result === 'confirmed';
  const outcome = ['sign-in', 'invalid', 'unavailable'].includes(typeof result === 'string' ? result : '') ? result as string : null;

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const resend = async () => {
    if (submission.current || Date.now() < cooldownUntil) return;
    if (!email.trim()) { setError(t('auth.errors.missingEmail')); return; }
    if (!isSupabaseConfigured) { setError(t('auth.errors.unavailable')); return; }
    submission.current = true;
    setSending(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.resend({
        type: 'signup', email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}${confirmationHref(returnTo, locale)}` },
      });
      if (error) {
        setError(t(authErrorKey(error, 'resend')));
        if (error.status === 429) setCooldownUntil(Date.now() + 60000);
      } else {
        setInfo(t('auth.resendSent'));
        setCooldownUntil(Date.now() + 60000);
      }
    } catch {
      setError(t('auth.errors.unavailable'));
    } finally {
      submission.current = false;
      setSending(false);
    }
  };

  useEffect(() => setMountedTheme(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <AuthShell
      title={t(confirmed ? "auth.emailConfirmedTitle" : "auth.verifyEmailTitle")}
      subtitle={t(confirmed ? "auth.emailConfirmedSubtitle" : "auth.verifyEmailSubtitle")}
      locale={locale}
      mountedTheme={mountedTheme}
      isDark={isDark}
      themeLabel={isDark ? t("theme.light") : t("theme.dark")}
      onToggleLocale={() => {
        const next = locale === "en" ? "sv" : "en";
        push(asPath, asPath, { locale: next });
      }}
      onToggleTheme={() => setTheme(isDark ? "light" : "dark")}
      isFocused={false}
    >
      <div role="status" className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-400/20 dark:bg-sky-400/10">
        <MailCheck className="mb-4 h-9 w-9 text-sky-600 dark:text-sky-300" aria-hidden="true" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          {t(confirmed ? "auth.emailConfirmedTitle" : "auth.verifyEmailCardTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-white/70">
          {t(confirmed ? "auth.emailConfirmedInstructions" : outcome ? `auth.confirmation.${outcome}` : "auth.verifyEmailInstructions")}
        </p>
        {!confirmed && <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-white/55">
          {t("auth.verifyEmailSpamHint")}
        </p>}
      </div>
      {!confirmed && <form className="mt-6 space-y-3" onSubmit={event => { event.preventDefault(); void resend(); }}>
        <label htmlFor="confirmation-email" className="block text-sm font-medium">{t('auth.email')}</label>
        <input id="confirmation-email" type="email" required autoComplete="email" maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-3 dark:border-white/20" />
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {info && <p role="status" className="text-sm text-gray-600 dark:text-white/70">{info}</p>}
        <Button type="submit" variant="secondary" className="w-full" disabled={sending || seconds > 0 || !isSupabaseConfigured}>
          {sending ? t('auth.working') : seconds > 0 ? t('auth.resendWait', { seconds }) : t('auth.resendConfirmation')}
        </Button>
      </form>}
      {confirmed && <Button type="button" className="mt-6 h-12 w-full" onClick={() => router.push(returnTo)}>
        {t('auth.continueToApp')}
      </Button>}
      <Button type="button" className="mt-6 h-12 w-full" onClick={() => router.push(signInHref(safeReturnTo(router.query.returnTo)))}>
        {t("auth.backToSignIn")}
      </Button>
    </AuthShell>
  );
}
