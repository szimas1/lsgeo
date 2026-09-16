import proj4, { type ProjectionDefinition } from "proj4";
import { coordEach } from "@turf/turf";
import type { Geometry } from "geojson";
import { CRS_OPTIONS } from "./crs-catalog";
import type { CrsInfo } from "./types";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const close = (value: unknown, expected: number, tolerance = 1e-7) =>
  typeof value === "number" && Math.abs(value - expected) <= tolerance;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export function decodePrj(bytes: Uint8Array): string {
  const utf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
  const utf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
  return new TextDecoder(utf16le ? "utf-16le" : utf16be ? "utf-16be" : "utf-8")
    .decode(bytes)
    .replace(/^\uFEFF/, "")
    .trim();
}

function parsedDefinition(text: string): ProjectionDefinition {
  // A API oficial defs usa o wkt-parser do próprio proj4 (WKT1 ESRI/OGC e WKT2).
  // A leitura é síncrona; cada operação retém uma cópia independente.
  proj4.defs("LSGEO:PRJ", text);
  return structuredClone(proj4.defs("LSGEO:PRJ"));
}

function datumFamily(
  definition: ProjectionDefinition,
): "sirgas" | "wgs84" | "sad69" | "sad96" | null {
  const code = normalize(definition.datumCode || "");
  if (
    [
      "sirgas2000",
      "sistemadereferenciageocentricoparalasamericas2000",
      "epsg4674",
    ].includes(code)
  )
    return "sirgas";
  if (
    ["wgs84", "wgs1984", "worldgeodeticsystem1984", "epsg4326"].includes(code)
  )
    return "wgs84";
  if (
    [
      "sad6996",
      "southamerican196996",
      "southamericandatum196996",
      "epsg5527",
    ].includes(code)
  )
    return "sad96";
  if (
    [
      "sad69",
      "sad1969",
      "southamerican1969",
      "southamericandatum1969",
      "epsg4618",
    ].includes(code)
  )
    return "sad69";
  return null;
}

function identify(
  definition: ProjectionDefinition,
  family: ReturnType<typeof datumFamily>,
) {
  const p = record(new proj4.Proj(definition));
  const name =
    family === "sirgas"
      ? "SIRGAS 2000"
      : family === "wgs84"
        ? "WGS84"
        : family === "sad96"
          ? "SAD69(96)"
          : "SAD69";
  const projection = normalize(definition.projName || "");
  // EPSG só é atribuído após conferir os parâmetros, não pelo título do arquivo.
  const greenwich = close(definition.from_greenwich || 0, 0);
  if (
    family &&
    greenwich &&
    projection === "longlat" &&
    ["degree", "degrees"].includes(definition.units || "degrees")
  ) {
    return {
      label: `${name} geográfico`,
      epsg:
        family === "sirgas"
          ? "EPSG:4674"
          : family === "wgs84"
            ? "EPSG:4326"
            : family === "sad96"
              ? "EPSG:5527"
              : "EPSG:4618",
    };
  }
  if (
    family &&
    greenwich &&
    ["utm", "transversemercator", "tmerc", "etmerc"].includes(projection)
  ) {
    const longitude =
      typeof p.long0 === "number" ? (p.long0 * 180) / Math.PI : NaN;
    const zone = Math.round((longitude + 183) / 6);
    if (
      zone >= 1 &&
      zone <= 60 &&
      close(longitude, zone * 6 - 183) &&
      close(p.lat0, 0) &&
      close(p.k0, 0.9996) &&
      close(p.x0, 500000) &&
      close(p.y0, 10000000) &&
      close(definition.to_meter ?? 1, 1)
    ) {
      const epsg =
        family === "sirgas" && zone >= 18 && zone <= 25
          ? `EPSG:${31960 + zone}`
          : family === "wgs84"
            ? `EPSG:${32700 + zone}`
            : family === "sad69" && zone >= 18 && zone <= 25
              ? `EPSG:${29170 + zone}`
              : undefined;
      return { label: `${name} / UTM zone ${zone}S`, epsg };
    }
  }
  const sourceName = record(definition).name;
  return {
    label:
      typeof sourceName === "string"
        ? sourceName
        : definition.title || "CRS interpretado pelo proj4",
    epsg: undefined,
  };
}

