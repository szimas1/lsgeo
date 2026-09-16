import proj4 from "proj4";
import { coordEach } from "@turf/turf";
import type { Geometry } from "geojson";
import { GEOGRAPHIC_ANALYSIS } from "./measurements";
import type { AnalysisContext, ParsedDataset } from "./types";

/** Only parameter-identified UTM is automatically adopted as a cadastral
 * grid. Web Mercator, for example, must not become a metric measurement CRS
 * just because its units are metres. Other sources use the ellipsoid. */
export function analysisContext(parsed: ParsedDataset): AnalysisContext {
  const definition = parsed.sourceProjection;
  const p = definition ? new proj4.Proj(definition) as unknown as Record<string, unknown> : {};
  const longitude = typeof p.long0 === "number" ? p.long0 * 180 / Math.PI : NaN;
  const zone = Math.round((longitude + 183) / 6);
  const near = (value: unknown, reference: number) => typeof value === "number" && Math.abs(value - reference) < 1e-8;
  // Never choose the measurement policy from a title: parameter inspection
  // also prevents a mislabeled Mercator/feet WKT from becoming a UTM grid.
  if (definition &&
      ["utm", "transversemercator", "tmerc", "etmerc"].includes((definition.projName || "").toLowerCase().replace(/[^a-z]/g, "")) &&
      zone >= 1 && zone <= 60 && near(longitude, zone * 6 - 183) &&
      near(p.lat0, 0) && near(p.k0, 0.9996) && near(p.x0, 500000) &&
      (near(p.y0, 10000000) || near(p.y0, 0)) && near(definition.to_meter ?? 1, 1) &&
      near(definition.from_greenwich ?? 0, 0)) {
    return {
      crs: parsed.crsInfo?.epsg || parsed.crs,
      projection: structuredClone(definition),
      method: "projected", metersPerUnit: 1,
      utmZone: zone, hemisphere: near(p.y0, 0) ? "N" : "S",
      description: `${parsed.crs} · plano da projeção, 2D (m / m²)`,
    };
  }
  return { ...GEOGRAPHIC_ANALYSIS };
}

/** Transform a copy; never round-trip an original UTM geometry for analysis.
 * Cross-CRS operations approximate transformed straight segments adaptively
 * (1 mm in target grid; 1e-8 degrees in geographic coordinates). This is a
 * curve approximation tolerance, NOT a claim about datum/source accuracy. */
export function transformGeometry(
  geometry: Geometry,
  source: AnalysisContext["projection"],
  target: AnalysisContext["projection"],
  tolerance?: number,
): Geometry {
  const converter = proj4(new proj4.Proj(source), new proj4.Proj(target));
  const convert = (p: number[]) => {
    const xy = converter.forward([p[0], p[1]]);
    if (!xy.every(Number.isFinite)) throw new Error("Transformação produziu coordenadas inválidas.");
    return [...xy, ...p.slice(2)];
  };
  const copy = structuredClone(geometry);
  const seen = new WeakSet<number[]>();
  const transformPosition = (p: number[]) => {
    if (seen.has(p)) return;
    seen.add(p);
    const q = convert(p); p[0] = q[0]; p[1] = q[1];
  };
  if (!tolerance) {
    coordEach(copy, transformPosition);
    return copy;
  }
  let vertices = 0;
  function path(points: number[][]): number[][] {
    const output = [convert(points[0])];
    function edge(a: number[], b: number[], pa: number[], pb: number[], depth: number) {
      const middle = a.map((v, i) => (v + b[i]) / 2);
      const pm = convert(middle);
      // Test quarter points too: midpoint alone misses inflection curves.
      const error = Math.max(...[0.25, 0.5, 0.75].map(t => {
        const p = t === 0.5 ? pm : convert(a.map((v, i) => v + t * (b[i] - v)));
        return Math.hypot(p[0] - (pa[0] + t * (pb[0] - pa[0])), p[1] - (pa[1] + t * (pb[1] - pa[1])));
      }));
      if (error > tolerance!) {
        if (depth >= 20) throw new Error("Transformação excede a tolerância de aproximação das bordas.");
        edge(a, middle, pa, pm, depth + 1);
        edge(middle, b, pm, pb, depth + 1);
      } else {
        if (++vertices > 15000) throw new Error("Transformação excede 15.000 vértices; reprojete e valide em um SIG externo.");
        output.push(pb);
      }
    }
    for (let i = 1; i < points.length; i++) edge(points[i - 1], points[i], convert(points[i - 1]), convert(points[i]), 0);
    return output;
  }
  switch (copy.type) {
    case "LineString": copy.coordinates = path(copy.coordinates); break;
    case "Polygon": case "MultiLineString": copy.coordinates = copy.coordinates.map(path); break;
    case "MultiPolygon": copy.coordinates = copy.coordinates.map(p => p.map(path)); break;
    default: coordEach(copy, transformPosition);
  }
  return copy;
}
