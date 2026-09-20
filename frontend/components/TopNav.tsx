import Link from "next/link";
import {useTranslation} from 'next-i18next';
import { useState } from "react";
import { Menu } from "lucide-react";
import SettingsDrawer from "./SettingsDrawer";

export default function TopNav() {
  const {t}=useTranslation('common');
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-end justify-between border-b border-slate-200 bg-white px-4 pb-3 dark:border-white/10 dark:bg-[#111] md:hidden">
        <Link
          href="/"
          className="text-xl font-bold tracking-[0.2em] text-slate-900 dark:text-white hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
          style={{ fontFamily: "'Roboto', sans-serif" }}
        >
          Aplifyr
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          className="-mb-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/5"
          aria-label={t('nav.settings')}
        >
          <Menu size={20} />
        </button>
      </nav>
      <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
