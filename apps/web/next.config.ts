import type { NextConfig } from "next";
import "./src/env";

const isDev = process.env.NODE_ENV === "development";

/** MapLibre's style, vector tiles, glyphs and sprites all come from here. */
const TILES = "https://tiles.openfreemap.org";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next inlines its bootstrap scripts; React refresh needs eval in development only.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${TILES}`,
  "font-src 'self' data:",
  `connect-src 'self' ${TILES}`,
  // MapLibre and deck.gl start their workers from blob: URLs.
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
