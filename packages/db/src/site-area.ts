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
