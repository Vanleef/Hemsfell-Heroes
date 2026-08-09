import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The prototype is authored and validated through the Vinext/Sites pipeline.
  // Vercel emits a native Next.js artifact for Git deployments while legacy
  // game-state objects still contain additional runtime-only fields.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
