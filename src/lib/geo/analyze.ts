import { isObject } from "./parsing";
import { validateFeature } from "./validation";
import { emptyMeasurement, measure, mergeBounds, measurementArea } from "./measurements";
import { analyzeOverlaps } from "./spatial";
import { LIMITS, type Dataset, type ParsedDataset } from "./types";
import { analysisContext } from "./analysis-context";
import { bbox } from "@turf/turf";
import type { Bounds } from "./types";

export function analyzeDataset(parsed: ParsedDataset): Dataset {
  // Iteração limitada antes das operações topológicas mais caras.
  let positions = 0;
  const stack: unknown[] = parsed.rawFeatures.map((f) =>
    isObject(f) && isObject(f.geometry) ? f.geometry.coordinates : null,
  );
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      if (typeof value[0] === "number") positions++;
      else for (const child of value) stack.push(child);
      if (
        positions > LIMITS.coordinates ||
        stack.length > LIMITS.coordinates * 4
      )
        throw new Error("Limite de 100.000 coordenadas por camada excedido.");
    }
  }
  const analysis = analysisContext(parsed);
  const features = parsed.rawFeatures.map((f, i) => {
    const display = validateFeature(f, i, parsed.trustedCrs);
    const original = parsed.originalGeometries?.[i] || display.feature.geometry;
    const result = analysis.method === "projected" && isObject(f)
      ? validateFeature({ ...f, geometry: original }, i, parsed.trustedCrs, false)
      : display;
    result.originalGeometry = original ? structuredClone(original) : null;
    result.analysisGeometry = result.feature.geometry ? structuredClone(result.feature.geometry) : null;
    result.displayGeometry = result.analysisGeometry ? display.feature.geometry : null;
    // Legacy feature is explicitly the display feature, never the analysis input.
    result.feature.geometry = result.displayGeometry;
    if (!result.displayGeometry) {
      result.analysisGeometry = null;
      if (result !== display) result.issues.push(...display.issues);
    }
    return result;
  });
  const totals = emptyMeasurement();
  totals.coordinateCrs = analysis.crs;
  let displayBounds: Bounds | null = null;
  const issues = [...parsed.issues];
  const seen = new Map<string, number>();
  for (const result of features) {
    if (!result.feature.geometry) continue;
    // Igualdade exata da geometria; não afirma equivalência topológica.
    const key = JSON.stringify(result.analysisGeometry);
    const duplicate = seen.get(key);
    if (duplicate !== undefined)
      result.issues.push({
        severity: "alerta",
        feature: result.index,
        message: `Geometria exatamente duplicada da feature ${duplicate + 1}; atributos podem diferir.`,
      });
    else seen.set(key, result.index);
    try {
      result.measurement = measure(result.analysisGeometry!, analysis);
      displayBounds = mergeBounds(displayBounds, bbox(result.displayGeometry!) as Bounds);
      const m = result.measurement;
      totals.area += m.area;
      totals.perimeter += m.perimeter;
      totals.length += m.length;
      totals.points += m.points;
      totals.bounds = mergeBounds(totals.bounds, m.bounds);
    } catch {
      result.feature.geometry = null;
      result.analysisGeometry = null;
      result.displayGeometry = null;
      result.issues.push({
        severity: "erro",
        feature: result.index,
        message: "Falha na medição. Feature excluída dos cálculos e do mapa.",
      });
    }
  }
  const dataset: Dataset = {
    displayBounds,
    sourceProjection: parsed.sourceProjection || (parsed.trustedCrs ? "EPSG:4326" : null),
    analysis,
    displayCrs: "EPSG:4326",
    name: parsed.name,
    format: parsed.format,
    crs: parsed.crs,
    crsInfo: parsed.crsInfo,
    trustedCrs: parsed.trustedCrs,
    features,
    issues,
    totals,
    mapData: {
      type: "FeatureCollection",
      features: features.flatMap((f) =>
        f.feature.geometry
          ? [
              {
                ...f.feature,
                geometry: f.feature.geometry,
                id: f.index,
                properties: { featureIndex: f.index },
              },
            ]
          : [],
      ),
    },
    overlaps: [],
    union: null,
    occupied: null,
    spatialComplete:
      parsed.trustedCrs && features.every((f) => f.feature.geometry !== null),
  };
  try {
    Object.assign(dataset, analyzeOverlaps(features, analysis));
  } catch (error) {
    dataset.spatialComplete = false;
    issues.push({
      severity: "alerta",
      message:
        error instanceof Error && error.message.startsWith("Análise")
          ? error.message
          : "Operação espacial falhou. Sobreposições e área ocupada indisponíveis.",
    });
  }
  if (features.some((f) => !f.feature.geometry))
    issues.push({
      severity: "alerta",
      message:
        "Resultados parciais: features sem geometria utilizável foram excluídas das medições e do mapa. Comparação A × B bloqueada.",
    });
  if (analysis.method === "projected" && displayBounds && analysis.utmZone) {
    const meridian = analysis.utmZone * 6 - 183;
    if (displayBounds[0] < meridian - 3 || displayBounds[2] > meridian + 3 ||
        displayBounds[1] < -80 || displayBounds[3] > 84 ||
        (analysis.hemisphere === "S" ? displayBounds[3] > 1e-8 : displayBounds[1] < -1e-8)) {
      issues.push({ severity: "alerta", message: "Coordenadas fora da faixa nominal do fuso UTM declarado. As medições são da grade original; confira o CRS e a adequação da projeção antes de uso cadastral." });
    }
  }
  if (process.env.NODE_ENV === "development") {
    console.debug("[LSGeo analysis]", {
      source: parsed.crs, analysis: analysis.description, display: dataset.displayCrs,
      areaInAnalysisM2: totals.area,
      areaOnDisplayEllipsoidM2: features.reduce((sum, f) => sum + (f.displayGeometry ? measurementArea(f.displayGeometry) : 0), 0),
      originalCoordinatesPreserved: true,
    });
  }
  return dataset;
}
