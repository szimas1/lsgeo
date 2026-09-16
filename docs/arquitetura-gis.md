# LSGeo — processamento local

## Organização

- `src/lib/geo/parsing.ts`: formato, leitura, componentes SHP/SHX/DBF, ZIP e CRS.
- `validation.ts`: estrutura, coordenadas, anéis, degeneração e verificações topológicas.
- `measurements.ts`: área, perímetro, comprimento, pontos, bbox e centroide.
- `spatial.ts`: interseções por pares, união e comparação A × B.
- `analyze.ts`: reúne medições e diagnósticos, independente de React.
- `geo.worker.ts`: execução fora da thread da interface.
- `src/hooks/use-geo-worker.ts`: cancelamento, substituição, tempo limite e estado.
- `src/components`: mapa, upload, atributos e resultados. A página apenas compõe a aplicação.
- O utilitário anterior `src/lib/geojson.ts` permanece compatível com seus testes; a aplicação usa o motor completo acima.

## Métodos

`originalGeometry`, `analysisGeometry` e `displayGeometry` separam origem, operações/medições e MapLibre. UTM identificado por parâmetros conserva as coordenadas originais: área plana por Gauss e comprimento euclidiano. Dados geográficos usam área/distância elipsoidal WGS84 pelo GeographicLib, nunca graus como metros. Área desconta buracos; perímetro inclui seus anéis. O centro exibido é a média dos vértices no CRS indicado, não o centro de massa. Não há ajuste por terreno/altitude. Veja [metodologia, limites e auditoria numérica](precisao-medicoes.md).

Uniões, interseções e diferenças usam o recortador planar Turf/polyclip-ts no CRS de análise. Duas camadas UTM no mesmo CRS não passam por WGS84 para essas operações. Para CRS diferentes, a comparação escolhe uma grade comum e transforma a outra camada com aproximação adaptativa das bordas, respeitando limites de domínio e complexidade. Dados geográficos usam recorte de segmentos em longitude/latitude e medição elipsoidal. A comparação usa a união de cada camada para evitar dupla contagem interna. Contato sem área é distinguido de sobreposição. Antimeridiano e regiões fora da cobertura Web Mercator permanecem bloqueados.

Os diagnósticos incluem estrutura, coordenadas finitas, faixas WGS84, cardinalidade, fechamento, posições distintas, área nula de anéis, autointerseções (`kinks`), `booleanValid`, buracos fora do exterior, sobreposição de buracos e partes de MultiPolygon. Não representam certificação completa de validade OGC. Duplicatas são geometrias com a mesma sequência de coordenadas, independentemente dos atributos; equivalência com ordem diferente não é afirmada.

Features excluídas continuam na tabela com atributos e diagnóstico. Totais usam somente features utilizáveis e são rotulados como parciais quando necessário. Comparação A × B é bloqueada quando há exclusões, CRS inseguro ou análise espacial incompleta. Camadas com apenas pontos/linhas não participam da comparação poligonal.

## Limites por camada

| Recurso | Limite |
| --- | --- |
| Arquivos selecionados | 20 MB somados |
| ZIP expandido | 60 MB / 100 entradas |
| Features | 5.000 |
| Posições | 100.000 |
| Vértices por feature poligonal para validação | 3.000 |
| Sobreposição/união | 150 polígonos / 15.000 vértices |
| Tempo por operação | 45 segundos; worker encerrado |

## CRS e Shapefile

GeoJSON sem CRS legado usa a convenção RFC 7946: WGS84, longitude primeiro. CRS legado explicitamente incompatível é bloqueado. Coordenadas plausíveis não provam a origem do dado; cabe ao arquivo seguir a convenção declarada.

Shapefile exige SHP, SHX e DBF com o mesmo nome-base (case insensitive, Unicode normalizado). PRJ reconhecido ou definição manual do CRS libera mapa e medições; CPG é opcional para codificação de atributos. O ZIP deve conter um único conjunto. O parser verifica cabeçalhos, quantidade de registros e offsets do SHX. A leitura binária é feita pelo shpjs.

PRJ em WKT1/WKT2 é interpretado pelo proj4. SIRGAS 2000, WGS84, SAD69 e parâmetros UTM são identificados sem exigir código EPSG textual. A reprojeção usa proj4 explicitamente sobre a geometria original, fora do shpjs. WKT desconhecido é mostrado para diagnóstico e pode ser substituído por uma escolha manual de CRS. Grades externas e épocas de referência não são resolvidas automaticamente. Veja [CRS, métodos de transformação e precisão](crs.md).

## Dependências e compatibilidade

- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/): mapa WebGL carregado somente no navegador com `next/dynamic`. Seus dois arquivos de worker são copiados do pacote instalado para `public/maplibre` antes de dev/build, conforme a integração oficial com Next.js/Turbopack.
- [Turf](https://turfjs.org/docs/api/intersect): recortes planares e validações executados no worker, sem área/comprimento esféricos.
- [GeographicLib](https://geographiclib.sourceforge.io/html/js/): medições geodésicas no elipsoide para o caminho geográfico.
- [shpjs](https://github.com/calvinmetcalf/shapefile-js): parser Shapefile carregado sob demanda.
- [proj4](https://proj4js.org/): interpretação de projeções e transformação de coordenadas.
- [fflate](https://github.com/101arrowz/fflate): extração de ZIP com limites antes da descompactação.
- `tsx`, Playwright e `@mapbox/shp-write`: dependências de desenvolvimento para testes e geração de fixtures.

O mapa-base usa tiles públicos do OpenStreetMap, sem chave paga. Uma falha no fundo não impede renderizar os dados locais. Uso público em escala demanda um provedor de tiles adequado ou hospedagem própria. Nenhum arquivo é enviado a servidor; somente as requisições normais do mapa-base saem do navegador. Recarregar a página perde as camadas.

## Evoluções com infraestrutura

Arquivos maiores e validação topológica completa: serviço com GDAL/GEOS/PostGIS e filas. Transformações de alta precisão: catálogo de CRS, grades de datum e controle de épocas. Persistência e colaboração: armazenamento e backend. Fontes governamentais: integrações reais; nenhuma foi simulada.
