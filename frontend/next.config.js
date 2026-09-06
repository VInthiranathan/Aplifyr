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
  i18n,
  turbopack: {
    root: __dirname,
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
