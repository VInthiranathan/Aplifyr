import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'

const PUBLIC_PATHS = ['/auth']

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true

  // Next internals
  if (pathname.startsWith('/_next')) return true

  // Public assets + translations (public/ is served from root)
  if (pathname.startsWith('/locales')) return true

  // API routes handle their own authentication.
  if (pathname.startsWith('/api')) return true

  // Common single-file assets
  if (['/favicon.ico', '/Aplifyr_Ikon.png', '/AplifyrLogo.png'].includes(pathname)) return true


  return false
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Login, password recovery, static files and API routes must never depend on
  // an outbound Supabase auth request just to become reachable. This also keeps
  // /auth usable when Supabase has a temporary network interruption.
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase isn't configured yet, don't block local dev.
  if (!supabaseUrl || !supabaseAnonKey) {
    return process.env.NODE_ENV === 'production'
      ? new NextResponse('Authentication unavailable', { status: 503 })
      : NextResponse.next()
  }

  const res = NextResponse.next()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
        })
      },
    },
  })

  try {
    // getClaims validates the JWT and avoids the unconditional Auth server
    // round-trip performed by getUser(). We only need the authenticated subject
    // here to decide whether a protected page may be opened.
    const { data, error } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub

    if (!error && userId) {
      return res
    }
  } catch (error) {
    // Do not let a temporary ECONNRESET crash the Next request pipeline.
    console.error('[auth proxy] Failed to validate session')
  }

  const redirectUrl = req.nextUrl.clone()
  redirectUrl.pathname = '/auth'
  redirectUrl.search = ''
  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
