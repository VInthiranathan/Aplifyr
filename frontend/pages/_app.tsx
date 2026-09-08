import type { AppProps } from 'next/app'
import NextApp, {AppContext} from 'next/app'
import '../styles/globals.css'
import Layout from '../components/Layout'
import { appWithTranslation } from 'next-i18next'
import { ThemeProvider } from 'next-themes'
import { useRouter } from 'next/router'
import { useMemo } from 'react'
import { MatchSessionProvider } from '../lib/matchSessionContext'

const nextI18NextConfig = require('../next-i18next.config')

function App({ Component, pageProps, nonce }: AppProps & {nonce?:string}) {
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
    <ThemeProvider nonce={nonce} attribute="class" defaultTheme="dark" enableSystem={false}>
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

App.getInitialProps = async (context:AppContext) => ({
  ...(await NextApp.getInitialProps(context)),
  nonce: typeof context.ctx.req?.headers['x-csp-nonce'] === 'string' ? context.ctx.req.headers['x-csp-nonce'] : undefined,
})
export default appWithTranslation(App, nextI18NextConfig)
