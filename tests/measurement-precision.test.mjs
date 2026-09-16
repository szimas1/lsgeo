import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { area as sphericalArea, featureCollection, intersect } from "@turf/turf";
import { analyzeDataset } from "../src/lib/geo/analyze.ts";
import { compareDatasets } from "../src/lib/geo/spatial.ts";
import { resolveCrs, reprojectGeometry } from "../src/lib/geo/crs.ts";
import { transformGeometry } from "../src/lib/geo/analysis-context.ts";
import { measure, measurementArea } from "../src/lib/geo/measurements.ts";
import { feature, square, collection } from "./fixtures/geometries.mjs";
import { parseJsonText } from "../src/lib/geo/parsing.ts";

const close = (value, expected, tolerance = 1e-6) => assert.ok(
  Math.abs(value - expected) <= tolerance, `${value} != ${expected} ± ${tolerance}`,
);
const wkt = code => readFileSync(new URL(`./fixtures/crs/${code}-esriwkt.prj`, import.meta.url), "utf8");
export function projected(geometries, code = 31981) {
  const resolved = resolveCrs(wkt(code), "controle.prj");
  assert.ok(resolved.projection);
  return analyzeDataset({
    name: "controle", format: "Shapefile", crs: `${resolved.info.label} — EPSG:${code}`,
    crsInfo: resolved.info, sourceProjection: resolved.projection,
    trustedCrs: true, originalGeometries: geometries,
    rawFeatures: geometries.map(g => feature(reprojectGeometry(g, resolved.projection))), issues: [],
  });
}

test("UTM SIRGAS 18S–25S: área, perímetro, união, interseção e diferenças exatos na grade", () => {
  for (let zone = 18; zone <= 25; zone++) {
    const g = square(650000, 8300000, 1000);
    const a = projected([g], 31960 + zone);
    const b = projected([square(650400, 8300000, 1000)], 31960 + zone);
    close(a.totals.area, 1e6);
    close(a.totals.perimeter, 4000);
    assert.equal(a.analysis.method, "projected");
    assert.equal(a.analysis.crs, `EPSG:${31960 + zone}`);
    const f = a.features[0];
    assert.deepEqual(f.originalGeometry, g);
    assert.deepEqual(f.analysisGeometry, g);
    assert.notEqual(f.analysisGeometry, f.originalGeometry);
    assert.notDeepEqual(f.displayGeometry, g);
    assert.deepEqual(a.mapData.features[0].geometry, f.displayGeometry);
    assert.equal(a.totals.coordinateCrs, a.analysis.crs);
    assert.ok(Math.abs(a.displayBounds[0]) <= 180);
    assert.equal(a.totals.bounds[0], 650000);
    const c = compareDatasets(a, b);
    close(c.intersectionArea, 600000);
    close(c.differenceA, 400000);
    close(c.differenceB, 400000);
    close(c.percentA, 60);
    close(c.areaA, c.differenceA + c.intersectionArea);
    assert.equal(c.analysisIntersection.geometry.coordinates[0][0][0] >= 650000, true);
    assert.ok(Math.abs(c.intersection.geometry.coordinates[0][0][0]) <= 180);
    const merged = projected([g, square(650400, 8300000, 1000)], 31960 + zone);
    close(merged.occupied, 1400000);
    close(merged.overlaps[0].area, 600000);
  }
});

test("UTM: buracos, MultiPolygon, linhas 3–4–5, orientação e precisão com northing grande", () => {
  const exterior = square(500000, 8300000, 1000).coordinates[0];
  const hole = square(500100, 8300100, 200).coordinates[0];
  const g = { type: "MultiPolygon", coordinates: [
    [exterior.toReversed(), hole], square(502000, 8300000, 100).coordinates,
  ] };
  const a = projected([g, { type: "LineString", coordinates: [[500000, 8300000], [500003, 8300004]] }]);
  close(a.totals.area, 970000);
  close(a.totals.perimeter, 5200);
  close(a.totals.length, 5);
  const tiny = projected([square(500000, 9999999, 0.01)]);
  close(tiny.totals.area, 0.0001, 1e-10);
  close(tiny.totals.perimeter, 0.04, 1e-8);
});

