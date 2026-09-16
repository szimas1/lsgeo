import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import shpwrite from "@mapbox/shp-write";
import { unzipSync, zipSync } from "fflate";
import {
  decodePrj,
  resolveCrs,
  reprojectGeometry,
} from "../src/lib/geo/crs.ts";
import { CRS_OPTIONS } from "../src/lib/geo/crs-catalog.ts";
import { parseFiles } from "../src/lib/geo/parsing.ts";
import { analyzeDataset } from "../src/lib/geo/analyze.ts";
import { compareDatasets } from "../src/lib/geo/spatial.ts";

const wkt = (code, format = "esriwkt") =>
  readFileSync(
    new URL(`./fixtures/crs/${code}-${format}.prj`, import.meta.url),
    "utf8",
  ).trim();
const near = (value, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(value - expected) < tolerance, `${value} ≠ ${expected}`);
const projected = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { nome: "Área São João" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [500000, 8300000],
            [501000, 8300000],
            [501000, 8301000],
            [500000, 8301000],
            [500000, 8300000],
          ],
        ],
      },
    },
  ],
};
async function components(prj = wkt(31981)) {
  const archive = new Uint8Array(
    await shpwrite.zip(projected, { outputType: "arraybuffer", prj }),
  );
  return Object.entries(unzipSync(archive))
    .filter(([name]) => !name.endsWith("/"))
    .map(([name, data]) => {
      const extension = name.split(".").at(-1);
      const base =
        extension === "prj"
          ? "ÁREA SÃO JOÃO".normalize("NFD")
          : "Área São João";
      return new File([data], `${base}.${extension.toUpperCase()}`);
    });
}
test("WKTs ESRI reais reconhecem SIRGAS 2000 e WGS84 sem autoridade EPSG", () => {
  for (const code of [4674, 4326]) {
    assert.ok(!wkt(code).includes("EPSG"));
    const result = resolveCrs(wkt(code), "Área São João.PRJ");
    assert.equal(result.info.epsg, `EPSG:${code}`);
    assert.ok(result.projection);
    const point = reprojectGeometry(
      { type: "Point", coordinates: [-56, -15] },
      result.projection,
    );
    near(point.coordinates[0], -56);
    near(point.coordinates[1], -15);
  }
});
test("WKTs reais de SIRGAS UTM 18S–25S identificam fuso por parâmetros", () => {
  for (let zone = 18; zone <= 25; zone++) {
    const code = 31960 + zone;
    const result = resolveCrs(wkt(code), "area.prj");
    assert.equal(result.info.epsg, `EPSG:${code}`);
    const point = reprojectGeometry(
      { type: "Point", coordinates: [500000, 10000000] },
      result.projection,
    );
    near(point.coordinates[0], zone * 6 - 183);
    near(point.coordinates[1], 0);
  }
});
test("WKT2 reconhecido, inclusive removendo identificadores EPSG", () => {
  for (const text of [
    wkt(31981, "wkt2"),
    wkt(31981, "wkt2").replace(/,?ID\["EPSG",\d+\]/g, ""),
  ]) {
    const result = resolveCrs(text, "area.prj");
    assert.equal(result.info.epsg, "EPSG:31981");
    assert.ok(result.projection);
  }
});
test("título não substitui parâmetros; elipsoide inconsistente é bloqueado", () => {
  assert.equal(
    resolveCrs(wkt(31981).replace("Zone_21S", "Zone_22S"), "area.prj").info
      .epsg,
    "EPSG:31981",
  );
  assert.equal(
    resolveCrs(wkt(31981).replace("298.257222101", "300"), "area.prj")
      .projection,
    null,
  );
});
test("SAD69 é transformado com deslocamento e TOWGS84 explícito é preservado", () => {
  const resolved = resolveCrs(wkt(4618), "area.prj");
  assert.equal(resolved.info.epsg, "EPSG:4618");
  assert.match(resolved.info.warning, /19 m/);
  const point = reprojectGeometry(
    { type: "Point", coordinates: [-56, -15] },
    resolved.projection,
  );
  assert.ok(Math.abs(point.coordinates[0] + 56) > 0.0001);
  const explicit = wkt(4618).replace(
    "6378160.0,298.25]]",
    "6378160.0,298.25],TOWGS84[-60,-2,-41]]",
  );
  assert.deepEqual(
    resolveCrs(explicit, "area.prj").projection.datum_params,
    [-60, -2, -41],
  );
  assert.equal(resolveCrs(wkt(29191), "sad69-utm.prj").info.epsg, "EPSG:29191");
});
test("outro CRS interpretado com transformação explícita é aceito", () => {
  const text = wkt(4326)
    .replaceAll("WGS_1984", "Datum_local")
    .replace(
      "6378137.0,298.257223563]]",
      "6378137.0,298.257223563],TOWGS84[1,2,3]]",
    );
  assert.ok(resolveCrs(text, "local.prj").projection);
});
test("PRJ ausente, vazio e WKT desconhecido permanecem bloqueados", () => {
  for (const text of [
    "",
    "não é WKT",
    'LOCAL_CS["Local",UNIT["Meter",1]]',
    wkt(4674).replaceAll("SIRGAS_2000", "Datum_desconhecido"),
  ]) {
    const result = resolveCrs(text, "area.prj");
    assert.equal(result.projection, null);
    assert.equal(result.info.wkt, text);
    assert.ok(result.info.reason);
  }
  assert.match(resolveCrs("", null).info.reason, /Nenhum PRJ/);
  assert.match(resolveCrs("", "vazio.prj").info.reason, /vazio/);
});
test("decodifica BOM UTF-8 e UTF-16 sem perder WKT", () => {
  assert.equal(
    decodePrj(Buffer.from(`\uFEFF${wkt(31981)}`, "utf8")),
    wkt(31981),
  );
  assert.equal(
    decodePrj(Buffer.from(`\uFEFF${wkt(31981)}`, "utf16le")),
    wkt(31981),
  );
});
test("componentes com espaços, acentos Unicode e extensão mista liberam mapa e medições", async () => {
  const files = await components();
  files.push(new File(["UTF-8"], "área são joão.cPg"));
  const parsed = await parseFiles(files);
  assert.equal(parsed.crsInfo.epsg, "EPSG:31981");
  assert.ok(parsed.crsInfo.prjName.endsWith(".PRJ"));
  const data = analyzeDataset(parsed);
  assert.equal(data.mapData.features.length, 1);
  near(data.totals.area, 1000000, 1e-6);
  near(data.totals.perimeter, 4000, 1e-6);
  const compare = compareDatasets(data, data);
  near(compare.percentA, 100);
  near(compare.differenceA, 0);
});
test("ZIP aplica o mesmo matching normalizado e não associa PRJ de outro conjunto", async () => {
  const files = await components();
  const entries = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        `pasta/${file.name}`,
        new Uint8Array(await file.arrayBuffer()),
      ]),
    ),
  );
  const parsed = await parseFiles([new File([zipSync(entries)], "Area.zip")]);
  assert.equal(parsed.crsInfo.epsg, "EPSG:31981");
  const mismatch = files.map((file) =>
    /\.PRJ$/.test(file.name) ? new File([wkt(31982)], "Outra área.prj") : file,
  );
  await assert.rejects(parseFiles(mismatch), /conjuntos diferentes/);
});
test("seleção manual reprocessa coordenadas originais sem assumir WGS84", async () => {
  const files = (await components()).filter(
    (file) => !/\.PRJ$/.test(file.name),
  );
  assert.equal((await parseFiles(files)).trustedCrs, false);
  const manual = analyzeDataset(await parseFiles(files, "EPSG:31981"));
  assert.equal(manual.crsInfo.source, "manual");
  assert.equal(manual.mapData.features.length, 1);
  near(manual.totals.area, 1000000, 1e-6);
  assert.equal((await parseFiles(files, "EPSG:999999")).trustedCrs, false);
  for (const option of CRS_OPTIONS)
    assert.ok(resolveCrs("", null, option.code).projection, option.code);
});
