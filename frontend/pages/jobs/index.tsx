import { useState, useEffect, useCallback } from 'react'
import type { ExternalJob, AFSearchResult } from '../../types/api'
import { Search, MapPin, Wifi, Briefcase, ExternalLink, Loader2 } from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:5000'

interface Filters {
  q: string
  municipality: string
  remote: boolean
  workingHoursType: '' | 'FULL_TIME' | 'PART_TIME'
}

const HOUR_OPTIONS = [
  { value: '',          label: 'Alla anställningsformer' },
  { value: 'FULL_TIME', label: 'Heltid' },
  { value: 'PART_TIME', label: 'Deltid' },
]

export default function AllJobsPage() {
  const [filters, setFilters] = useState<Filters>({
    q: '',
    municipality: '',
    remote: false,
    workingHoursType: '',
  })
  const [debouncedQ, setDebouncedQ]     = useState('')
  const [jobs, setJobs]                 = useState<ExternalJob[]>([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [offset, setOffset]             = useState(0)
  const LIMIT = 20

  // Debounce search query 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(filters.q)
      setOffset(0)
    }, 400)
    return () => clearTimeout(t)
  }, [filters.q])

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedQ)                    params.set('q', debouncedQ)
      if (filters.municipality.trim())   params.set('municipality', filters.municipality.trim())
      if (filters.remote)                params.set('remote', 'true')
      if (filters.workingHoursType)      params.set('workingHoursType', filters.workingHoursType)
      params.set('limit',  String(LIMIT))
      params.set('offset', String(offset))

      const res = await fetch(`${BACKEND}/api/externaljobs?${params}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data: AFSearchResult = await res.json()
      setJobs(data.hits ?? [])
      setTotal(data.total?.value ?? 0)
    } catch (e) {
      setError('Kunde inte hämta jobb. Kontrollera att backend körs.')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, filters.municipality, filters.remote, filters.workingHoursType, offset])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setOffset(0)
  }

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Alla jobb</h1>
        {!loading && total > 0 && (
          <span className="text-white/40 text-sm">{total.toLocaleString('sv-SE')} annonser</span>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Sök titel, kompetens…"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Municipality */}
        <div className="relative min-w-[180px]">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Stad (ex. Stockholm)"
            value={filters.municipality}
            onChange={(e) => update({ municipality: e.target.value })}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Working hours */}
        <div className="relative min-w-[180px]">
          <Briefcase size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <select
            value={filters.workingHoursType}
            onChange={(e) => update({ workingHoursType: e.target.value as Filters['workingHoursType'] })}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white/70 focus:outline-none focus:border-purple-500/50 appearance-none"
          >
            {HOUR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#1a1a1a]">{o.label}</option>
            ))}
          </select>
        </div>

        {/* Remote toggle */}
        <button
          onClick={() => update({ remote: !filters.remote })}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-colors ${
            filters.remote
              ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
              : 'bg-[#1a1a1a] border-white/10 text-white/50 hover:text-white'
          }`}
        >
          <Wifi size={15} />
          Remote
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-white/40">
          <Loader2 size={24} className="animate-spin mr-3" />
          Hämtar annonser…
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-white/30">
          <Briefcase size={40} className="mb-3 opacity-30" />
          <p className="text-sm">Inga jobb hittades. Prova andra sökord eller filter.</p>
        </div>
      )}

      {/* ── Job cards ── */}
      {!loading && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-[#1a1a1a] rounded-2xl p-5 border border-white/5 hover:border-purple-500/20 transition-colors group"
            >
              <div className="flex items-start gap-4">
                {/* Logo placeholder */}
                <div className="w-10 h-10 rounded-xl bg-white/5 flex-shrink-0 flex items-center justify-center text-white/20 overflow-hidden">
                  {job.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.logo_url} alt="" className="w-full h-full object-contain p-1" />
                  ) : (
                    <Briefcase size={18} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold text-white leading-snug">{job.headline}</h2>
                    {job.webpage_url && (
                      <a
                        href={job.webpage_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-white/20 hover:text-purple-400 transition-colors"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>

                  <p className="text-xs text-white/50 mt-0.5">{job.employer?.name}</p>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {job.workplace_address?.municipality && (
                      <span className="flex items-center gap-1 text-xs text-white/40">
                        <MapPin size={11} />
                        {job.workplace_address.municipality}
                      </span>
                    )}
                    {job.remote && (
                      <span className="flex items-center gap-1 text-xs text-purple-400">
                        <Wifi size={11} />
                        Remote
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {job.working_hours_type?.label && (
                  <span className="text-xs border border-white/10 text-white/40 rounded-full px-3 py-0.5">
                    {job.working_hours_type.label}
                  </span>
                )}
                {job.employment_type?.label && (
                  <span className="text-xs border border-white/10 text-white/40 rounded-full px-3 py-0.5">
                    {job.employment_type.label}
                  </span>
                )}
                {job.application_deadline && (
                  <span className="ml-auto text-xs text-white/25">
                    Sista ansökningsdag: {new Date(job.application_deadline).toLocaleDateString('sv-SE')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="px-4 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-sm text-white/60 hover:text-white disabled:opacity-30 transition-colors"
          >
            ← Föregående
          </button>
          <span className="text-sm text-white/40">{currentPage} / {totalPages}</span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={currentPage >= totalPages}
            className="px-4 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-sm text-white/60 hover:text-white disabled:opacity-30 transition-colors"
          >
            Nästa →
          </button>
        </div>
      )}
    </div>
  )
}
