import type { NextApiRequest, NextApiResponse } from 'next'
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const cookieHeader = req.headers.cookie ?? ''
  const parsed = parseCookieHeader(cookieHeader)

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    return res.status(500).json({ error: userError.message })
  }

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  if (req.method === 'GET') {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json({ profile: profile ?? null })
  }

  if (req.method === 'PUT') {
    try {
      const body = req.body

      const upsertObj = {
        id: user.id,
        full_name: body.name ?? null,
        title: body.title ?? null,
        location: body.location ?? null,
        bio: body.bio ?? null,
        location_preferences: normalizeStringArray(body.locationPreferences),
        tech_stack: normalizeStringArray(body.tags),
        roles: normalizeStringArray(body.roles),
      }

      const { data: updated, error } = await supabase
        .from('profiles')
        .upsert(upsertObj, { onConflict: 'id' })
        .select()
        .single()

      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ profile: updated })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return res.status(500).json({ error: message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
