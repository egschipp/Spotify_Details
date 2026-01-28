/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensures additional React warnings in dev to catch side-effects.
  reactStrictMode: true,
  // Remove the `X-Powered-By` header for a smaller security surface.
  poweredByHeader: false
};

module.exports = nextConfig;
