/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Explicitly versioned public artwork only. Never cache private uploads
        // or API/user-specific responses using this policy.
        source: '/feature/game-banners/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/onboarding/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

export default nextConfig;
