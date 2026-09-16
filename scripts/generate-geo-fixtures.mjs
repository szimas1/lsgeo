import { mkdirSync, writeFileSync } from "node:fs";
import shpwrite from "@mapbox/shp-write";
import {
  collection,
  polygon,
  multiPolygon,
  line,
  point,
  hole,
  overlapping,
  disjoint,
  invalid,
  nullGeometry,
} from "../tests/fixtures/geometries.mjs";

const folder = new URL("../tests/fixtures/files/", import.meta.url);
mkdirSync(folder, { recursive: true });
for (const [name, features] of Object.entries({
  polygon: [polygon],
  multipolygon: [multiPolygon],
  line: [line],
  point: [point],
  hole: [hole],
  overlapping,
  disjoint,
  invalid: [invalid],
  "null-geometry": [nullGeometry],
  empty: [],
  "layer-a": [overlapping[0]],
  "layer-b": [overlapping[1]],
})) {
  writeFileSync(
    new URL(`${name}.geojson`, folder),
    JSON.stringify(collection(features), null, 2) + "\n",
  );
}
writeFileSync(
  new URL("polygon.zip", folder),
  Buffer.from(
    await shpwrite.zip(collection([polygon]), { outputType: "arraybuffer" }),
  ),
);
