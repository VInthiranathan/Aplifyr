import { useEffect, useState } from "react";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import { MailCheck } from "lucide-react";
import AuthShell from "../../components/AuthShell";
import { Button } from "../../components/ui/button";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? "en", ["common"])),
  },
});

export default function VerifyEmailPage() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { locale, push, asPath } = router;
  const { setTheme, resolvedTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);

  useEffect(() => setMountedTheme(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <AuthShell
      title={t("auth.verifyEmailTitle")}
      subtitle={t("auth.verifyEmailSubtitle")}
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
          {t("auth.verifyEmailCardTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-white/70">
          {t("auth.verifyEmailInstructions")}
        </p>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-white/55">
          {t("auth.verifyEmailSpamHint")}
        </p>
      </div>
      <Button type="button" className="mt-6 h-12 w-full" onClick={() => router.push("/auth")}>
        {t("auth.backToSignIn")}
      </Button>
    </AuthShell>
  );
}
