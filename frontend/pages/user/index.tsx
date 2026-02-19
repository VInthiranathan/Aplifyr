// Mock user – byt ut mot API-data när backend är kopplad
const user = {
  name: 'Jordan Jeremih',
  title: 'Jr Software developer',
  location: 'Malmö',
  bio: '',
  tags: 'ex C#, Typescript osv',
  roles: '',
}

const locationFilters = ['Only my location', 'Nearby location', 'Region', 'Country', 'Remote']

export default function UserPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col">
      {/* banner */}
      <div className="h-32 bg-gradient-to-r from-orange-300 via-purple-500 to-purple-700 rounded-b-none relative flex-shrink-0" />

      {/* profile header */}
      <div className="px-6 pb-6 relative">
        {/* avatar – overlaps banner */}
        <div className="-mt-10 mb-3 w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 border-4 border-[#0d0d0d] overflow-hidden flex items-center justify-center text-2xl font-bold">
          JJ
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
          <div className="bg-[#1a1a1a] rounded-2xl h-52 flex items-center justify-center border border-white/5">
            {user.bio ? (
              <p className="p-4 text-white/70 text-sm">{user.bio}</p>
            ) : (
              <span className="text-white/20 text-sm">BIO</span>
            )}
          </div>

          {/* location filter */}
          <div className="flex gap-3 flex-wrap">
            {locationFilters.map((f) => (
              <button
                key={f}
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                {f}
              </button>
            ))}
          </div>

          {/* tags input */}
          <div className="bg-[#1a1a1a] rounded-xl px-4 py-3 border border-white/5 text-white/40 text-sm">
            {user.tags || 'Tags: ex C#, Typescript osv'}
          </div>

          {/* roles input */}
          <div className="bg-[#1a1a1a] rounded-xl px-4 py-3 border border-white/5 text-white/40 text-sm">
            {user.roles || 'Roles:'}
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
