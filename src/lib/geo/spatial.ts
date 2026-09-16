import {
  booleanIntersects,
  coordAll,
  difference,
  featureCollection,
  intersect,
  union,
} from "@turf/turf";
import {
  LIMITS,
  type Comparison,
  type Dataset,
  type FeatureResult,
  type Overlap,
  type PolygonFeature,
  type AnalysisContext,
} from "./types";
import { GEOGRAPHIC_ANALYSIS, measurementArea } from "./measurements";
import { transformGeometry } from "./analysis-context";

export function polygonFeatures(
  features: FeatureResult[],
): { index: number; feature: PolygonFeature }[] {
  return features
    .filter(
      (f) =>
        f.analysisGeometry?.type === "Polygon" ||
        f.analysisGeometry?.type === "MultiPolygon",
    )
    .map((f) => ({ index: f.index, feature: { ...f.feature, geometry: f.analysisGeometry } as PolygonFeature }));
}
export function analyzeOverlaps(features: FeatureResult[], context = GEOGRAPHIC_ANALYSIS) {
  const polygons = polygonFeatures(features);
  if (
    polygons.length > LIMITS.spatialPolygons ||
    polygons.reduce((n, p) => n + coordAll(p.feature).length, 0) >
      LIMITS.spatialVertices
  ) {
    throw new Error(
      "Análise de sobreposições limitada a 150 polígonos e 15.000 vértices válidos por camada.",
    );
  }
  const overlaps: Overlap[] = [];
  for (let i = 0; i < polygons.length; i++)
    for (let j = i + 1; j < polygons.length; j++) {
      const a = polygons[i],
        b = polygons[j];
      if (booleanIntersects(a.feature, b.feature)) {
        const intersection = intersect(
          featureCollection([a.feature, b.feature]),
        );
        overlaps.push({
          a: a.index,
          b: b.index,
          area: intersection ? measurementArea(intersection.geometry, context) : 0,
        });
      }
    }
  const merged =
    polygons.length > 1
      ? union(featureCollection(polygons.map((p) => p.feature)))
      : polygons[0]?.feature || null;
  return { overlaps, union: merged, occupied: merged ? measurementArea(merged.geometry, context) : 0 };
}

export function compareDatasets(a: Dataset, b: Dataset): Comparison {
  if (
    !a.trustedCrs ||
    !b.trustedCrs ||
    !a.spatialComplete ||
    !b.spatialComplete
  )
    throw new Error(
      "Comparação bloqueada: resolva o CRS, as geometrias excluídas ou os limites de análise nas duas camadas.",
    );
  if (!a.union || !b.union)
    throw new Error(
      "A comparação exige pelo menos um polígono válido em cada camada.",
    );
  // Turf intersect/difference/union are planar polyclip-ts wrappers: they do
  // not reproject or measure. Feed a common coordinate domain, never mixed
  // grids. For geographic GeoJSON the clipping domain follows its straight
  // longitude/latitude segments; measurements use ellipsoidal geodesic edges.
  const analysis = a.analysis.method === "projected" ? a.analysis : b.analysis;
  const inputA = inContext(a, analysis), inputB = inContext(b, analysis);
  const area = (p: PolygonFeature) => measurementArea(p.geometry, analysis);
  const collection = featureCollection([inputA, inputB]);
  const intersection = intersect(collection);
  const onlyA = difference(collection);
  const onlyB = difference(featureCollection([inputB, inputA]));
  const areaA = area(inputA),
    areaB = area(inputB),
    intersectionArea = intersection ? area(intersection) : 0;
  return {
    analysis,
    analysisIntersection: intersection,
    analysisOnlyA: onlyA,
    analysisOnlyB: onlyB,
    intersects: booleanIntersects(inputA, inputB),
    areaA,
    areaB,
    intersectionArea,
    differenceA: onlyA ? area(onlyA) : 0,
    differenceB: onlyB ? area(onlyB) : 0,
    percentA: areaA ? (intersectionArea / areaA) * 100 : 0,
    percentB: areaB ? (intersectionArea / areaB) * 100 : 0,
    intersection: forDisplay(intersection, analysis),
    onlyA: forDisplay(onlyA, analysis),
    onlyB: forDisplay(onlyB, analysis),
  };
}

function sameContext(a: AnalysisContext, b: AnalysisContext) {
  if (JSON.stringify(a.projection) === JSON.stringify(b.projection)) return true;
  // EPSG labels were assigned only after parameter/ellipsoid validation.
  return a.crs.startsWith("EPSG:") && a.crs === b.crs &&
    typeof a.projection === "object" && typeof b.projection === "object" &&
    JSON.stringify(a.projection.datum_params) === JSON.stringify(b.projection.datum_params);
}

function inContext(dataset: Dataset, target: AnalysisContext): PolygonFeature {
  if (sameContext(dataset.analysis, target)) return dataset.union!;
  if (target.method === "projected") {
    const bounds = dataset.displayBounds;
    const meridian = target.utmZone ? target.utmZone * 6 - 183 : NaN;
    if (!bounds || !Number.isFinite(meridian) || bounds[0] < meridian - 3 || bounds[2] > meridian + 3 || bounds[1] < -80 || bounds[3] > 84 || (target.hemisphere === "S" ? bounds[3] > 0 : bounds[1] < 0))
      throw new Error("Comparação bloqueada: a extensão da outra camada ultrapassa o fuso UTM de análise. Defina um CRS comum apropriado em um SIG e reimporte.");
  }
  return { ...dataset.union!, geometry: transformGeometry(
    dataset.union!.geometry, dataset.analysis.projection, target.projection,
    target.method === "projected" ? 0.001 : 1e-8,
  ) as PolygonFeature["geometry"] };
}

function forDisplay(feature: PolygonFeature | null, context: AnalysisContext): PolygonFeature | null {
  if (!feature) return null;
  return { ...feature, geometry: context.method === "projected"
    ? transformGeometry(feature.geometry, context.projection, "EPSG:4326") as PolygonFeature["geometry"]
    : structuredClone(feature.geometry) };
}
