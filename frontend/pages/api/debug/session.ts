import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from '@supabase/auth-helpers-nextjs'

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
    return res.status(200).json({
      supabaseConfigured: false,
      cookies: parsed.map((c) => ({ name: c.name, value: c.value ?? '' })),
      user: null,
    })
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parsed.map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }))
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
    error,
  } = await supabase.auth.getUser()

  return res.status(200).json({
    supabaseConfigured: true,
    cookies: parsed.map((c) => ({ name: c.name, value: c.value ?? '' })),
    user: user ?? null,
    error: error?.message ?? null,
  })
}
