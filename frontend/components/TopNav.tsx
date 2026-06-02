import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import SettingsDrawer from "./SettingsDrawer";

export default function TopNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-30 h-14 bg-white dark:bg-[#111] border-b border-slate-200 dark:border-white/10 flex items-center justify-between px-4 md:hidden">
        <Link
          href="/"
          className="text-xl font-bold tracking-[0.2em] text-slate-900 dark:text-white hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
          style={{ fontFamily: "'Roboto', sans-serif" }}
        >
          Aplifyr
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-white/60 transition-colors"
          aria-label="Open settings"
        >
          <Menu size={20} />
        </button>
      </nav>
      <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
