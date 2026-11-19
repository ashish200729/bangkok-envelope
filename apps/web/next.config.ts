import type { NextConfig } from "next";
import "./src/env";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: [
    "@envelope/api",
    "@envelope/auth",
    "@envelope/db",
    "@envelope/engine",
    "@envelope/ui",
  ],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
};

export default nextConfig;
