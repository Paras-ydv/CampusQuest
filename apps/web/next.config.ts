import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

/**
 * Next loads `.env` from the app directory only, but this is a workspace and
 * the single source of truth is the `.env` at the repo root — two levels up.
 * Without this the app silently runs with no Supabase and no Databricks
 * configuration and quietly falls back to mock data.
 *
 * `loadEnvConfig` is Next's own loader, so precedence rules (`.env.local` over
 * `.env`, real process env winning over both) stay identical to a
 * single-package app. It must run before the config is exported so the values
 * are present when Next inlines `NEXT_PUBLIC_*` into the client bundle.
 *
 * The fourth argument is `forceReload`. Next has already loaded and cached the
 * app-directory env by the time this config is evaluated, and without it the
 * call returns that cache and silently does nothing.
 */
loadEnvConfig(join(process.cwd(), "..", ".."), process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  // The contract package ships raw TypeScript, so Next compiles it with the app.
  transpilePackages: ["@campusquest/shared"],
  reactStrictMode: true,
  allowedDevOrigins: ["pursuit-alienable-cope.ngrok-free.dev"],
};

export default nextConfig;
