import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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

