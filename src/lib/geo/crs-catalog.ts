export interface CrsOption {
  code: string;
  label: string;
  definition: string;
}

// Definições e operações de datum do catálogo EPSG/PROJ; ver docs/crs.md.
export const CRS_OPTIONS: CrsOption[] = [
  {
    code: "EPSG:4674",
    label: "SIRGAS 2000 geográfico",
    definition: "+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +no_defs",
  },
  {
    code: "EPSG:4326",
    label: "WGS84 geográfico",
    definition: "+proj=longlat +datum=WGS84 +no_defs",
  },
  {
    code: "EPSG:4618",
    label: "SAD69 geográfico",
    definition:
      "+proj=longlat +a=6378160 +rf=298.25 +towgs84=-57,1,-41 +no_defs",
  },
  {
    code: "EPSG:5527",
    label: "SAD69(96) geográfico",
    definition:
      "+proj=longlat +a=6378160 +rf=298.25 +towgs84=-67.35,3.88,-38.22 +no_defs",
  },
  ...Array.from({ length: 8 }, (_, i) => {
    const zone = i + 18;
    return {
      code: `EPSG:${31960 + zone}`,
      label: `SIRGAS 2000 / UTM zone ${zone}S`,
      definition: `+proj=utm +zone=${zone} +south +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`,
    };
  }),
  ...Array.from({ length: 8 }, (_, i) => {
    const zone = i + 18;
    return {
      code: `EPSG:${32700 + zone}`,
      label: `WGS84 / UTM zone ${zone}S`,
      definition: `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`,
    };
  }),
  {
    code: "EPSG:3857",
    label: "WGS84 / Pseudo-Mercator",
    definition:
      "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs",
  },
  ...Array.from({ length: 8 }, (_, i) => {
    const zone = i + 18;
    return {
      code: `EPSG:${29170 + zone}`,
      label: `SAD69 / UTM zone ${zone}S`,
      definition: `+proj=utm +zone=${zone} +south +a=6378160 +rf=298.25 +towgs84=-57,1,-41 +units=m +no_defs`,
    };
  }),
];
