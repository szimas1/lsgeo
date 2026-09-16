import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDataset } from "../src/lib/geo/analyze.ts";
import { parseJsonText, parseFiles } from "../src/lib/geo/parsing.ts";
import { compareDatasets } from "../src/lib/geo/spatial.ts";
import * as fixtures from "./fixtures/geometries.mjs";

const analyze = (features) =>
  analyzeDataset(
    parseJsonText(
      JSON.stringify(fixtures.collection(features)),
      "teste.geojson",
    ),
  );
const close = (actual, expected, tolerance) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected} ± ${tolerance}`,
  );

test("área elipsoidal e perímetro de Polygon com tolerância independente", () => {
  const data = analyze([fixtures.polygon]);
  assert.equal(data.mapData.features.length, 1);
  // Referência independente por integração em measurement-precision.test.mjs.
  close(data.totals.area, 1230907.205, 0.01);
  close(data.totals.perimeter, 4437.875316, 0.001);
  assert.deepEqual(data.totals.bounds, [0, 0, 0.01, 0.01]);
  close(data.features[0].measurement.centroid[0], 0.005, 1e-10);
  assert.deepEqual(data.features[0].properties, fixtures.polygon.properties);
});
test("MultiPolygon, buraco e contornos internos", () => {
  const base = analyze([fixtures.polygon]);
  const multi = analyze([fixtures.multiPolygon]);
  close(multi.totals.area, base.totals.area * 2, 0.01);
  const hole = analyze([fixtures.hole]);
  assert.equal(hole.mapData.features.length, 1);
  close(hole.totals.area, base.totals.area * 3, 1);
  close(hole.totals.perimeter, base.totals.perimeter * 3, 0.01);
});
test("linhas e pontos, inclusive tipos Multi", () => {
  const data = analyze([
    fixtures.line,
    fixtures.point,
    fixtures.feature({
      type: "MultiPoint",
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    }),
    fixtures.feature({
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [0.01, 0],
        ],
        [
          [0, 0],
          [0.01, 0],
        ],
      ],
    }),
  ]);
  assert.equal(data.mapData.features.length, 4);
  assert.equal(data.totals.points, 3);
  close(data.totals.length, 3339.584724, 0.001);
});
test("sobreposição, área ocupada e diferenças entre camadas", () => {
  const data = analyze(fixtures.overlapping);
  assert.equal(data.overlaps.length, 1);
  close(data.overlaps[0].area, data.features[0].measurement.area / 2, 0.01);
  close(data.occupied, data.totals.area - data.overlaps[0].area, 0.01);
  const comparison = compareDatasets(
    analyze([fixtures.overlapping[0]]),
    analyze([fixtures.overlapping[1]]),
  );
  assert.equal(comparison.intersects, true);
  close(comparison.percentA, 50, 1e-6);
  close(comparison.percentB, 50, 1e-6);
  close(
    comparison.differenceA + comparison.intersectionArea,
    comparison.areaA,
    0.01,
  );
  close(
    comparison.differenceB + comparison.intersectionArea,
    comparison.areaB,
    0.01,
  );
  assert.ok(comparison.onlyA && comparison.onlyB && comparison.intersection);
});
test("sem sobreposição, contato e contenção total", () => {
  const a = analyze([fixtures.polygon]);
  const b = analyze([fixtures.disjoint[1]]);
  assert.equal(analyze(fixtures.disjoint).overlaps.length, 0);
  assert.equal(compareDatasets(a, b).intersects, false);
  const touch = compareDatasets(
    a,
    analyze([fixtures.feature(fixtures.square(0.01))]),
  );
  assert.equal(touch.intersects, true);
  assert.equal(touch.intersectionArea, 0);
  const equal = compareDatasets(a, a);
  close(equal.percentA, 100, 1e-8);
  assert.equal(equal.differenceA, 0);
  assert.equal(equal.onlyA, null);
});
test("autointerseção, anel aberto, vazio, null, coordenadas inválidas e tipos desconhecidos", () => {
  const data = analyze([
    fixtures.invalid,
    fixtures.nullGeometry,
    fixtures.feature({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    }),
    fixtures.feature({ type: "Point", coordinates: [] }),
    fixtures.feature({ type: "Point", coordinates: [181, 0] }),
    fixtures.feature({ type: "Point", coordinates: ["x", 1] }),
    fixtures.feature({ type: "Outro" }),
    null,
    fixtures.feature({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0, 0],
      ],
    }),
  ]);
  assert.equal(data.mapData.features.length, 0);
  assert.ok(
    data.features[0].issues.some((i) => /Autointerseção/.test(i.message)),
  );
  assert.equal(data.spatialComplete, false);
  assert.throws(
    () => compareDatasets(data, analyze([fixtures.polygon])),
    /bloqueada/,
  );
});
test("buraco fora do polígono, buracos sobrepostos e multipolígono com partes sobrepostas", () => {
  for (const geometry of [
    {
      type: "Polygon",
      coordinates: [
        ...fixtures.square().coordinates,
        ...fixtures.square(1).coordinates,
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        ...fixtures.square(0, 0, 0.1).coordinates,
        ...fixtures.square(0.01, 0.01, 0.02).coordinates,
        ...fixtures.square(0.02, 0.01, 0.02).coordinates,
      ],
    },
    {
      type: "MultiPolygon",
      coordinates: fixtures.overlapping.map((f) => f.geometry.coordinates),
    },
  ])
    assert.equal(
      analyze([fixtures.feature(geometry)]).mapData.features.length,
      0,
    );
});
test("coleção vazia, duplicatas exatas e CRS legado desconhecido", () => {
  assert.equal(analyze([]).features.length, 0);
  const duplicates = analyze([fixtures.polygon, fixtures.polygon]);
  assert.ok(
    duplicates.features[1].issues.some((i) => /duplicada/.test(i.message)),
  );
  close(duplicates.occupied, duplicates.totals.area / 2, 0.01);
  const parsed = parseJsonText(
    JSON.stringify({
      ...fixtures.collection([fixtures.polygon]),
      crs: { type: "name", properties: { name: "EPSG:3857" } },
    }),
    "projetado.json",
  );
  assert.equal(parsed.trustedCrs, false);
  assert.equal(analyzeDataset(parsed).mapData.features.length, 0);
});
test("JSON e uploads inválidos não derrubam o parser", async () => {
  for (const content of [
    "",
    " ",
    "{",
    "[]",
    "null",
    "{}",
    '{"type":"FeatureCollection","features":{}}',
  ])
    assert.throws(() => parseJsonText(content, "erro.json"));
  await assert.rejects(
    parseFiles([new File(["x"], "arquivo.txt")]),
    /Use GeoJSON/,
  );
  await assert.rejects(parseFiles([new File(["x"], "area.shp")]), /incompleto/);
  await assert.rejects(parseFiles([new File([""], "area.json")]), /vazio/);
  await assert.rejects(parseFiles([new File(["x"], "area.zip")]), /ZIP/);
});
test("limites e antimeridiano são explícitos", () => {
  assert.throws(
    () => analyze(Array.from({ length: 5001 }, () => fixtures.point)),
    /5.000/,
  );
  const data = analyze([
    fixtures.feature({
      type: "LineString",
      coordinates: [
        [179, 0],
        [-179, 0],
      ],
    }),
  ]);
  assert.ok(
    data.features[0].issues.some((i) => /antimeridiano/.test(i.message)),
  );
  const many = analyze(
    Array.from({ length: 151 }, (_, i) =>
      fixtures.feature(fixtures.square(i * 0.02)),
    ),
  );
  assert.equal(many.spatialComplete, false);
  assert.equal(many.occupied, null);
  assert.ok(many.issues.some((i) => /150 polígonos/.test(i.message)));
});
