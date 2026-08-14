/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Disable Turbopack's filesystem dev cache (enabled by default since Next 16.1).
    // When the process is killed mid-session, the on-disk HMR state can become
    // corrupt, causing Turbopack to panic with "Next.js package not found" on
    // every subsequent restart. Disabling the cache forces a clean slate each
    // time and eliminates the panic.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
