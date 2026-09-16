// Run with: npx tsx scripts/audit-measurements.mjs
// Synthetic analytical controls, NOT the user's unavailable Shapefiles.
import { readFileSync } from "node:fs";
import { area, feature, featureCollection, intersect } from "@turf/turf";
import { resolveCrs } from "../src/lib/geo/crs.ts";
import { analysisContext, transformGeometry } from "../src/lib/geo/analysis-context.ts";
import { measurementArea } from "../src/lib/geo/measurements.ts";

const wkt = readFileSync(new URL("../tests/fixtures/crs/31981-esriwkt.prj", import.meta.url), "utf8");
const resolved = resolveCrs(wkt, "controle.prj");
const context = analysisContext({ sourceProjection: resolved.projection, crsInfo: resolved.info, crs: "SIRGAS 2000 / UTM zone 21S — EPSG:31981" });
const polygon = points => feature({ type: "Polygon", coordinates: [[...points, points[0]]] });
const rows = [];
for (const n of [8300000, 6700000]) {
  const e = 650000;
  const a = polygon([[e,n],[e+1000,n],[e,n+1000]]);
  const b = polygon([[e+250,n+100],[e+1250,n+100],[e+1250,n+1100],[e+250,n+1100]]);
  const native = intersect(featureCollection([a,b]));
  const display = f => feature(transformGeometry(f.geometry,context.projection,"EPSG:4326"));
  const displayResult = display(native);
  const oldClip = intersect(featureCollection([display(a),display(b)]));
  const restored = f => transformGeometry(f.geometry,"EPSG:4326",context.projection);
  rows.push({
    northing: n,
    analyticalGridM2: 650*650/2,
    nativeIntersectionGridM2: measurementArea(native.geometry,context),
    roundTripGridM2: measurementArea(restored(displayResult),context),
    angularClipBackToGridM2: measurementArea(restored(oldClip),context),
    nativeClipEllipsoidM2: measurementArea(displayResult.geometry),
    nativeClipSphereM2: area(displayResult),
    oldPipelineM2: area(oldClip),
  });
}
console.log(JSON.stringify(rows, null, 2));
