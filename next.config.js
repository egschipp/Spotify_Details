/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const appVersion = require("./package.json").version;
const nextConfig = {
  // Ensures additional React warnings in dev to catch side-effects.
  reactStrictMode: true,
  // Remove the `X-Powered-By` header for a smaller security surface.
  poweredByHeader: false,
  output: "standalone",
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_APP_VERSION: appVersion
  }
};

module.exports = nextConfig;
