import type { AppType } from "@envelope/api";
import { hc } from "hono/client";

/** Typed client for the Hono API mounted at /api. Same origin, cookies included. */
export const api = hc<AppType>("/", { init: { credentials: "include" } }).api;
