import { z } from "zod";

/** WGS84 position, GeoJSON order (RFC 7946): longitude first. */
export const lngLatSchema = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .readonly();

export type LngLat = z.infer<typeof lngLatSchema>;

/** Closed ring as GeoJSON writes it: the last position repeats the first. */
export type LinearRing = readonly LngLat[];

/** GeoJSON Polygon coordinates: outer ring counter-clockwise, then holes clockwise. */
export type Polygon = readonly LinearRing[];

export type MultiPolygon = readonly Polygon[];

/** Turns an open ring (engine input) into a closed GeoJSON ring. */
export function closeRing(vertices: readonly LngLat[]): LinearRing {
  const first = vertices[0];
  if (!first) return [];
  const last = vertices[vertices.length - 1];
  if (last && last[0] === first[0] && last[1] === first[1]) return vertices;
  return [...vertices, first];
}
