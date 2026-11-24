const localTestProxy = process.env.LIBROYA_LOCAL_TEST_PROXY === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.LIBROYA_TEST_DIST_DIR || '.next',
  async rewrites() {
    if (!localTestProxy) return [];
    return [{ source: '/backend/:path*', destination: 'http://127.0.0.1:4000/:path*' }];
  }
};

export default nextConfig;
