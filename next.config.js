/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // worker/index.js is merged into the generated sw.js for push event handling
  customWorkerDir: 'worker',
})

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  transpilePackages: [
    '@supabase/ssr',
    '@supabase/supabase-js',
    '@supabase/functions-js',
    '@supabase/auth-js',
    '@supabase/realtime-js',
    '@supabase/storage-js',
    '@supabase/postgrest-js',
  ],
}

module.exports = withPWA(nextConfig)
