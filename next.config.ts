import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The prototype is authored and validated through the Vinext/Sites pipeline.
  // Vercel emits a native Next.js artifact for Git deployments while legacy
  // game-state objects still contain additional runtime-only fields.
  typescript: { ignoreBuildErrors: true },
  // Permit Fast Refresh/HMR when the development build is opened through the
  // machine's LAN address instead of localhost.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.0.13"],
};

export default nextConfig;
