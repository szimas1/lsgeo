import test from "node:test";
import assert from "node:assert/strict";
import shpwrite from "@mapbox/shp-write";
import { unzipSync, zipSync, strToU8 } from "fflate";
import proj4 from "proj4";
import { parseFiles } from "../src/lib/geo/parsing.ts";
import { analyzeDataset } from "../src/lib/geo/analyze.ts";
import { collection, feature, polygon } from "./fixtures/geometries.mjs";

const archive = async (data = collection([polygon]), options = {}) =>
  new Uint8Array(
    await shpwrite.zip(data, { outputType: "arraybuffer", ...options }),
  );
const zipFile = (bytes) => new File([bytes], "area.zip");
test("Shapefile ZIP WGS84 preserva geometrias e atributos", async () => {
  const parsed = await parseFiles([zipFile(await archive())]);
  assert.equal(parsed.format, "Shapefile");
  assert.equal(parsed.trustedCrs, true);
  const result = analyzeDataset(parsed);
  assert.equal(result.mapData.features.length, 1);
  assert.equal(result.features[0].properties.numero, 7);
  assert.ok(Math.abs(result.totals.area - 1230907.205) < 0.01);
});
test("componentes soltos, nomes em maiúsculas e CPG", async () => {
  const entries = unzipSync(await archive());
  const files = Object.entries(entries)
    .filter(([name]) => !name.endsWith("/"))
    .map(
      ([name, data]) => new File([data], name.split("/").at(-1).toUpperCase()),
    );
  const shapeName = files.find((file) => file.name.endsWith(".SHP")).name;
  files.push(new File(["UTF-8"], shapeName.replace(/\.SHP$/, ".CPG")));
  const parsed = await parseFiles(files);
  assert.equal(parsed.trustedCrs, true);
  assert.equal(parsed.rawFeatures.length, 1);
});
test("sem PRJ ou com PRJ desconhecido bloqueia medições", async () => {
  for (const prj of [null, 'LOCAL_CS["Unknown",UNIT["Meter",1]]']) {
    const entries = unzipSync(await archive());
    const key = Object.keys(entries).find((name) => name.endsWith(".prj"));
    if (prj === null) delete entries[key];
    else entries[key] = strToU8(prj);
    const parsed = await parseFiles([zipFile(zipSync(entries))]);
    assert.equal(parsed.trustedCrs, false);
    const result = analyzeDataset(parsed);
    assert.equal(result.mapData.features.length, 0);
    assert.equal(result.features[0].properties.numero, 7);
  }
});
test("Shapefile UTM é reprojetado para longitude e latitude", async () => {
  const prj =
    'PROJCS["WGS_1984_UTM_Zone_21S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000],PARAMETER["False_Northing",10000000],PARAMETER["Central_Meridian",-57],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0],UNIT["Meter",1]]';
  const xy = proj4("EPSG:4326", prj, [-56, -15]);
  const bytes = await archive(
    collection([feature({ type: "Point", coordinates: xy })]),
    { prj },
  );
  const parsed = await parseFiles([zipFile(bytes)]);
  assert.equal(parsed.trustedCrs, true);
  const result = analyzeDataset(parsed);
  assert.equal(result.mapData.features.length, 1);
  const coordinates = result.features[0].feature.geometry.coordinates;
  assert.ok(Math.abs(coordinates[0] + 56) < 1e-7);
  assert.ok(Math.abs(coordinates[1] + 15) < 1e-7);
});
test("componentes ausentes e índice corrompido são rejeitados", async () => {
  for (const extension of ["shp", "shx", "dbf"]) {
    const entries = unzipSync(await archive());
    delete entries[
      Object.keys(entries).find((name) => name.endsWith(`.${extension}`))
    ];
    await assert.rejects(
      parseFiles([zipFile(zipSync(entries))]),
      /incompleto|único Shapefile/,
    );
  }
  const entries = unzipSync(await archive());
  const key = Object.keys(entries).find((name) => name.endsWith(".shx"));
  entries[key][100] = 100;
  await assert.rejects(parseFiles([zipFile(zipSync(entries))]), /incompatível/);
});
test("ZIP com expansão excessiva é rejeitado antes da extração", async () => {
  const bytes = zipSync({ "large.shp": new Uint8Array(61 * 1024 * 1024) });
  await assert.rejects(parseFiles([zipFile(bytes)]), /60 MB/);
});
