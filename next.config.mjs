/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  outputFileTracingIncludes: { '/': ['./legacy/**', './lib/engine/overrides.js'], '/api/rpc/[fn]': ['./legacy/**', './lib/engine/overrides.js'] },
};
export default nextConfig;
