import type { GetServerSideProps } from 'next'
import type { Job, Progression, JobsData } from '../types/api'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'


const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:5000'

interface Props {
  jobs: Job[]
  progression: Progression
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ locale }) => {
  try {
    const res = await fetch(`${BACKEND}/api/jobs`)
    if (!res.ok) throw new Error('backend error')
    const data: JobsData = await res.json()
    return { props: { jobs: data.jobs, progression: data.progression, ...(await serverSideTranslations(locale ?? 'en', ['common'])) } }
  } catch {
    return {
      props: {
        jobs: [],
        progression: { applied: 0, readyToApply: 0, readyToGenerate: 0 },
        ...(await serverSideTranslations(locale ?? 'en', ['common'])),
      },
    }
  }
}

export default function Home({ jobs, progression }: Props) {


  const total = progression.applied + progression.readyToApply + progression.readyToGenerate || 1
  const appliedPct = (progression.applied / total) * 100
  const readyPct = ((progression.applied + progression.readyToApply) / total) * 100

  const gradeCount = (g: 'A' | 'B' | 'C') => jobs.filter((j) => j.grade === g).length
  const grades = [
    { label: 'A GRADE MATCHES', count: gradeCount('A') },
    { label: 'B GRADE MATCHES', count: gradeCount('B') },
    { label: 'C GRADE MATCHES', count: gradeCount('C') },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* top section: job list + progression */}
      <div className="flex gap-6">
        {/* Job list */}
        <div className="flex-1 space-y-3">
          {jobs.length === 0 && (
            <p className="text-slate-400 dark:text-white/40 text-sm">Kunde inte hämta jobb – är backend igång?</p>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 transition-colors shadow-sm dark:shadow-none"
            >
              {/* badges row */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {job.isNew && (
                  <span className="text-xs font-semibold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 px-2 py-0.5 rounded-full">
                    ny
                  </span>
                )}
                {job.badge && (
                  <span className="text-xs font-medium text-purple-600 dark:text-purple-300 border border-purple-300 dark:border-purple-500/40 px-2 py-0.5 rounded-full">
                    {job.badge}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    job.grade === 'A' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                    job.grade === 'B' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                    'bg-red-500/20 text-red-600 dark:text-red-400'
                  }`}>{job.grade}</span>
                  <button className="text-slate-300 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/70 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>
              </div>

              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{job.title}</h2>
              <p className="text-sm text-slate-500 dark:text-white/50 mt-0.5">{job.company}</p>
              <p className="text-sm text-slate-400 dark:text-white/40">{job.location}</p>

              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="text-xs border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 rounded-full px-3 py-0.5">
                  {job.type}
                </span>
                {job.perks.map((p) => (
                  <span key={p} className="text-xs border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 rounded-full px-3 py-0.5">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Progression widget */}
        <div className="w-64 bg-gradient-to-br from-orange-300 via-purple-500 to-purple-700 rounded-2xl p-5 flex flex-col">
          <h3 className="text-white font-semibold text-lg mb-4">Progression</h3>
          <div className="flex justify-center mb-6">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3"
                  strokeDasharray={`${readyPct} ${100 - readyPct}`} />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray={`${appliedPct} ${100 - appliedPct}`} />
              </svg>
            </div>
          </div>
          <div className="space-y-2 mt-auto">
            {[
              { color: 'bg-white', label: 'Applied', val: progression.applied },
              { color: 'bg-white/50', label: 'Ready to apply', val: progression.readyToApply },
              { color: 'bg-white/20', label: 'Ready to generate', val: progression.readyToGenerate },
            ].map(({ color, label, val }) => (
              <div key={label} className="flex items-center justify-between text-white text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  {label}
                </div>
                <span>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* grade cards */}
      <div className="grid grid-cols-3 gap-4">
        {grades.map(({ label, count }) => (
          <div key={label} className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 flex flex-col items-center justify-center border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none">
            <p className="text-xs text-slate-400 dark:text-white/50 uppercase tracking-widest mb-3">{label}</p>
            <p className="text-5xl font-bold text-slate-900 dark:text-white">{count}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
