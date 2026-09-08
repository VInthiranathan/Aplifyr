import type { AppProps } from 'next/app'
import '../styles/globals.css'
import Layout from '../components/Layout'
import { appWithTranslation } from 'next-i18next'
import { ThemeProvider } from 'next-themes'
import { useRouter } from 'next/router'
import { useMemo } from 'react'
import { MatchSessionProvider } from '../lib/matchSessionContext'

const nextI18NextConfig = require('../next-i18next.config')

function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  const isAuthRoute = useMemo(
    () => router.pathname === '/auth' || router.pathname.startsWith('/auth/'),
    [router.pathname],
  )

  const isPublicFullScreenRoute = useMemo(
    () => isAuthRoute || router.pathname === '/404' || router.pathname === '/privacy',
    [isAuthRoute, router.pathname],
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <MatchSessionProvider>
        {isPublicFullScreenRoute ? (
          <Component {...pageProps} />
        ) : (
          <Layout>
            <Component {...pageProps} />
          </Layout>
        )}
      </MatchSessionProvider>
    </ThemeProvider>
  )
}

export default appWithTranslation(App, nextI18NextConfig)
