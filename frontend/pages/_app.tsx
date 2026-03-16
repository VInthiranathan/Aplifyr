import type { AppProps } from 'next/app'
import '../styles/globals.css'
import Layout from '../components/Layout'
import { appWithTranslation } from 'next-i18next'
import { ThemeProvider } from 'next-themes'
import { useRouter } from 'next/router'
import { useMemo } from 'react'

const nextI18NextConfig = require('../next-i18next.config')

function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  const isAuthRoute = useMemo(
    () => router.pathname === '/auth' || router.pathname.startsWith('/auth/'),
    [router.pathname],
  )

  const isPublicFullScreenRoute = useMemo(
    () => isAuthRoute || router.pathname === '/404',
    [isAuthRoute, router.pathname],
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {isPublicFullScreenRoute ? (
        <Component {...pageProps} />
      ) : (
        <Layout>
          <Component {...pageProps} />
        </Layout>
      )}
    </ThemeProvider>
  )
}

export default appWithTranslation(App, nextI18NextConfig)
