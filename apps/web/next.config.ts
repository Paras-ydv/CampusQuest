import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The contract package ships raw TypeScript, so Next compiles it with the app.
  transpilePackages: ["@campusquest/shared"],
  reactStrictMode: true,
  allowedDevOrigins: ["pursuit-alienable-cope.ngrok-free.dev"],
};

export default nextConfig;
