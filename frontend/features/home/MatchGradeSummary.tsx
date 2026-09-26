import { useTranslation } from 'next-i18next';
export function MatchGradeSummary({gradeA, gradeB, gradeC}: {gradeA: number | null; gradeB: number | null; gradeC: number | null}) {
  const {t} = useTranslation('common');
  return <>
      {/* Grade Match Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-6">
          {/* A Grade */}
          <div className="group rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-sm transition-all hover:shadow-md dark:border-white/5 dark:bg-[#1a1a1a] dark:shadow-none sm:rounded-3xl sm:p-8 sm:text-left sm:hover:scale-[1.02]">
            <div className="mb-3 flex items-center justify-center sm:mb-6">
              <div className="rounded-full bg-green-100 px-3 py-1.5 transition-transform group-hover:scale-110 dark:bg-green-500/20 sm:px-4 sm:py-2">
                <span className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">
                  A
                </span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-2xl font-bold text-gray-900 dark:text-white sm:mb-2 sm:text-5xl">
                {gradeA ?? <span className="text-gray-300 dark:text-white/20">—</span>}
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-white/50 sm:text-sm">
                {t("home.matches")}
              </p>
            </div>
          </div>

          {/* B Grade */}
          <div className="group rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-sm transition-all hover:shadow-md dark:border-white/5 dark:bg-[#1a1a1a] dark:shadow-none sm:rounded-3xl sm:p-8 sm:text-left sm:hover:scale-[1.02]">
            <div className="mb-3 flex items-center justify-center sm:mb-6">
              <div className="rounded-full bg-yellow-100 px-3 py-1.5 transition-transform group-hover:scale-110 dark:bg-yellow-500/20 sm:px-4 sm:py-2">
                <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                  B
                </span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-2xl font-bold text-gray-900 dark:text-white sm:mb-2 sm:text-5xl">
                {gradeB ?? <span className="text-gray-300 dark:text-white/20">—</span>}
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-white/50 sm:text-sm">
                {t("home.matches")}
              </p>
            </div>
          </div>

          {/* C Grade */}
          <div className="group rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-sm transition-all hover:shadow-md dark:border-white/5 dark:bg-[#1a1a1a] dark:shadow-none sm:rounded-3xl sm:p-8 sm:text-left sm:hover:scale-[1.02]">
            <div className="mb-3 flex items-center justify-center sm:mb-6">
              <div className="rounded-full bg-red-100 px-3 py-1.5 transition-transform group-hover:scale-110 dark:bg-red-500/20 sm:px-4 sm:py-2">
                <span className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                  C
                </span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-2xl font-bold text-gray-900 dark:text-white sm:mb-2 sm:text-5xl">
                {gradeC ?? <span className="text-gray-300 dark:text-white/20">—</span>}
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-white/50 sm:text-sm">
                {t("home.matches")}
              </p>
            </div>
          </div>
      </div>

  </>;
}
