# WKTs reais para testes de CRS

Obtidos do catálogo EPSG via `https://epsg.io/<código>.<formato>` em 2026-09-15; preservados localmente para testes offline.

- 4674, 4326 e 4618: geográficos SIRGAS 2000, WGS84 e SAD69.
- 31978–31985: SIRGAS 2000 / UTM 18S–25S.
- 29191: SAD69 / UTM 21S.
- `*-esriwkt.prj`: WKT1 ESRI, sem códigos EPSG explícitos.
- `31981-wkt2.prj`: WKT2 do mesmo CRS do fixture ESRI 21S.

Esses arquivos definem sistemas de referência; não são dados territoriais governamentais simulados. Os Shapefiles usados nos testes são gerados sinteticamente com `@mapbox/shp-write`.
