// Mock data – byt ut mot riktiga API-anrop när backend är kopplad
const jobs = [
  {
    id: 1,
    tag: 'ny',
    badge: 'Svarar ofta inom 3 dagar',
    title: 'Fullstack-utvecklare med AI fokus!',
    company: 'Academic Work',
    location: 'Lund',
    type: 'Heltid',
    perks: [],
  },
  {
    id: 2,
    tag: null,
    badge: 'Svarar ofta inom 3 dagar',
    title: 'Junior-utvecklare till Axis Communications',
    company: 'Axis Communications',
    location: 'Malmö',
    type: 'Heltid',
    perks: ['Friskvårdsbidrag'],
  },
]

const progression = {
  applied: 8,
  readyToApply: 10,
  readyToGenerate: 24,
}

const grades = [
  { label: 'A GRADE MATCHES', count: 4 },
  { label: 'B GRADE MATCHES', count: 14 },
  { label: 'C GRADE MATCHES', count: 24 },
]

export default function Home() {
  const total =
    progression.applied + progression.readyToApply + progression.readyToGenerate
  const appliedPct = (progression.applied / total) * 100
  const readyPct = ((progression.applied + progression.readyToApply) / total) * 100

  return (
    <div className="p-6 space-y-6">
      {/* top section: job list + progression */}
      <div className="flex gap-6">
        {/* Job list */}
        <div className="flex-1 space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-2xl p-5 text-black shadow-sm border border-gray-100"
            >
              {/* badges row */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {job.tag && (
                  <span className="text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                    {job.tag}
                  </span>
                )}
                <span className="text-xs font-medium text-blue-600 border border-blue-300 px-2 py-0.5 rounded-full">
                  {job.badge}
                </span>
                {/* bookmark on the right */}
                <div className="ml-auto flex flex-col gap-1">
                  <button className="text-gray-400 hover:text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  </button>
                </div>
              </div>

              <h2 className="text-lg font-bold">{job.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{job.company}</p>
              <p className="text-sm text-gray-500">{job.location}</p>

              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="text-xs border border-gray-300 text-gray-600 rounded-full px-3 py-0.5">
                  {job.type}
                </span>
                {job.perks.map((p) => (
                  <span
                    key={p}
                    className="text-xs border border-gray-300 text-gray-600 rounded-full px-3 py-0.5"
                  >
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

          {/* ring */}
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

          {/* legend */}
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
          <div
            key={label}
            className="bg-[#1a1a1a] rounded-2xl p-6 flex flex-col items-center justify-center border border-white/5"
          >
            <p className="text-xs text-white/50 uppercase tracking-widest mb-3">{label}</p>
            <p className="text-5xl font-bold text-white">{count}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
