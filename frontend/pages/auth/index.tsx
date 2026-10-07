import Link from "next/link";
import { safeReturnTo } from "../../lib/guestAccess";
import { useEffect, useMemo, useRef, useState } from "react";
import { authErrorKey, confirmationHref, navigateAfterAuth } from "../../lib/authFlow";
import { motion, AnimatePresence } from "framer-motion";
import AuthShell from "../../components/AuthShell";
import { Button } from "../../components/ui/button";
import { Eye, EyeOff, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "next-i18next";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../../lib/supabaseClient";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};

export default function AuthPage() {
  const router = useRouter();
  const returnTo = safeReturnTo(router.query.returnTo);
  const { t } = useTranslation("common");
  const { locale, push, asPath } = router;
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  useEffect(() => setMountedTheme(true), []);
  const isDark = resolvedTheme === 'dark'

  const [isLogin, setIsLogin] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [continueTo, setContinueTo] = useState<string | null>(null);
  const submission = useRef(false);

  const title = useMemo(
    () => (isLogin ? t("auth.welcomeBack") : t("auth.createAccount")),
    [isLogin, t],
  );

  const subtitle = useMemo(
    () =>
      isLogin
        ? t("auth.enterCredentials")
        : t("auth.fillDetails"),
    [isLogin, t],
  );

  useEffect(() => {
    setError(null);
    setInfo(null);
    setContinueTo(null);
  }, [isLogin]);

  const handleSubmit = async () => {
    if (submission.current || (continueTo && !error)) return;
    if (!isSupabaseConfigured) {
      setError(t("auth.errors.missingSupabaseEnv"));
      return;
    }

    submission.current = true;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    setContinueTo(null);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!email || !password) {
        setError(t("auth.errors.missingEmailOrPassword"));
        return;
      }

      if (!isLogin) {
        if (password !== confirmPassword) {
          setError(t("auth.errors.passwordsDoNotMatch"));
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${confirmationHref(returnTo, locale)}`,
            data: fullName ? { full_name: fullName } : undefined,
          },
        });

        if (error) {
          setError(t(authErrorKey(error, 'signup')));
          return;
        }

        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setError(t("auth.errors.emailAlreadyRegistered"));
          return;
        }

        if (!data.user && !data.session) {
          setError(t('auth.errors.signupUnavailable'));
          return;
        }

        if (!data.session) {
          setPassword("");
          setConfirmPassword("");
          setInfo(t("auth.checkEmail"));
          const destination = `/auth/verify-email?returnTo=${encodeURIComponent(returnTo)}`;
          setContinueTo(destination);
          await navigateAfterAuth(() => router.replace(destination));
          return;
        }

        setPassword("");
        setConfirmPassword("");
        setContinueTo(returnTo);
        if (!await navigateAfterAuth(() => router.replace(returnTo))) setInfo(t("auth.signedInContinue"));
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(t(authErrorKey(error, 'login')));
        if (error.code === 'email_not_confirmed') setContinueTo(`/auth/verify-email?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      if (data.session) {
        setPassword("");
        setContinueTo(returnTo);
        if (!await navigateAfterAuth(() => router.replace(returnTo))) setInfo(t("auth.signedInContinue"));
      } else {
        setError(t("auth.errors.unavailable"));
      }
    } catch (e) {
      setError(t(authErrorKey(e, isLogin ? 'login' : 'signup')));
    } finally {
      submission.current = false;
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
          <Link href="/jobs" className="mb-4 block text-sm underline">{t("guest.browse")}</Link>
          <span className="text-sm text-gray-500 dark:text-white/60">
            {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}
          </span>
          <Button
            disabled={submitting}
            onClick={() => setIsLogin(!isLogin)}
            variant="link"
            className="ml-1 h-auto px-0 py-0 text-sm"
          >
            {isLogin ? t("auth.signUp") : t("auth.signIn")}
          </Button>
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <motion.form
          key={isLogin ? "login" : "register"}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-8"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
            {!isSupabaseConfigured && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {t("auth.errors.missingSupabaseEnv")}
              </p>
            )}
            {!isLogin && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
                  {t("auth.fullName")}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
              </div>
            )}

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

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
                {t("auth.password")}
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

            {!isLogin && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/60">
                  {t("auth.confirmPassword")}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-transparent border-b border-gray-300 dark:border-white/10 py-2 text-gray-900 dark:text-white outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
              </div>
            )}

            {isLogin && (
              <Button
                type="button"
                onClick={() => router.push("/auth/forgot-password")}
                variant="link"
                className="-mt-4 h-auto self-end px-0 py-0 text-xs"
              >
                {t("auth.forgotPassword")}
              </Button>
            )}

            {error && isSupabaseConfigured && (
              <div role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {info && (
              <div role="status" className="text-sm text-gray-600 dark:text-white/70">
                {info}
              </div>
            )}

            {continueTo && (
              <Link href={continueTo} className="text-sm font-medium underline">
                {t(continueTo.startsWith('/auth/verify-email') ? 'auth.openEmailVerification' : 'auth.continueToApp')}
              </Link>
            )}

            <Button
              type="submit"
              className="mt-4 h-12 w-full uppercase tracking-widest"
              disabled={submitting || !isSupabaseConfigured || Boolean(continueTo && !error)}
            >
              {submitting
                ? t("auth.working")
                : isLogin
                  ? t("auth.signIn")
                  : t("auth.createAccountButton")}
            </Button>
        </motion.form>
      </AnimatePresence>
    </AuthShell>
  );
}