test("UTM: recorte oblíquo usa geometria original; round-trip é isolado da área esférica", () => {
  const triangle = { type: "Polygon", coordinates: [[[650000,8300000], [651000,8300000], [650000,8301000], [650000,8300000]]] };
  const a = projected([triangle]);
  const b = projected([square(650000,8300000,500)]);
  close(a.totals.area, 500000);
  const c = compareDatasets(a,b);
  close(c.intersectionArea, 250000);
  close(c.differenceA,250000);
  const restored = transformGeometry(a.features[0].displayGeometry, "EPSG:4326", a.analysis.projection);
  close(measurementArea(restored,a.analysis),500000,0.001);
  assert.ok(Math.abs(sphericalArea(a.features[0].displayGeometry) - a.totals.area) > 100);
  const oldIntersection = intersect(featureCollection([a.features[0].feature,b.features[0].feature]));
  assert.ok(Math.abs(sphericalArea(oldIntersection)-c.intersectionArea)>100);
});

test("comparação entre fusos transforma para uma grade comum e não mistura coordenadas", () => {
  const a = projected([square(650000,8300000,1000)]);
  const target = resolveCrs(wkt(31982),"b.prj").projection;
  const bGeometry = transformGeometry(a.features[0].originalGeometry,a.analysis.projection,target,0.0001);
  const b = projected([bGeometry],31982);
  const c = compareDatasets(a,b);
  assert.equal(c.analysis.crs,"EPSG:31981");
  close(c.intersectionArea,1e6,0.2);
  close(c.areaB,1e6,0.2);
  assert.throws(() => compareDatasets(a,projected([square(500000,8300000,1000)],31985)),/fuso UTM/);
});

test("WGS84: referência independente por integração do elipsoide e distância equatorial", () => {
  const data = analyzeDataset(parseJsonText(JSON.stringify(collection([feature(square())])),"geo.json"));
  const a=6378137, f=1/298.257223563, e2=f*(2-f), d=0.01*Math.PI/180;
  // Integral da faixa limitada por paralelos/meridianos; a borda geodésica
  // difere < 0,01 m² neste quadrado de 0,01°. Simpson fornece referência
  // independente do algoritmo de soma geodésica usado pela aplicação.
  const density = p => a*a*(1-e2)*Math.cos(p)/(1-e2*Math.sin(p)**2)**2;
  const parallelArea = d*d/6*(density(0)+4*density(d/2)+density(d));
  close(data.totals.area, parallelArea,0.01);
  close(measure({type:"LineString",coordinates:[[0,0],[0.01,0]]}).length,a*d,1e-8);
  assert.equal(data.analysis.method,"ellipsoidal");
  assert.notEqual(data.totals.area,0.0001);
});

test("transformação não aplica duas vezes uma posição compartilhada no fechamento", () => {
  const g = square(650000,8300000,1000);
  g.coordinates[0][4] = g.coordinates[0][0];
  const source = resolveCrs(wkt(31981),"area.prj").projection;
  for (const result of [reprojectGeometry(g,source), transformGeometry(g,source,"EPSG:4326")]) {
    assert.deepEqual(result.coordinates[0][0],result.coordinates[0][4]);
    assert.ok(result.coordinates[0][0][0] < -50);
    assert.ok(result.coordinates[0][0][0] > -60);
  }
  assert.equal(g.coordinates[0][0][0],650000);
});

test("Web Mercator não é adotado para medições métricas apenas por ter unidade metro", () => {
  const resolved = resolveCrs("",null,"EPSG:3857");
  const original = square(0,0,1000);
  const data = analyzeDataset({
    name:"mercator",format:"Shapefile",crs:"EPSG:3857",crsInfo:resolved.info,
    sourceProjection:resolved.projection,originalGeometries:[original],trustedCrs:true,issues:[],
    rawFeatures:[feature(reprojectGeometry(original,resolved.projection))],
  });
  assert.equal(data.analysis.method,"ellipsoidal");
  assert.deepEqual(data.features[0].originalGeometry,original);
  assert.ok(Math.abs(data.totals.area-1e6)>1000);
});
