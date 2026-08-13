import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ['@factory/contracts', '@factory/entitlements'],
  },
};

export default nextConfig;
