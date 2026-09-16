import assert from "node:assert/strict";
import test from "node:test";
import { parseGeoJson } from "../src/lib/geojson.ts";

const feature = (geometry) => ({ type: "Feature", geometry });
const collection = (features) => JSON.stringify({ type: "FeatureCollection", features });

test("Polygon válido gera resumo", () => {
  assert.deepEqual(parseGeoJson(collection([feature({
    type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
  })])), { type: "FeatureCollection", featureCount: 1, geometryTypes: ["Polygon"] });
});

test("conta features e remove tipos repetidos, cobrindo os seis tipos suportados", () => {
  const types = ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"];
  const summary = parseGeoJson(collection([...types, "Point"].map((type) => feature({ type }))));
  assert.equal(summary.featureCount, 7);
  assert.deepEqual(summary.geometryTypes, types);
});

test("rejeita JSON que não possui a estrutura básica", () => {
  for (const value of [null, [], 1, "texto", {}, { features: [] },
    { type: "Point" }, { type: "FeatureCollection" },
    { type: "FeatureCollection", features: {} },
    { type: "FeatureCollection", features: [null] },
    { type: "FeatureCollection", features: [{}] }]) {
    assert.throws(() => parseGeoJson(JSON.stringify(value)), /estrutura GeoJSON válida/);
  }
});

test("rejeita JSON inválido e arquivo vazio com mensagens próprias", () => {
  assert.throws(() => parseGeoJson('{"type":'), /JSON é válido/);
  for (const content of ["", " \n\t"]) {
    assert.throws(() => parseGeoJson(content), /arquivo está vazio/);
  }
});

test("aceita coleção vazia", () => {
  assert.deepEqual(parseGeoJson(collection([])), {
    type: "FeatureCollection", featureCount: 0, geometryTypes: [],
  });
});

test("tolera geometria nula, ausente, malformada e desconhecida", () => {
  const summary = parseGeoJson(collection([
    feature(null), { type: "Feature" }, feature(10), feature({}),
    feature({ type: "GeometryCollection", geometries: [] }), feature({ type: "Point" }),
  ]));
  assert.equal(summary.featureCount, 6);
  assert.deepEqual(summary.geometryTypes, ["Sem geometria", "Desconhecida ou não suportada", "Point"]);
});
