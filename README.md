# LSGeo

Aplicação GIS em Next.js para carregar, validar, medir e comparar dados geoespaciais localmente no navegador.

## Executar

Node.js 24 recomendado.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Para produção local: `npm run build` e `npm start`.

## Funcionalidades

- Duas camadas independentes: GeoJSON ou Shapefile em ZIP/componentes soltos.
- Shapefile exige SHP + SHX + DBF; PRJ em WKT reconhecido ou CRS definido manualmente libera mapa e cálculos. CPG opcional. SIRGAS 2000 geográfico/UTM 18S–25S, WGS84 e SAD69 são suportados.
- Mapa MapLibre com pontos, linhas, polígonos, zoom, navegação, enquadramento e inspeção por clique.
- Área em m²/ha/km², perímetro incluindo buracos, comprimento de linhas, contagem de pontos, bbox e centroide dos vértices.
- Diagnósticos por feature, autointerseções, degeneração e duplicatas exatas.
- Interseções internas, área ocupada sem dupla contagem, comparação A × B, interseção e diferenças visualizáveis.
- Atributos preservados e tabela paginada. Processamento em Web Worker com cancelamento e limites.

## Verificação

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes de interface iniciam o **build de produção** na porta 3100 e encerram o servidor depois. Deixe essa porta livre. O mapa-base é bloqueado deliberadamente nos testes para comprovar que os dados locais funcionam sem tiles externos.

Os testes unitários/de integração cobrem medidas numéricas, geometrias, diagnóstico, operações espaciais, Shapefile e WKTs reais. Quatro cenários no Chromium cobrem upload, worker, mapa clicável, atributos, comparação, troca de arquivo, seleção manual de CRS e layout móvel.

## Dados para testar

Em `tests/fixtures/files/` há GeoJSONs sintéticos identificados como dados de teste e um Shapefile ZIP. Carregue `layer-a.geojson` e `layer-b.geojson` nas respectivas camadas: a comparação deve indicar 50% de interseção para cada uma. `invalid.geojson` contém autointerseção; `hole.geojson`, um polígono com buraco.

Para regenerar: `node scripts/generate-geo-fixtures.mjs`. Esses dados não são carregados automaticamente pela aplicação e não representam fontes governamentais.

## Limitações

- Medições em 2D: área/perímetro na grade UTM original; GeographicLib no elipsoide WGS84 para dados geográficos. Origem, análise e visualização são separados. Veja a [investigação de precisão e os controles numéricos](docs/precisao-medicoes.md).
- Diagnóstico não equivale à validação completa GEOS/OGC. Features inválidas são excluídas com indicação de resultados parciais.
- CRS desconhecido bloqueia mapa e medições até a definição manual. Não há grades externas de datum; aproximações de transformação são informadas. Veja [suporte a CRS](docs/crs.md).
- 20 MB por seleção, 5.000 features e 100.000 posições por camada. Operações poligonais têm limites adicionais; consulte a documentação.
- Antimeridiano, latitudes fora da cobertura Web Mercator e GeometryCollection não são processados.
- Não há persistência: recarregar perde as camadas. O mapa-base requer internet; as análises não enviam arquivos a servidor.

Veja [arquitetura, métodos e limites](docs/arquitetura-gis.md) e [roteiro manual](docs/testes-geojson.md).
