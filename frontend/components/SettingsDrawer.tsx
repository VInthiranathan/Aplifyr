import { signOut } from "../lib/signOut";
import {useDialogFocus} from '../lib/useDialogFocus';
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { Sun, Moon, LogOut, X } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ open, onClose }: Props) {
  const dialog=useDialogFocus(open,onClose);
  const { t } = useTranslation("common");
  const { resolvedTheme, setTheme } = useTheme();
  const { locale, push, asPath } = useRouter();
  const isDark = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (media.matches) onClose(); };
    closeOnDesktop(); media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, [open, onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* drawer panel */}
      <div
        role="dialog"
        ref={dialog}
        tabIndex={-1}
        aria-modal="true"
        aria-label={t("nav.settings")}
        className="fixed right-0 top-0 bottom-0 z-50 w-64 bg-white dark:bg-[#1a1a1a] border-l border-slate-200 dark:border-white/10 shadow-xl md:hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10">
          <span className="font-semibold text-slate-800 dark:text-white">
            {t("nav.settings")}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/60"
            aria-label={t('privacy.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4 flex-1">
          <Link href="/privacy" onClick={onClose} className="underline">{t('privacy.title')}</Link>
          {/* locale toggle */}
          <Button
            onClick={() => {
              const next = locale === "en" ? "sv" : "en";
              push(asPath, asPath, { locale: next });
              onClose();
            }}
            variant="secondary"
            className="w-full justify-start"
          >
            {locale === "en" ? "SV — Svenska" : "EN — English"}
          </Button>

          {/* theme toggle */}
          {mounted && (
            <Button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              variant="secondary"
              className="w-full justify-start gap-2"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {isDark ? t("theme.light") : t("theme.dark")}
            </Button>
          )}
        </div>

        {/* sign out */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10">
          <Button
            onClick={signOut}
            variant="ghost"
            className="w-full justify-start text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
          >
            <LogOut size={16} />
            {t("auth.signOut")}
          </Button>
        </div>
      </div>
    </>
  );
}
