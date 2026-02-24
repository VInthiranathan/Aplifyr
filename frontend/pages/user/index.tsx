import type { GetServerSideProps } from 'next'
import type { User } from '../../types/api'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:5000'

interface Props {
  user: User | null
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ locale }) => {
  try {
    const res = await fetch(`${BACKEND}/api/user`)
    if (!res.ok) throw new Error('backend error')
    const user: User = await res.json()
    return { props: { user, ...(await serverSideTranslations(locale ?? 'en', ['common'])) } }
  } catch {
    return { props: { user: null, ...(await serverSideTranslations(locale ?? 'en', ['common'])) } }
  }
}

const locationFilters = ['Only my location', 'Nearby location', 'Region', 'Country', 'Remote']

export default function UserPage({ user }: Props) {
  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-white/40 text-sm">
        Kunde inte hämta användardata – är backend igång?
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d] text-slate-900 dark:text-white flex flex-col">
      {/* banner */}
      <div className="h-32 bg-gradient-to-r from-orange-300 via-purple-500 to-purple-700 flex-shrink-0" />

      {/* profile header */}
      <div className="px-6 pb-6 relative">
        <div className="-mt-10 mb-3 w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 border-4 border-gray-50 dark:border-[#0d0d0d] flex items-center justify-center text-2xl font-bold text-white">
          {user.avatarInitials}
        </div>
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <p className="text-slate-500 dark:text-white/50 text-sm mt-0.5">{user.title}</p>
        <p className="text-slate-400 dark:text-white/40 text-sm mt-1">Location: {user.location}</p>
      </div>

      {/* main content */}
      <div className="flex gap-6 px-6 pb-10 flex-1">
        {/* left column */}
        <div className="flex-1 space-y-4">
          {/* BIO */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl h-52 flex items-start border border-slate-200 dark:border-white/5 overflow-auto p-4 shadow-sm dark:shadow-none">
            {user.bio ? (
              <p className="text-slate-600 dark:text-white/70 text-sm">{user.bio}</p>
            ) : (
              <span className="text-slate-300 dark:text-white/20 text-sm m-auto">BIO</span>
            )}
          </div>

          {/* location filter */}
          <div className="flex gap-3 flex-wrap">
            {locationFilters.map((f) => (
              <button key={f} className="text-sm text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors">
                {f}
              </button>
            ))}
          </div>

          {/* tags */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl px-4 py-3 border border-slate-200 dark:border-white/5 text-sm shadow-sm dark:shadow-none">
            {user.tags.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {user.tags.map((tag) => (
                  <span key={tag} className="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 text-xs px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-slate-300 dark:text-white/30">Tags: ex C#, Typescript osv</span>
            )}
          </div>

          {/* roles */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl px-4 py-3 border border-slate-200 dark:border-white/5 text-sm shadow-sm dark:shadow-none">
            {user.roles.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {user.roles.map((role) => (
                  <span key={role} className="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 text-xs px-2 py-0.5 rounded-full">
                    {role}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-slate-300 dark:text-white/30">Roles:</span>
            )}
          </div>
        </div>

        {/* right column – CV placeholder */}
        <div className="w-72 bg-white dark:bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-slate-200 dark:border-white/5 min-h-[300px] shadow-sm dark:shadow-none">
          <span className="text-slate-300 dark:text-white/20 text-sm">CV + editor?</span>
        </div>
      </div>
    </div>
  )
}
