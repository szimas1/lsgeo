import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { ProjectionDefinition } from "proj4";

export interface AnalysisContext {
  crs: string;
  projection: ProjectionDefinition | string;
  method: "projected" | "ellipsoidal";
  /** Linear source unit → metres. Never applied to longitude/latitude. */
  metersPerUnit: number;
  description: string;
  utmZone?: number;
  hemisphere?: "N" | "S";
}

export type Properties = Record<string, unknown> | null;
export type GeoFeature = Feature<Geometry | null, Properties>;
export type PolygonFeature = Feature<Polygon | MultiPolygon, Properties>;
export type Bounds = [number, number, number, number];
export interface CrsInfo {
  prjName: string | null;
  wkt: string;
  label: string;
  epsg?: string;
  source: "prj" | "manual";
  transformation: string | null;
  warning: string | null;
  reason: string | null;
}
export interface Issue {
  severity: "erro" | "alerta" | "informação";
  message: string;
  feature?: number;
}
export interface Measurement {
  coordinateCrs: string;
  area: number;
  perimeter: number;
  length: number;
  points: number;
  bounds: Bounds | null;
  centroid: number[] | null;
}
export interface FeatureResult {
  originalGeometry: Geometry | null;
  analysisGeometry: Geometry | null;
  displayGeometry: Geometry | null;
  index: number;
  id: string | number;
  type: string;
  properties: Properties;
  feature: GeoFeature;
  issues: Issue[];
  measurement: Measurement | null;
}
export interface Overlap {
  a: number;
  b: number;
  area: number;
}
export interface Dataset {
  displayBounds: Bounds | null;
  sourceProjection: ProjectionDefinition | string | null;
  analysis: AnalysisContext;
  displayCrs: "EPSG:4326";
  crsInfo?: CrsInfo;
  name: string;
  format: "GeoJSON" | "Shapefile";
  crs: string;
  trustedCrs: boolean;
  features: FeatureResult[];
  mapData: FeatureCollection;
  issues: Issue[];
  totals: Measurement;
  overlaps: Overlap[];
  occupied: number | null;
  union: PolygonFeature | null;
  spatialComplete: boolean;
}
export interface ParsedDataset {
  sourceProjection?: ProjectionDefinition;
  originalGeometries?: (Geometry | null)[];
  crsInfo?: CrsInfo;
  name: string;
  format: Dataset["format"];
  crs: string;
  trustedCrs: boolean;
  rawFeatures: unknown[];
  issues: Issue[];
}
export interface Comparison {
  analysis: AnalysisContext;
  analysisIntersection: PolygonFeature | null;
  analysisOnlyA: PolygonFeature | null;
  analysisOnlyB: PolygonFeature | null;
  intersects: boolean;
  areaA: number;
  areaB: number;
  intersectionArea: number;
  differenceA: number;
  differenceB: number;
  percentA: number;
  percentB: number;
  intersection: PolygonFeature | null;
  onlyA: PolygonFeature | null;
  onlyB: PolygonFeature | null;
}
export const LIMITS = {
  bytes: 20 * 1024 * 1024,
  expanded: 60 * 1024 * 1024,
  features: 5000,
  coordinates: 100000,
  polygonVertices: 3000,
  spatialPolygons: 150,
  spatialVertices: 15000,
};
