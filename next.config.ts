import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const immutableAssetHeaders = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

const stableAssetHeaders = [
  { key: "Cache-Control", value: "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Generated card art lives under a versioned directory and can therefore
      // be cached permanently by browsers/CDNs without serving stale artwork.
      { source: "/cards/generated/:path*", headers: immutableAssetHeaders },
      // Human-authored assets keep a short browser TTL but a long CDN lifetime;
      // a new deployment can refresh the edge object without forcing clients to
      // redownload the same hero/card-back on every visit.
      { source: "/heroes/:path*", headers: stableAssetHeaders },
      { source: "/brand/:path*", headers: stableAssetHeaders },
      { source: "/cards/card-back-hemsfell.webp", headers: stableAssetHeaders },
    ];
  },
  // The prototype is authored and validated through the Vinext/Sites pipeline.
  // Vercel emits a native Next.js artifact for Git deployments while legacy
  // game-state objects still contain additional runtime-only fields.
  typescript: { ignoreBuildErrors: true },
  // Permit Fast Refresh/HMR when the development build is opened through the
  // machine's LAN address instead of localhost.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.0.13"],
};

export default nextConfig;
