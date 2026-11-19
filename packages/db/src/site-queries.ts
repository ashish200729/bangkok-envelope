import { eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { siteSnapshots } from "./schema/site";
import { type Bbox, STUDY_AREA } from "./site-area";
import type { RoadWidthSource } from "./site-normalize";
import type {
  BuildingFeature,
  BuildingsResult,
  NearestStation,
  PlotContext,
  SideRoad,
  SnapshotInfo,
} from "./site-types";

type Position = readonly [number, number];

/** A side matches a road only if the road runs within this angle of it. */
export const SIDE_MAX_ANGLE_DEG = 25;
/** …and the centreline lies within half the road's width plus this, from the side's midpoint. */
export const SIDE_EXTRA_REACH_M = 12;
/** A building counts as on the plot when at least this share of its footprint is inside. */
export const ON_PLOT_MIN_SHARE = 0.3;
/** Elevated, access-controlled roads: a plot cannot front them, so they never match a side. */
const UNMATCHED_CLASSES = ["motorway", "motorway_link"];

/** Buildings intersecting the box, nearest the box centre first, at most `limit`. */
export async function getSiteBuildings(
  db: Database,
  bbox: Bbox,
  limit: number,
): Promise<BuildingsResult> {
  const [w, s, e, n] = bbox;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const result = await db.execute<{ feature: BuildingFeature }>(sql`
    select json_build_object(
      'type', 'Feature',
      'id', osm_id,
      'geometry', ST_AsGeoJSON(geom, 7)::json,
      'properties', json_build_object(
        'id', osm_id,
        'heightM', height_m,
        'baseM', base_m,
        'heightSource', height_source,
        'name', name
      )
    ) as feature
    from site_buildings
    where ST_Intersects(geom, ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326))
    order by geom <-> ST_SetSRID(ST_MakePoint(${cx}, ${cy}), 4326)
    limit ${limit + 1}
  `);
  const features = result.rows.map((r) => r.feature);
  const truncated = features.length > limit;
  return { features: truncated ? features.slice(0, limit) : features, truncated };
}

function plotGeoJson(vertices: readonly Position[]): string {
  const ring = vertices.map(([lng, lat]) => [lng, lat]);
  ring.push([...(vertices[0] as Position)]);
  return JSON.stringify({ type: "Polygon", coordinates: [ring] });
}

/** Nearest station, the road each side faces and the buildings standing on the plot. */
export async function getPlotContext(
  db: Database,
  vertices: readonly Position[],
): Promise<PlotContext> {
  const plot = plotGeoJson(vertices);
  const plotSql = sql`ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${plot}), 4326))`;
  const sides = JSON.stringify(
    vertices.map(([ax, ay], i) => {
      const [bx, by] = vertices[(i + 1) % vertices.length] as Position;
      return { i, ax, ay, bx, by };
    }),
  );
  const unmatched = sql.join(
    UNMATCHED_CLASSES.map((c) => sql`${c}`),
    sql`, `,
  );

  const [stationRows, sideRows, buildingRows] = await Promise.all([
    db.execute<{ name: string; name_en: string | null; network: string | null; d: number }>(sql`
      with plot as (select ${plotSql} as g)
      select s.name, s.name_en, s.network, ST_Distance(s.geom::geography, plot.g::geography) as d
      from site_stations s, plot
      order by d
      limit 1
    `),
    db.execute<{
      idx: number;
      osm_id: string;
      name: string | null;
      name_en: string | null;
      class: string;
      width_m: number;
      width_source: RoadWidthSource;
      d: number;
    }>(sql`
      with raw as (
        select (s->>'i')::int as idx,
          ST_SetSRID(ST_MakePoint((s->>'ax')::float8, (s->>'ay')::float8), 4326) as a,
          ST_SetSRID(ST_MakePoint((s->>'bx')::float8, (s->>'by')::float8), 4326) as b
        from jsonb_array_elements(${sides}::jsonb) as s
      ),
      side as (
        select idx,
          ST_LineInterpolatePoint(ST_MakeLine(a, b), 0.5) as mid,
          ST_Azimuth(a::geography, b::geography) as az
        from raw
        where not ST_Equals(a, b)
      ),
      candidate as (
        select side.idx, r.osm_id, r.name, r.name_en, r.class, r.width_m, r.width_source,
          ST_Distance(seg.geom::geography, side.mid::geography) as d,
          abs(
            ST_Azimuth(ST_StartPoint(seg.geom)::geography, ST_EndPoint(seg.geom)::geography)
            - side.az
          ) as turn
        from side
        join site_roads r
          on r.geom && ST_Expand(side.mid, 0.0008)
          and r.class not in (${unmatched})
        cross join lateral ST_DumpSegments(r.geom) as seg
        where ST_DWithin(seg.geom::geography, side.mid::geography, r.width_m / 2 + ${SIDE_EXTRA_REACH_M})
          and not ST_Equals(ST_StartPoint(seg.geom), ST_EndPoint(seg.geom))
      ),
      parallel as (
        select *, turn - pi() * floor(turn / pi()) as folded from candidate
      )
      select distinct on (idx) idx, osm_id, name, name_en, class, width_m, width_source, d
      from parallel
      where least(folded, pi() - folded) <= radians(${SIDE_MAX_ANGLE_DEG})
      order by idx, d, osm_id
    `),
    db.execute<{ osm_id: string }>(sql`
      with plot as (select ${plotSql} as g)
      select b.osm_id
      from site_buildings b, plot
      where ST_Intersects(b.geom, plot.g)
        and ST_Area(ST_Intersection(b.geom, plot.g)::geography)
          >= ${ON_PLOT_MIN_SHARE} * ST_Area(b.geom::geography)
      order by b.osm_id
      limit 500
    `),
  ]);

  const station = stationRows.rows[0];
  const nearestStation: NearestStation | null = station
    ? {
        name: station.name,
        nameEn: station.name_en,
        network: station.network,
        distanceM: Math.round(Number(station.d)),
      }
    : null;

  const roadBySide = new Map<number, SideRoad>();
  for (const row of sideRows.rows) {
    roadBySide.set(Number(row.idx), {
      osmId: row.osm_id,
      name: row.name,
      nameEn: row.name_en,
      class: row.class,
      widthM: Number(row.width_m),
      widthSource: row.width_source,
      distanceM: Math.round(Number(row.d) * 10) / 10,
    });
  }

  return {
    nearestStation,
    sides: vertices.map((_, index) => ({ index, road: roadBySide.get(index) ?? null })),
    buildingsOnPlot: buildingRows.rows.map((r) => r.osm_id),
  };
}

export async function getSnapshotInfo(db: Database): Promise<SnapshotInfo | null> {
  const [row] = await db
    .select()
    .from(siteSnapshots)
    .where(eq(siteSnapshots.id, STUDY_AREA.id))
    .limit(1);
  if (!row) return null;
  return {
    source: row.source,
    attribution: row.attribution,
    license: row.license,
    licenseUrl: row.licenseUrl,
    fetchedAt: row.fetchedAt.toISOString(),
    osmBaseAt: row.osmBaseAt?.toISOString() ?? null,
    bbox: [row.west, row.south, row.east, row.north],
    counts: row.counts,
  };
}
