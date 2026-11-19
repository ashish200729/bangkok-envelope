"use client";

import { authClient } from "@envelope/auth/client";
import { ENGINE_VERSION } from "@envelope/engine";
import { Badge } from "@envelope/ui/components/badge";
import { Button } from "@envelope/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@envelope/ui/components/card";
import { Skeleton } from "@envelope/ui/components/skeleton";
import { cn } from "@envelope/ui/lib/utils";
import type { InferResponseType } from "hono/client";
import {
  DatabaseIcon,
  LayoutTemplateIcon,
  RefreshCwIcon,
  ServerIcon,
  UserIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Check<T> =
  | { state: "loading" }
  | { state: "ok"; data: T }
  | { state: "error"; message: string };

type Health = InferResponseType<typeof api.health.$get> & { roundTripMs: number };
type BackendSession = InferResponseType<typeof api.me.$get>["session"];

async function fetchHealth(): Promise<Health> {
  const started = performance.now();
  const res = await api.health.$get();
  const body = await res.json();
  return { ...body, roundTripMs: Math.round(performance.now() - started) };
}

export function StatusBoard() {
  const [health, setHealth] = useState<Check<Health>>({ state: "loading" });

  const runHealth = useCallback(async () => {
    setHealth({ state: "loading" });
    try {
      setHealth({ state: "ok", data: await fetchHealth() });
    } catch (error) {
      setHealth({
        state: "error",
        message: error instanceof Error ? error.message : "Request failed",
      });
    }
  }, []);

  useEffect(() => {
    void runHealth();
  }, [runHealth]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-medium text-muted-foreground text-sm">Layers</h2>
        <Button variant="outline" size="sm" onClick={() => void runHealth()}>
          <RefreshCwIcon /> Re-run checks
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <WebCard />
        <ApiCard health={health} />
        <DatabaseCard health={health} />
        <SessionCard />
      </div>
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: "pass" | "fail" | "warn"; children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        tone === "pass" && "border-pass/40 text-pass",
        tone === "fail" && "border-fail/40 text-fail",
        tone === "warn" && "border-warn/40 text-warn",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          tone === "pass" && "bg-pass",
          tone === "fail" && "bg-fail",
          tone === "warn" && "bg-warn",
        )}
      />
      {children}
    </Badge>
  );
}

function Facts({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="truncate text-right font-mono tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LoadingFacts() {
  return (
    <div className="grid gap-2" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function WebCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutTemplateIcon className="size-4 text-muted-foreground" /> Web app
        </CardTitle>
        <CardDescription>Next.js App Router, Tailwind, shadcn/ui</CardDescription>
        <CardAction>
          <StatusBadge tone="pass">Rendered</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Facts
          rows={[
            ["Framework", "Next.js 16 · React 19"],
            ["Rules engine", `v${ENGINE_VERSION}`],
            ["Theme", "Blueprint"],
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ApiCard({ health }: { health: Check<Health> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ServerIcon className="size-4 text-muted-foreground" /> API
        </CardTitle>
        <CardDescription>Hono, mounted at /api</CardDescription>
        <CardAction>
          {health.state === "loading" && <StatusBadge tone="warn">Checking</StatusBadge>}
          {health.state === "ok" && <StatusBadge tone="pass">Reachable</StatusBadge>}
          {health.state === "error" && <StatusBadge tone="fail">Unreachable</StatusBadge>}
        </CardAction>
      </CardHeader>
      <CardContent>
        {health.state === "loading" && <LoadingFacts />}
        {health.state === "error" && <p className="text-fail text-sm">{health.message}</p>}
        {health.state === "ok" && (
          <Facts
            rows={[
              ["Endpoint", "GET /api/health"],
              ["Round trip", `${health.data.roundTripMs} ms`],
              ["Server time", new Date(health.data.time).toLocaleTimeString()],
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

function DatabaseCard({ health }: { health: Check<Health> }) {
  const db = health.state === "ok" ? health.data.database : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseIcon className="size-4 text-muted-foreground" /> Database
        </CardTitle>
        <CardDescription>Neon Postgres + PostGIS, via Drizzle</CardDescription>
        <CardAction>
          {health.state === "loading" && <StatusBadge tone="warn">Checking</StatusBadge>}
          {db?.ok === true && <StatusBadge tone="pass">Connected</StatusBadge>}
          {(health.state === "error" || db?.ok === false) && (
            <StatusBadge tone="fail">Not connected</StatusBadge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {health.state === "loading" && <LoadingFacts />}
        {health.state === "error" && (
          <p className="text-muted-foreground text-sm">Waiting for the API.</p>
        )}
        {db?.ok === false && (
          <p className="text-fail text-sm">
            {db.error}. Check <code className="font-mono">DATABASE_URL</code> in
            apps/web/.env.local.
          </p>
        )}
        {db?.ok === true && (
          <Facts
            rows={[
              ["Postgres", db.postgres.split(" ")[0]],
              ["PostGIS", db.postgis ?? "not installed"],
              ["Query time", `${db.latencyMs} ms`],
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SessionCard() {
  const { data, isPending, refetch } = authClient.useSession();
  const [backend, setBackend] = useState<Check<BackendSession>>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const userId = data?.user.id ?? null;

  const checkBackend = useCallback(async () => {
    try {
      const res = await api.me.$get();
      const body = await res.json();
      setBackend({ state: "ok", data: body.session });
    } catch (error) {
      setBackend({
        state: "error",
        message: error instanceof Error ? error.message : "Request failed",
      });
    }
  }, []);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  async function continueAsGuest() {
    setBusy(true);
    const { error } = await authClient.signIn.anonymous();
    if (error) toast.error(error.message ?? "Could not start a guest session");
    else toast.success("Guest session started");
    await Promise.all([refetch(), checkBackend()]);
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    toast("Signed out");
    await Promise.all([refetch(), checkBackend()]);
    setBusy(false);
  }

  const backendSeesSession = backend.state === "ok" && backend.data?.userId === userId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="size-4 text-muted-foreground" /> Session
        </CardTitle>
        <CardDescription>Better Auth, guest sessions</CardDescription>
        <CardAction>
          {isPending && <StatusBadge tone="warn">Checking</StatusBadge>}
          {!isPending && userId && <StatusBadge tone="pass">Signed in</StatusBadge>}
          {!isPending && !userId && <StatusBadge tone="warn">No session</StatusBadge>}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isPending ? (
          <LoadingFacts />
        ) : (
          <Facts
            rows={[
              ["User", userId ? `${userId.slice(0, 10)}…` : "none"],
              ["Type", data ? (data.user.isAnonymous ? "Guest" : "Account") : "none"],
              ["API sees it", userId ? (backendSeesSession ? "yes" : "no") : "n/a"],
            ]}
          />
        )}
        <div className="flex gap-2">
          {userId ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </Button>
          ) : (
            <Button size="sm" disabled={busy || isPending} onClick={() => void continueAsGuest()}>
              Continue as guest
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
