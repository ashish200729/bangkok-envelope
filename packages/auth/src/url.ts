/**
 * The app's public origin for Better Auth, so a Vercel deployment needs no URL variable: an
 * explicit `BETTER_AUTH_URL` wins; on Vercel production it is the project's production domain,
 * on a preview the branch URL (stable across pushes) or the deployment URL; locally the dev port.
 * Every Vercel hostname of this deployment is trusted, so a preview opened on its deployment URL
 * or its branch URL can both sign in.
 */
export type UrlEnv = {
  BETTER_AUTH_URL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  VERCEL_URL?: string | undefined;
  VERCEL_BRANCH_URL?: string | undefined;
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
};

export const DEV_ORIGIN = "http://localhost:3100";

const https = (host: string | undefined) =>
  host ? `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : undefined;

const trim = (url: string) => url.replace(/\/+$/, "");

export function resolveAuthUrl(env: UrlEnv): { baseURL: string; trustedOrigins: string[] } {
  const production = https(env.VERCEL_PROJECT_PRODUCTION_URL);
  const branch = https(env.VERCEL_BRANCH_URL);
  const deployment = https(env.VERCEL_URL);
  const fromVercel = env.VERCEL_ENV === "production" ? production : (branch ?? deployment);
  const baseURL = trim(env.BETTER_AUTH_URL || fromVercel || deployment || DEV_ORIGIN);
  const trustedOrigins = [
    ...new Set([baseURL, production, branch, deployment].filter((o): o is string => !!o)),
  ];
  return { baseURL, trustedOrigins };
}
