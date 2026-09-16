import {
  booleanValid,
  booleanWithin,
  intersect,
  featureCollection,
  kinks,
  polygon,
} from "@turf/turf";
import type { Geometry, Position } from "geojson";
import { isObject } from "./parsing";
import { LIMITS, type FeatureResult, type Issue } from "./types";
import { planarRingArea } from "./measurements";

export function validateFeature(
  raw: unknown,
  index: number,
  trustedCrs: boolean,
  geographic = true,
): FeatureResult {
  const issues: Issue[] = [];
  const report = (message: string, severity: Issue["severity"] = "erro") => {
    if (!issues.some((i) => i.message === message))
      issues.push({ severity, message, feature: index });
  };
  const object = isObject(raw) ? raw : {};
  const properties = isObject(object.properties) ? object.properties : null;
  const id =
    typeof object.id === "string" || typeof object.id === "number"
      ? object.id
      : index + 1;
  const candidate = object.geometry;
  const type =
    isObject(candidate) && typeof candidate.type === "string"
      ? candidate.type
      : "Sem geometria";
  const result: FeatureResult = {
    originalGeometry: null,
    analysisGeometry: null,
    displayGeometry: null,
    index,
    id,
    type,
    properties,
    feature: { type: "Feature", id, properties, geometry: null },
    issues,
    measurement: null,
  };
  if (object.type !== "Feature") {
    report("Item não é um objeto Feature.");
    return result;
  }
  if (
    object.properties !== undefined &&
    object.properties !== null &&
    !isObject(object.properties)
  )
    report("Propriedades devem ser objeto ou null.", "alerta");
  if (candidate === null || candidate === undefined) {
    report("Geometria ausente ou null.", "alerta");
    return result;
  }
  if (!isObject(candidate)) {
    report("Geometria inválida.");
    return result;
  }
  if (
    ![
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon",
    ].includes(type)
  ) {
    report(`Tipo de geometria não suportado: ${type}.`, "alerta");
    return result;
  }
  let vertices = 0;
  function position(value: unknown): value is Position {
    vertices++;
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      !value.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      report(
        "Coordenadas ausentes ou inválidas: use posições com números finitos.",
      );
      return false;
    }
    if (trustedCrs && geographic && (Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90))
      report("Coordenadas fora da faixa WGS84 (±180°, ±90°).");
    if (trustedCrs && geographic && Math.abs(value[1]) > 85.051129)
      report(
        "Latitude fora da cobertura Web Mercator; geometria excluída do processamento nesta versão.",
      );
    if (value.length > 2)
      report(
        "Medições em 2D; altitude e medidas adicionais são ignoradas.",
        "informação",
      );
    return true;
  }
  function sequence(value: unknown, ring: boolean): boolean {
    if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) {
      report(
        ring
          ? "Anel com menos de quatro posições."
          : "Linha com menos de duas posições.",
      );
      return false;
    }
    const valid = value.map(position).every(Boolean);
    if (!valid) return false;
    const points = value as Position[];
    if (ring && JSON.stringify(points[0]) !== JSON.stringify(points.at(-1)))
      report("Polygon não fechado: a última posição deve repetir a primeira.");
    if (new Set(points.map((p) => `${p[0]},${p[1]}`)).size < (ring ? 3 : 2))
      report("Geometria degenerada: posições distintas insuficientes.");
    for (let i = 1; i < points.length; i++) {
      if (trustedCrs && geographic && Math.abs(points[i][0] - points[i - 1][0]) > 180)
        report("Geometria cruza o antimeridiano; divida-a antes de analisar.");
    }
    return true;
  }
  function list(
    value: unknown,
    validate: (value: unknown) => boolean,
  ): boolean {
    if (!Array.isArray(value) || !value.length) {
      report("Geometria vazia ou coordenadas ausentes.");
      return false;
    }
    return value.map(validate).every(Boolean);
  }
  const coordinates = candidate.coordinates;
  const ring = (v: unknown) => sequence(v, true);
  const line = (v: unknown) => sequence(v, false);
  const poly = (v: unknown) => list(v, ring);
  const validators: Record<string, (v: unknown) => boolean> = {
    Point: position,
    MultiPoint: (v) => list(v, position),
    LineString: line,
    MultiLineString: (v) => list(v, line),
    Polygon: poly,
    MultiPolygon: (v) => list(v, poly),
  };
  const valid = validators[type](coordinates);
  if (!valid || issues.some((i) => i.severity === "erro")) return result;
  if (!trustedCrs) {
    report("CRS desconhecido: geometria não medida nem exibida.");
    return result;
  }
  // A estrutura e todas as posições foram verificadas acima.
  const geometry = { type, coordinates } as Geometry;
  if (
    (type === "Polygon" || type === "MultiPolygon") &&
    vertices > LIMITS.polygonVertices
  ) {
    report(
      "Polígono excede 3.000 vértices: validação topológica exige processamento externo.",
    );
    return result;
  }
  try {
    if (!booleanValid(geometry))
      report("Possível problema de validade geométrica detectado pelo Turf.");
    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
      if (kinks(geometry).features.length)
        report("Autointerseção ou cruzamento entre anéis detectado.");
      const polygons =
        geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.coordinates;
      for (const rings of polygons) {
        if (rings.some((r) => planarRingArea(r) === 0))
          report("Anel degenerado com área nula.");
        for (let i = 1; i < rings.length; i++) {
          if (!booleanWithin(polygon([rings[i]]), polygon([rings[0]])))
            report("Buraco fora do anel externo.");
          for (let j = 1; j < i; j++) {
            if (
              intersect(
                featureCollection([polygon([rings[i]]), polygon([rings[j]])]),
              )
            )
              report("Buracos sobrepostos.");
          }
        }
      }
      for (let i = 0; i < polygons.length; i++)
        for (let j = 0; j < i; j++) {
          if (
            intersect(
              featureCollection([polygon(polygons[i]), polygon(polygons[j])]),
            )
          )
            report("Partes do MultiPolygon sobrepostas.");
        }
    }
  } catch {
    report("Não foi possível verificar a validade da geometria com segurança.");
  }
  if (!issues.some((i) => i.severity === "erro"))
    result.feature.geometry = geometry;
  return result;
}
