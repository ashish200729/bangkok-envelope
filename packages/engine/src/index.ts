/**
 * Zoning rules engine. Pure TypeScript with no framework or I/O imports, so the
 * browser (live updates) and the server (saved projects, reports) run the same code.
 */

export const ENGINE_VERSION = "0.0.0";

/** Longitude, latitude in WGS84 degrees. */
export type LngLat = readonly [lng: number, lat: number];

/** Closed ring: first and last positions are equal. */
export type Ring = readonly LngLat[];
