import { describe, expect, it } from "vitest";
import { DEV_ORIGIN, resolveAuthUrl } from "./url";

describe("resolveAuthUrl", () => {
  it("uses the dev port when nothing is set", () => {
    expect(resolveAuthUrl({})).toEqual({ baseURL: DEV_ORIGIN, trustedOrigins: [DEV_ORIGIN] });
  });

  it("prefers an explicit BETTER_AUTH_URL, without a trailing slash", () => {
    const r = resolveAuthUrl({
      BETTER_AUTH_URL: "https://plots.example.com/",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "envelope.vercel.app",
    });
    expect(r.baseURL).toBe("https://plots.example.com");
    expect(r.trustedOrigins).toContain("https://envelope.vercel.app");
  });

  it("uses the production domain on Vercel production", () => {
    const r = resolveAuthUrl({
      VERCEL_ENV: "production",
      VERCEL_URL: "envelope-abc123.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "envelope.vercel.app",
    });
    expect(r.baseURL).toBe("https://envelope.vercel.app");
    expect(r.trustedOrigins).toEqual([
      "https://envelope.vercel.app",
      "https://envelope-abc123.vercel.app",
    ]);
  });

  it("uses the branch URL on a preview and trusts the deployment URL too", () => {
    const r = resolveAuthUrl({
      VERCEL_ENV: "preview",
      VERCEL_URL: "envelope-abc123.vercel.app",
      VERCEL_BRANCH_URL: "envelope-git-feat-x.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "envelope.vercel.app",
    });
    expect(r.baseURL).toBe("https://envelope-git-feat-x.vercel.app");
    expect(r.trustedOrigins).toContain("https://envelope-abc123.vercel.app");
  });
});
