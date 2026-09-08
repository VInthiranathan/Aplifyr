import { isSafeMutation, validProfile } from '../../lib/apiSecurity'
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateJobPreferences } from '../../lib/jobPreferences'
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from '@supabase/auth-helpers-nextjs'

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
}

function appendSetCookie(res: NextApiResponse, values: string[]) {
  const existing = res.getHeader('Set-Cookie')
  const existingArray =
    typeof existing === 'string'
      ? [existing]
      : Array.isArray(existing)
      ? existing
      : []

  res.setHeader('Set-Cookie', [...existingArray, ...values])
}

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (!['GET', 'PUT', 'PATCH'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, PUT, PATCH')
    res.status(405).json({ error: 'Method not allowed' }); return
  }
  if (['PUT', 'PATCH'].includes(req.method ?? '') && !isSafeMutation(req)) {
    res.status(403).json({ error: 'Forbidden' }); return
  }
  if (req.method === 'PUT' && !validProfile(req.body)) {
    res.status(400).json({ error: 'Invalid profile' }); return
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const cookieHeader = req.headers.cookie ?? ''
  const parsed = parseCookieHeader(cookieHeader)

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase not configured' })
    return
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parsed.map((c) => ({ name: c.name, value: c.value ?? '' }))
      },
      setAll(cookies) {
        const setCookie = cookies.map(({ name, value, options }) =>
          serializeCookieHeader(name, value, options),
        )
        appendSetCookie(res, setCookie)
      },
    },
  })

  let user
  try {
    const {
      data: { user: authenticatedUser },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    user = authenticatedUser
  } catch (error) {
    console.error('[api/profile] Authentication service unavailable')
    res.status(503).json({ error: 'Authentication service temporarily unavailable' })
    return
  }

  if (!user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  if (req.method === 'GET') {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id,full_name,title,location,bio,tech_stack,roles,location_preferences,created_at,updated_at')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      res.status(500).json({ error: 'Profile operation failed' })
      return
    }

    res.status(200).json({ profile: profile ?? null, userId: user.id })
    return
  }

  if (req.method === 'PATCH') {
    const preferences = validateJobPreferences(req.body)
    const version = req.body?.updatedAt
    if (!preferences || (version !== null && (typeof version !== 'string' || !Number.isFinite(Date.parse(version))))) {
      res.status(400).json({ error: 'Invalid job preferences' })
      return
    }
    try {
      const fields = { roles: preferences.roles, location: preferences.location,
        location_preferences: preferences.locationPreferences }
      const table = supabase.from('profiles')
      const query = version === null ? table.insert({ id: user.id, ...fields }) :
        table.update(fields).eq('id', user.id).eq('updated_at', version)
      const { data: profile, error } = await query
        .select('id,full_name,title,location,bio,tech_stack,roles,location_preferences,created_at,updated_at')
        .maybeSingle()
      if ((!error && !profile) || error?.code === '23505') {
        res.status(409).json({ error: 'Profile changed; reload before saving' })
        return
      }
      if (error) throw error
      res.status(200).json({ profile })
    } catch {
      res.status(503).json({ error: 'Could not save job preferences' })
    }
    return
  }

  if (req.method === 'PUT') {
    try {
      const body = req.body

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'Invalid profile' })
        return
      }
      // Preserve omitted fields so editing a biography cannot overwrite newer preferences.
      const upsertObj: Record<string, unknown> = { id: user.id }
      for (const [input, column] of Object.entries({ name: 'full_name', title: 'title', location: 'location', bio: 'bio' })) {
        if (input in body) {
          if (typeof body[input] !== 'string') { res.status(400).json({ error: 'Invalid profile' }); return }
          upsertObj[column] = body[input]
        }
      }
      for (const [input, column] of Object.entries({ locationPreferences: 'location_preferences', tags: 'tech_stack', roles: 'roles' })) {
        if (input in body) upsertObj[column] = normalizeStringArray(body[input])
      }

      const { data: updated, error } = await supabase
        .from('profiles')
        .upsert(upsertObj, { onConflict: 'id' })
        .select('id,full_name,title,location,bio,tech_stack,roles,location_preferences,created_at,updated_at')
        .single()

      if (error) {
        res.status(500).json({ error: 'Profile operation failed' })
        return
      }

      res.status(200).json({ profile: updated })
      return
    } catch (e) {
      res.status(503).json({ error: 'Profile operation failed' })
      return
    }
  }

  res.setHeader('Allow', 'GET, PUT, PATCH')
  res.status(405).json({ error: 'Method not allowed' })
}
