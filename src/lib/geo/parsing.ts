import { unzipSync } from "fflate";
import { decodePrj, resolveCrs, reprojectGeometry } from "./crs";
import { LIMITS, type ParsedDataset } from "./types";

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseCollection(value: unknown): unknown[] {
  if (
    !isObject(value) ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features)
  ) {
    throw new Error(
      "GeoJSON inválido: esperado FeatureCollection com features em um array.",
    );
  }
  if (value.features.length > LIMITS.features)
    throw new Error("Limite de 5.000 features por camada excedido.");
  return value.features;
}

export function parseJsonText(text: string, name: string): ParsedDataset {
  if (!text.trim()) throw new Error("O arquivo está vazio.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("JSON inválido. Verifique a sintaxe do arquivo.");
  }
  const rawFeatures = parseCollection(value);
  const crs = isObject(value) ? value.crs : undefined;
  const crsName =
    isObject(crs) && isObject(crs.properties) ? crs.properties.name : undefined;
  const trustedCrs =
    crs === undefined ||
    crs === null ||
    (typeof crsName === "string" &&
      [
        "EPSG:4326",
        "urn:ogc:def:crs:OGC:1.3:CRS84",
        "urn:ogc:def:crs:EPSG::4326",
      ].includes(crsName));
  return {
    name,
    format: "GeoJSON",
    rawFeatures,
    trustedCrs,
    crs: trustedCrs
      ? "WGS84 / longitude, latitude (RFC 7946)"
      : "CRS legado não suportado",
    issues: trustedCrs
      ? []
      : [
          {
            severity: "erro",
            message:
              "CRS do GeoJSON não reconhecido. Exporte em WGS84; mapa e cálculos bloqueados.",
          },
        ],
  };
}

