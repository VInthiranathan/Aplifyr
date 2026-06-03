const { i18n } = require('./next-i18next.config')

function ensureProtocol(url) {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://${url}`
}

const backendBaseUrl = ensureProtocol(
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '',
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  i18n,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendBaseUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
