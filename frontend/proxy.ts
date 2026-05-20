import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'

const PUBLIC_PATHS = ['/auth']
const ALLOWED_AUTH_PATHS = ['/auth/forgot-password', '/auth/reset-password']

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true

  // Next internals
  if (pathname.startsWith('/_next')) return true

  // Public assets + translations (public/ is served from root)
  if (pathname.startsWith('/locales')) return true

  // Backend rewrite proxy
  if (pathname.startsWith('/api')) return true

  // Common single-file assets
  if (pathname === '/favicon.ico') return true

  // Any path with an extension is treated as a static file
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true

  return false
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase isn't configured yet, don't block local dev.
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  const isAuthPath = pathname === '/auth' || pathname.startsWith('/auth/')
  const allowLoggedInAuthPath = ALLOWED_AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )

  // Allow static/public paths through without checks (except /auth which we may
  // redirect away from if already authenticated).
  if (!isAuthPath && isPublicPath(pathname)) {
    return NextResponse.next()
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user && isAuthPath && !allowLoggedInAuthPath) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  // Important: logged-out users must be able to reach /auth.
  if (!user && isAuthPath) {
    return res
  }

  if (!user) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/auth'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