export async function parseFiles(
  files: File[],
  manualCrs?: string,
): Promise<ParsedDataset> {
  if (!files.length) throw new Error("Selecione um arquivo.");
  if (files.some((f) => !f.size && !/\.(prj|cpg)$/i.test(f.name)))
    throw new Error("Há um arquivo vazio na seleção.");
  if (files.reduce((n, f) => n + f.size, 0) > LIMITS.bytes)
    throw new Error("Limite de 20 MB por seleção excedido.");
  if (files.length === 1 && /\.(geojson|json)$/i.test(files[0].name)) {
    return parseJsonText(await files[0].text(), files[0].name);
  }
  const components = new Map<string, Uint8Array>();
  const originalNames = new Map<string, string>();
  // NFC equipara acentos compostos/decompostos, sem confundir nomes distintos.
  const componentKey = (name: string) =>
    name.replace(/\\/g, "/").normalize("NFC").toLowerCase();
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    let expanded = 0;
    let entries = 0;
    try {
      const archive = unzipSync(new Uint8Array(await files[0].arrayBuffer()), {
        filter(entry) {
          expanded += entry.originalSize;
          if (++entries > 100 || expanded > LIMITS.expanded)
            throw new Error("ZIP excede 60 MB descompactados ou 100 entradas.");
          return (
            /\.(shp|shx|dbf|prj|cpg)$/i.test(entry.name) &&
            !entry.name.startsWith("__MACOSX/")
          );
        },
      });
      for (const [name, data] of Object.entries(archive)) {
        const key = componentKey(name);
        if (components.has(key))
          throw new Error("Componentes duplicados no ZIP.");
        components.set(key, data);
        originalNames.set(key, name);
      }
    } catch (error) {
      throw new Error(
        `Não foi possível abrir o ZIP: ${error instanceof Error ? error.message : "arquivo inválido"}`,
      );
    }
  } else {
    for (const file of files) {
      if (!/\.(shp|shx|dbf|prj|cpg)$/i.test(file.name))
        throw new Error(
          "Use GeoJSON, ZIP ou os componentes de um único Shapefile.",
        );
      const key = componentKey(file.name);
      if (components.has(key))
        throw new Error("Componentes duplicados na seleção.");
      components.set(key, new Uint8Array(await file.arrayBuffer()));
      originalNames.set(key, file.name);
    }
  }
  const shapes = [...components.keys()].filter((name) => name.endsWith(".shp"));
  if (shapes.length !== 1)
    throw new Error(
      "Selecione um único Shapefile por camada, incluindo o componente .shp.",
    );
  const base = shapes[0].slice(0, -4);
  for (const extension of ["shp", "shx", "dbf"]) {
    if (!components.get(`${base}.${extension}`)?.length)
      throw new Error(
        `Shapefile incompleto: falta ${base}.${extension}. Os componentes devem ter o mesmo nome.`,
      );
  }
  if (
    [...components.keys()].some(
      (name) => name.slice(0, name.lastIndexOf(".")) !== base,
    )
  )
    throw new Error(
      "Há componentes de conjuntos diferentes. Selecione apenas um conjunto por camada.",
    );
  const prjBytes = components.get(`${base}.prj`);
  const prj = prjBytes ? decodePrj(prjBytes) : "";
  const prjName = originalNames.get(`${base}.prj`) || null;
  const resolved = resolveCrs(prj, prjName, manualCrs);
  const trustedCrs = resolved.projection !== null;
  const crs = trustedCrs
    ? `${resolved.info.label}${resolved.info.epsg ? ` — ${resolved.info.epsg}` : ""}`
    : "CRS não identificado";
  if (process.env.NODE_ENV === "development") {
    console.debug("[LSGeo CRS]", {
      prjName,
      wkt: prj,
      identified: crs,
      source: resolved.info.source,
      transformation: resolved.info.transformation,
      reason: resolved.info.reason,
    });
  }
  try {
    const { parseShp, parseDbf } = await import("shpjs");
    const buffer = (extension: string) =>
      components.get(`${base}.${extension}`)!.slice().buffer as ArrayBuffer;
    const shp = buffer("shp");
    const shx = buffer("shx");
    const dbf = buffer("dbf");
    if (shp.byteLength < 100 || shx.byteLength < 100 || dbf.byteLength < 32)
      throw new Error("Cabeçalho incompleto.");
    const shapeHeader = new DataView(shp),
      indexHeader = new DataView(shx);
    if (
      shapeHeader.getInt32(0) !== 9994 ||
      indexHeader.getInt32(0) !== 9994 ||
      shapeHeader.getInt32(24) * 2 !== shp.byteLength ||
      indexHeader.getInt32(24) * 2 !== shx.byteLength ||
      (shx.byteLength - 100) % 8 !== 0 ||
      shapeHeader.getInt32(32, true) !== indexHeader.getInt32(32, true)
    )
      throw new Error("Cabeçalhos SHP/SHX inconsistentes.");
    const count = (shx.byteLength - 100) / 8;
    if (count > LIMITS.features)
      throw new Error("Limite de 5.000 features excedido.");
    if (new DataView(dbf).getUint32(4, true) !== count)
      throw new Error("Quantidade de registros DBF e SHX diferente.");
    for (let i = 0; i < count; i++) {
      const offset = indexHeader.getInt32(100 + i * 8) * 2;
      const size = indexHeader.getInt32(104 + i * 8) * 2;
      if (
        offset < 100 ||
        size < 4 ||
        offset + 8 + size > shp.byteLength ||
        shapeHeader.getInt32(offset + 4) * 2 !== size
      )
        throw new Error("Índice SHX incompatível com SHP.");
    }
    // shpjs suprime erros de PRJ internamente: lemos coordenadas originais e
    // aplicamos uma transformação explícita pelo proj4, sem fallback silencioso.
    const rawGeometries = parseShp(shp);
    const geometries = resolved.projection
      ? rawGeometries.map((geometry) =>
          reprojectGeometry(geometry, resolved.projection!),
        )
      : rawGeometries;
    if (process.env.NODE_ENV === "development" && trustedCrs) {
      console.debug("[LSGeo CRS] Transformação aplicada", {
        features: geometries.length,
        transformation: resolved.info.transformation,
      });
    }
    const cpg = components.get(`${base}.cpg`);
    const attributes = parseDbf(
      dbf,
      (cpg?.slice().buffer || new ArrayBuffer(0)) as ArrayBuffer,
    );
    if (geometries.length !== count || attributes.length !== count)
      throw new Error("Registros geométricos e atributos inconsistentes.");
    return {
      name: files.length === 1 ? files[0].name : `${base}.shp (+ componentes)`,
      format: "Shapefile",
      crs,
      crsInfo: resolved.info,
      sourceProjection: resolved.projection || undefined,
      originalGeometries: rawGeometries,
      trustedCrs,
      rawFeatures: geometries.map((geometry, i) => ({
        type: "Feature",
        geometry,
        properties: attributes[i],
      })),
      issues: trustedCrs
        ? [
            {
              severity: "informação",
              message:
                resolved.info.transformation ||
                "Geometria convertida para EPSG:4326.",
            },
            ...(resolved.info.warning
              ? [
                  {
                    severity: "alerta" as const,
                    message: resolved.info.warning,
                  },
                ]
              : []),
            ...(manualCrs
              ? [
                  {
                    severity: "alerta" as const,
                    message:
                      "CRS de origem definido manualmente pelo usuário; o PRJ original foi preservado para diagnóstico.",
                  },
                ]
              : []),
          ]
        : [
            {
              severity: "erro",
              message: `${resolved.info.reason} Selecione o CRS de origem manualmente; mapa e cálculos permanecem bloqueados.`,
            },
          ],
    };
  } catch (error) {
    throw new Error(
      `Shapefile inválido: ${error instanceof Error ? error.message : "falha na leitura dos componentes"}`,
    );
  }
}
