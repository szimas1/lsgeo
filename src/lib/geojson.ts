// Validamos somente a estrutura necessária para o resumo desta etapa Alpha.
interface GeoJsonFeature {
  type: "Feature";
  geometry?: unknown;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export interface GeoJsonSummary {
  type: "FeatureCollection";
  featureCount: number;
  geometryTypes: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateGeoJson(value: unknown): value is GeoJsonFeatureCollection {
  return (
    isObject(value) &&
    value.type === "FeatureCollection" &&
    Array.isArray(value.features) &&
    value.features.every((feature: unknown) =>
      isObject(feature) && feature.type === "Feature"
    )
  );
}

function getGeometryTypes(features: GeoJsonFeature[]): string[] {
  const types = new Set<string>();
  const supportedTypes = [
    "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon",
  ];

  for (const feature of features) {
    const geometry = feature.geometry;

    if (geometry === null || geometry === undefined) {
      types.add("Sem geometria");
    } else if (
      isObject(geometry) &&
      typeof geometry.type === "string" &&
      supportedTypes.includes(geometry.type)
    ) {
      types.add(geometry.type);
    } else {
      types.add("Desconhecida ou não suportada");
    }
  }

  return [...types];
}

export function parseGeoJson(content: string): GeoJsonSummary {
  if (content.trim() === "") {
    throw new Error("O arquivo está vazio. Selecione um arquivo GeoJSON com conteúdo.");
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error("Não foi possível ler o arquivo. Verifique se o JSON é válido.");
  }

  if (!validateGeoJson(data)) {
    throw new Error(
      "O arquivo não possui uma estrutura GeoJSON válida. Use FeatureCollection com features em um array de objetos do tipo Feature.",
    );
  }

  return {
    type: data.type,
    featureCount: data.features.length,
    geometryTypes: getGeometryTypes(data.features),
  };
}
