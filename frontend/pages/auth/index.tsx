import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedBackground from "../../components/AnimatedBackground";
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
  }, [isLogin]);

  const handleSubmit = async () => {
    if (!isSupabaseConfigured) {
      setError(t("auth.errors.missingSupabaseEnv"));
      return;
    }

    const supabase = getSupabaseBrowserClient();

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
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
          email,
          password,
          options: {
            data: fullName ? { full_name: fullName } : undefined,
          },
        });

        if (error) {
          setError(error.message);
          return;
        }

        if (!data.session) {
          setInfo(t("auth.checkEmail"));
          return;
        }

        await router.replace("/");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.session) {
        await router.replace("/");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-[#0d0d0d]">
      {/* Left Panel - 30% */}
      <div
        className="w-[30vw] min-w-[360px] h-full flex flex-col justify-center bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-white/5 p-16"
      >
        <div className="mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-white/60">
            {subtitle}
          </p>
        </div>

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
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
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
              <button
                type="button"
                className="self-end text-xs text-gray-500 dark:text-white/60 hover:text-sky-600 dark:hover:text-sky-400 transition-colors -mt-4"
              >
                {t("auth.forgotPassword")}
              </button>
            )}

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {info && (
              <div className="text-sm text-gray-600 dark:text-white/70">
                {info}
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-4 rounded-none h-12 text-sm font-medium uppercase tracking-widest"
              disabled={submitting || !isSupabaseConfigured}
            >
              {submitting
                ? t("auth.working")
                : isLogin
                  ? t("auth.signIn")
                  : t("auth.createAccountButton")}
            </Button>
          </motion.form>
        </AnimatePresence>

        <div className="mt-8 text-center">
          <span className="text-sm text-gray-500 dark:text-white/60">
            {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}
          </span>
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-sky-600 dark:text-sky-400 font-medium hover:underline"
          >
            {isLogin ? t("auth.signUp") : t("auth.signIn")}
          </button>
        </div>
        <div className="mt-6 flex items-center gap-2 px-1 justify-center">
          <button
            onClick={() => {
              const next = locale === 'en' ? 'sv' : 'en'
              push(asPath, asPath, { locale: next })
            }}
            className="text-xs font-semibold py-2 px-3 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {locale === 'en' ? 'SV' : 'EN'}
          </button>

          {mountedTheme && (
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
              title={isDark ? t('theme.light') : t('theme.dark')}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Right Side - 70% */}
      <div className="flex-1 h-full">
        <AnimatedBackground isFocused={isFocused} />
      </div>
      </div>
  );
}

