/** [west, south, east, north] in WGS 84 degrees. */
export type Bbox = readonly [number, number, number, number];

/**
 * The fixed study area: Asok, Nana, Phrom Phong and Makkasan, covering Soi Sukhumvit 1–39 north
 * of Sukhumvit Road, the Asok–Phetchaburi corridor and the BTS, MRT and Airport Rail Link stations
 * that serve it. Site data exists only inside this box.
 */
export const STUDY_AREA = {
  id: "asok",
  name: "Asok / Sukhumvit",
  bbox: [100.547, 13.728, 100.575, 13.752] as Bbox,
} as const;

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const OSM_LICENSE = "Open Database License (ODbL) 1.0";
export const OSM_LICENSE_URL = "https://www.openstreetmap.org/copyright";

/** Storey height used to turn building:levels into metres. */
export const STOREY_HEIGHT_M = 3.2;

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG_EQUATOR = 111_320;

/** Approximate area of a lng/lat box in square kilometres (equirectangular, fine at this scale). */
export function bboxAreaKm2([w, s, e, n]: Bbox): number {
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  const widthM = (e - w) * M_PER_DEG_LNG_EQUATOR * Math.cos(midLat);
  const heightM = (n - s) * M_PER_DEG_LAT;
  return (widthM * heightM) / 1e6;
}

export function bboxContainsPoint([w, s, e, n]: Bbox, lng: number, lat: number): boolean {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** The overlap of two boxes, or null when they do not overlap. */
export function intersectBbox(a: Bbox, b: Bbox): Bbox | null {
  const w = Math.max(a[0], b[0]);
  const s = Math.max(a[1], b[1]);
  const e = Math.min(a[2], b[2]);
  const n = Math.min(a[3], b[3]);
  return w < e && s < n ? [w, s, e, n] : null;
}

/** A closed GeoJSON polygon ring for a box, counter-clockwise. */
export function bboxRing([w, s, e, n]: Bbox): [number, number][] {
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}
