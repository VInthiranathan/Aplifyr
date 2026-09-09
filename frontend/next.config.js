const { i18n } = require('./next-i18next.config')

function ensureProtocol(url) {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://${url}`
}

const configuredBackendUrl =
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || ''

const backendBaseUrl = ensureProtocol(
  configuredBackendUrl || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000'),
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
    ] }];
  },
  i18n,
  turbopack: {
    root: __dirname,
  },
  // next-i18next loads its Pages Router config and locale files from disk at runtime.
  // Its dynamic config require cannot be discovered reliably by output file tracing in
  // serverless/monorepo deployments, so explicitly keep these small runtime assets in
  // every server trace. This prevents Vercel functions from starting without the config
  // or translations even though the build itself succeeded.
  outputFileTracingIncludes: {
    '/*': [
      './next-i18next.config.js',
      './public/locales/**/*.json',
    ],
  },
  async rewrites() {
    if (!backendBaseUrl) return []

    return [
      {
        source: '/api/:path*',
        destination: `${backendBaseUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
