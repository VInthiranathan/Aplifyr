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
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase isn't configured, just redirect to /auth.
  if (!supabaseUrl || !supabaseAnonKey) {
    res.writeHead(302, { Location: '/auth' })
    res.end()
    return
  }

  const cookieHeader = req.headers.cookie ?? ''
  const incomingCookies = parseCookieHeader(cookieHeader)

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return incomingCookies.map((c) => ({
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

  try {
    await supabase.auth.signOut()
  } catch {
    // Ignore errors; we'll still expire cookies below.
  }

  // Expire ALL incoming cookies to reliably clear HttpOnly auth cookies
  // regardless of their exact names.
  const expired = incomingCookies.map(({ name }) =>
    serializeCookieHeader(name, '', {
      path: '/',
      expires: new Date(0),
      httpOnly: true,
    }),
  )

  appendSetCookie(res, expired)

  res.writeHead(302, { Location: '/auth' })
  res.end()
}
