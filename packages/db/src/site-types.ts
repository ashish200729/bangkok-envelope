import type { Bbox } from "./site-area";
import type { HeightSource, RoadWidthSource } from "./site-normalize";

type Position = [number, number];

export type BuildingFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "MultiPolygon"; coordinates: Position[][][] };
  properties: {
    id: string;
    heightM: number;
    baseM: number;
    heightSource: HeightSource;
    name: string | null;
  };
};

export type BuildingsResult = { features: BuildingFeature[]; truncated: boolean };

export type NearestStation = {
  name: string;
  nameEn: string | null;
  network: string | null;
  /** From the plot outline to the station point, in metres on the ellipsoid. */
  distanceM: number;
};

export type SideRoad = {
  osmId: string;
  name: string | null;
  nameEn: string | null;
  class: string;
  widthM: number;
  widthSource: RoadWidthSource;
  /** From the side's midpoint to the road centreline, in metres. */
  distanceM: number;
};

export type PlotContext = {
  nearestStation: NearestStation | null;
  /** One entry per plot side, side i running from vertex i to vertex i + 1. */
  sides: { index: number; road: SideRoad | null }[];
  /** OSM ids of buildings standing mostly on the plot. */
  buildingsOnPlot: string[];
};

export type SnapshotInfo = {
  source: string;
  attribution: string;
  license: string;
  licenseUrl: string;
  fetchedAt: string;
  osmBaseAt: string | null;
  bbox: Bbox;
  counts: { buildings: number; roads: number; stations: number };
};
