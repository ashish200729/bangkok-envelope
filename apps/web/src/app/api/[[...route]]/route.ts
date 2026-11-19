import { app } from "@envelope/api";
import { handle } from "hono/vercel";

const handler = handle(app);

// The API has only GET and POST routes; other methods get Next's 405 without reaching Hono.
export const GET = handler;
export const POST = handler;