export function resolveCrs(
  wkt: string,
  prjName: string | null,
  manualCode?: string,
): { info: CrsInfo; projection: ProjectionDefinition | null } {
  const info: CrsInfo = {
    prjName,
    wkt,
    label: "CRS não identificado",
    source: manualCode ? "manual" : "prj",
    transformation: null,
    warning: null,
    reason: null,
  };
  try {
    const manual = manualCode
      ? CRS_OPTIONS.find((option) => option.code === manualCode)
      : undefined;
    if (manualCode && !manual)
      throw new Error("CRS manual não está no catálogo disponível.");
    if (!manual && !wkt)
      throw new Error(
        prjName
          ? "O PRJ está presente, mas está vazio."
          : "Nenhum PRJ correspondente foi encontrado.",
      );
    if (
      !manual &&
      !/^(?:GEOGCS|PROJCS|GEOGCRS|GEODCRS|PROJCRS|BOUNDCRS)\s*\[/i.test(wkt)
    )
      throw new Error(
        "O PRJ está presente, mas não contém um WKT de CRS geográfico ou projetado reconhecido.",
      );
    const definition = parsedDefinition(manual?.definition || wkt);
    if (!definition.projName)
      throw new Error("O WKT não informa uma projeção reconhecida.");
    if (definition.nadgrids && definition.nadgrids !== "@null")
      throw new Error(
        "O WKT exige uma grade de datum externa que não está disponível.",
      );
    const family = datumFamily(definition);
    const explicitTransform = definition.datum_params !== undefined;
    if (family) {
      const expectedA = family.startsWith("sad") ? 6378160 : 6378137;
      const expectedRf = family.startsWith("sad")
        ? 298.25
        : family === "sirgas"
          ? 298.257222101
          : 298.257223563;
      const p = record(new proj4.Proj(definition));
      if (!close(p.a, expectedA, 0.001) || !close(p.rf, expectedRf, 0.000001))
        throw new Error(
          "Datum e elipsoide do WKT são inconsistentes. Defina o CRS correto manualmente.",
        );
      if (!explicitTransform) {
        definition.datum_params =
          family === "sad69"
            ? [-57, 1, -41]
            : family === "sad96"
              ? [-67.35, 3.88, -38.22]
              : [0, 0, 0];
      }
    }
    const initialized = record(new proj4.Proj(definition));
    const datumType = record(initialized.datum).datum_type;
    if (datumType === 5 && !manual)
      throw new Error(
        "WKT interpretado, mas a transformação do datum para WGS84 não pôde ser determinada.",
      );
    if (definition.datum_params !== undefined) {
      const parameters =
        typeof definition.datum_params === "string"
          ? definition.datum_params.split(",").map(Number)
          : definition.datum_params;
      if (
        ![3, 7].includes(parameters.length) ||
        !parameters.every(Number.isFinite)
      )
        throw new Error("Parâmetros de transformação de datum inválidos.");
    }
    const identified = manual
      ? { label: manual.label, epsg: manual.code }
      : identify(definition, family);
    Object.assign(info, identified);
    const parameters = definition.datum_params;
    info.transformation = `${identified.epsg || identified.label} → EPSG:4326 (longitude, latitude; proj4)${parameters ? `; TOWGS84[${parameters}]` : ""}`;
    if (
      family === "sirgas" ||
      manual?.code.startsWith("EPSG:319") ||
      manual?.code === "EPSG:4674"
    )
      info.warning =
        explicitTransform && !manual
          ? "Transformação de datum declarada no WKT preservada; sem correção por época."
          : "SIRGAS 2000 → WGS84: aproximação EPSG:15894, precisão nominal de 1 m, sem correção por época.";
    if (
      family === "sad69" ||
      manual?.code === "EPSG:4618" ||
      manual?.code.startsWith("EPSG:291")
    )
      info.warning =
        explicitTransform && !manual
          ? "SAD69: transformação declarada no WKT preservada; sem grades de correção."
          : "SAD69 → WGS84: transformação continental EPSG:1864 (-57, 1, -41 m), precisão nominal de 19 m. Para precisão local, use WKT com transformação apropriada ou processamento com grades.";
    if (family === "sad96" || manual?.code === "EPSG:5527")
      info.warning =
        "SAD69(96): transformação aproximada por parâmetros; não aplica grades locais nem correções de época.";
    proj4(new proj4.Proj(definition), "EPSG:4326");
    return { info, projection: definition };
  } catch (error) {
    info.reason =
      error instanceof Error
        ? error.message
        : "Não foi possível interpretar o WKT ou sua transformação.";
    return { info, projection: null };
  }
}

export function reprojectGeometry(
  geometry: Geometry | null,
  source: ProjectionDefinition,
): Geometry | null {
  if (!geometry) return null;
  const transformed = structuredClone(geometry);
  const converter = proj4(new proj4.Proj(source), "EPSG:4326");
  const seen = new WeakSet<number[]>();
  coordEach(transformed, (position) => {
    // A closed ring can reuse the very same position object at both ends.
    if (seen.has(position)) return;
    seen.add(position);
    const point = converter.forward([position[0], position[1]]);
    if (!point.every(Number.isFinite))
      throw new Error("A transformação do CRS produziu coordenadas inválidas.");
    position[0] = point[0];
    position[1] = point[1];
  });
  return transformed;
}
