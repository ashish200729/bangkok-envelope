import { config } from "zod";

/**
 * Zod 4 probes for eval with `Function("")` when it builds its first object schema, to decide
 * whether to compile fast parsers. Our CSP forbids eval, so the probe fails (harmlessly) but logs a CSP
 * violation. Telling Zod up front that eval is off skips the probe; parsing is unchanged.
 * Imported first by `instrumentation-client.ts` (main thread) and `handle.ts` (the worker), ahead
 * of the engine, whose schemas run the probe when they are built.
 */
config({ jitless: true });
