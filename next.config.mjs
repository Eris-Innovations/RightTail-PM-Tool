// Next.js config.
//
// Most of the project's behaviour is configured by file conventions
// (app/, middleware.js, postcss.config.mjs). We only declare a couple
// of opt-ins here.
//
//   - serverComponentsExternalPackages keeps the `postgres` driver out
//     of the Server Components bundle. Without it Next tries to bundle
//     the package and trips over its dynamic requires.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["postgres"],
  },
};

export default nextConfig;
