import { bbox, centroid } from "@turf/turf";
import { Geodesic } from "geographiclib-geodesic";
import type { Geometry, Position } from "geojson";
import type { AnalysisContext, Bounds, Measurement } from "./types";

export const GEOGRAPHIC_ANALYSIS: AnalysisContext = {
  crs: "EPSG:4326", projection: "EPSG:4326", method: "ellipsoidal",
  metersPerUnit: 1,
  description: "Elipsoide WGS84 · GeographicLib (área e distâncias geodésicas, 2D)",
};

/** Shoelace translated to a local origin, with compensated summation. This
 * avoids subtracting products of large UTM northings. Rings are unsigned;
 * polygon semantics (outer minus holes) do not depend on winding order.
 * Output is in squared coordinate units, NOT metres for geographic input. */
export function planarRingArea(ring: Position[]): number {
  const [x, y] = ring[0];
  let sum = 0, correction = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const term = (a[0] - x) * (b[1] - y) - (b[0] - x) * (a[1] - y);
    const adjusted = term - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return Math.abs(sum) / 2;
}

function pathLength(points: Position[], context: AnalysisContext): number {
  let result = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    result += context.method === "projected"
      ? Math.hypot(b[0] - a[0], b[1] - a[1]) * context.metersPerUnit
      : Geodesic.WGS84.Inverse(a[1], a[0], b[1], b[0]).s12!;
  }
  return result;
}

export function measurementArea(geometry: Geometry, context = GEOGRAPHIC_ANALYSIS): number {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return 0;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const rings of polygons) {
    for (const [i, ring] of rings.entries()) {
      let value: number;
      if (context.method === "projected") {
        value = planarRingArea(ring) * context.metersPerUnit ** 2;
      } else {
        const accumulator = Geodesic.WGS84.Polygon(false);
        for (const p of ring) accumulator.AddPoint(p[1], p[0]);
        value = Math.abs(accumulator.Compute(false, true).area!);
      }
      total += (i === 0 ? 1 : -1) * value;
    }
  }
  if (!Number.isFinite(total) || total < 0) throw new Error("Área inválida.");
  return total;
}

export function emptyMeasurement(): Measurement {
  return {
    coordinateCrs: "EPSG:4326",
    area: 0,
    perimeter: 0,
    length: 0,
    points: 0,
    bounds: null,
    centroid: null,
  };
}
export function measure(geometry: Geometry, context = GEOGRAPHIC_ANALYSIS): Measurement {
  const result = emptyMeasurement();
  result.coordinateCrs = context.crs;
  result.bounds = bbox(geometry) as Bounds;
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    result.area = measurementArea(geometry, context);
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    for (const rings of polygons)
      for (const ring of rings)
        result.perimeter += pathLength(ring, context);
    result.centroid = centroid(geometry).geometry.coordinates;
  } else if (
    geometry.type === "LineString" ||
    geometry.type === "MultiLineString"
  ) {
    const paths = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
    result.length = paths.reduce((sum, points) => sum + pathLength(points, context), 0);
  } else if (geometry.type === "Point") result.points = 1;
  else if (geometry.type === "MultiPoint")
    result.points = geometry.coordinates.length;
  if (
    ![result.area, result.perimeter, result.length, ...result.bounds].every(
      Number.isFinite,
    )
  )
    throw new Error("Medição não finita.");
  return result;
}
export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}
