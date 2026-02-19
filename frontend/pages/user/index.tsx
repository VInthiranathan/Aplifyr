import type { GetServerSideProps } from 'next'
import type { User } from '../../types/api'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:5000'

interface Props {
  user: User | null
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  try {
    const res = await fetch(`${BACKEND}/api/user`)
    if (!res.ok) throw new Error('backend error')
    const user: User = await res.json()
    return { props: { user } }
  } catch {
    return { props: { user: null } }
  }
}

const locationFilters = ['Only my location', 'Nearby location', 'Region', 'Country', 'Remote']

export default function UserPage({ user }: Props) {
  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40 text-sm">
        Kunde inte hämta användardata – är backend igång?
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col">
      {/* banner */}
      <div className="h-32 bg-gradient-to-r from-orange-300 via-purple-500 to-purple-700 flex-shrink-0" />

      {/* profile header */}
      <div className="px-6 pb-6 relative">
        <div className="-mt-10 mb-3 w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 border-4 border-[#0d0d0d] flex items-center justify-center text-2xl font-bold">
          {user.avatarInitials}
        </div>
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <p className="text-white/50 text-sm mt-0.5">{user.title}</p>
        <p className="text-white/40 text-sm mt-1">Location: {user.location}</p>
      </div>

      {/* main content */}
      <div className="flex gap-6 px-6 pb-10 flex-1">
        {/* left column */}
        <div className="flex-1 space-y-4">
          {/* BIO */}
          <div className="bg-[#1a1a1a] rounded-2xl h-52 flex items-start border border-white/5 overflow-auto p-4">
            {user.bio ? (
              <p className="text-white/70 text-sm">{user.bio}</p>
            ) : (
              <span className="text-white/20 text-sm m-auto">BIO</span>
            )}
          </div>

          {/* location filter */}
          <div className="flex gap-3 flex-wrap">
            {locationFilters.map((f) => (
              <button key={f} className="text-sm text-white/60 hover:text-white transition-colors">
                {f}
              </button>
            ))}
          </div>

          {/* tags */}
          <div className="bg-[#1a1a1a] rounded-xl px-4 py-3 border border-white/5 text-sm">
            {user.tags.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {user.tags.map((tag) => (
                  <span key={tag} className="bg-white/10 text-white/70 text-xs px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-white/30">Tags: ex C#, Typescript osv</span>
            )}
          </div>

          {/* roles */}
          <div className="bg-[#1a1a1a] rounded-xl px-4 py-3 border border-white/5 text-sm">
            {user.roles.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {user.roles.map((role) => (
                  <span key={role} className="bg-white/10 text-white/70 text-xs px-2 py-0.5 rounded-full">
                    {role}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-white/30">Roles:</span>
            )}
          </div>
        </div>

        {/* right column – CV placeholder */}
        <div className="w-72 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-white/5 min-h-[300px]">
          <span className="text-white/20 text-sm">CV + editor?</span>
        </div>
      </div>
    </div>
  )
}
