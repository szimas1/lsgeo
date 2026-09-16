# CRS de Shapefile

## Correção

O bloqueio anterior exigia `datumName`, um detalhe interno que o proj4 não preenche para todos os WKTs válidos. O PRJ era lido, mas SIRGAS 2000 e outros datums eram rejeitados por essa regra.

Agora `crs.ts` usa a API `proj4.defs` (e o wkt-parser integrado) para interpretar WKT1 ESRI/OGC e WKT2. A identificação considera datum, elipsoide, unidades, meridiano central, origem, escala e falsos leste/norte. Não exige código EPSG textual e não usa o título como prova do fuso. Os parâmetros originais da projeção são preservados. `TOWGS84` explícito tem prioridade sobre parâmetros de transformação do catálogo.

O shpjs lê a geometria nas coordenadas originais, agora preservadas em `originalGeometry`. A reprojeção da cópia de visualização é executada explicitamente pelo proj4: o comportamento interno do shpjs de suprimir erros ao ler PRJ não pode mais produzir um falso sucesso. UTM mantém operações e medições na grade original; dados geográficos usam medição elipsoidal GeographicLib. Consulte a [separação dos CRS e investigação de precisão](precisao-medicoes.md).

## Identificação e escolha manual

- SIRGAS 2000 geográfico: EPSG:4674.
- SIRGAS 2000 / UTM 18S–25S: EPSG:31978–31985.
- WGS84 geográfico e UTM, SAD69 geográfico e UTM, SAD69(96) geográfico.
- Outros WKTs interpretáveis pelo proj4 são aceitos quando há transformação de datum conhecida ou explícita.
- Datum desconhecido e grades externas não disponíveis permanecem bloqueados.

O painel informa o PRJ realmente associado, o CRS, a transformação, o WKT original e o motivo exato de eventual bloqueio. O seletor manual oferece os sistemas do catálogo e reprocessa os arquivos originais, sem transformar novamente uma geometria já convertida. A seleção fica identificada como manual; resultados de comparação anteriores são limpos. É possível voltar à identificação automática.

Componentes são associados pelo nome-base completo, normalizado em Unicode NFC e sem diferenciar maiúsculas/minúsculas. Espaços e acentos são preservados; grafias Unicode equivalentes correspondem. Não são combinados nomes de conjuntos diferentes nem componentes de pastas distintas no ZIP. UTF-8 e UTF-16 com BOM são reconhecidos no PRJ.

Em `npm run dev`, o console do worker registra `[LSGeo CRS]`: nome do PRJ, WKT, CRS identificado, origem manual/automática e transformação. Uma segunda mensagem confirma a transformação aplicada. Esses logs não são emitidos no build de produção.

## Precisão e fontes

A identificação de CRS não torna automaticamente a transformação cadastralmente precisa. SIRGAS 2000 → WGS84 usa a aproximação EPSG:15894, com precisão nominal de 1 m e sem correção por época. Para SAD69 sem transformação explícita, usa-se EPSG:1864, continental, com translações (-57, 1, -41 m) e precisão nominal de 19 m, informada no painel. Transformações locais com grades não são substituídas silenciosamente por uma aproximação.

Referências das definições/operações:

- [API proj4 e interpretação de WKT](https://proj4js.org/).
- [Catálogo EPSG em PROJ, operações de Helmert](https://github.com/OSGeo/PROJ/blob/master/data/sql/helmert_transformation.sql).
- [EPSG:31981 e operação SIRGAS 2000 → WGS84](https://epsg.io/31981).
- [EPSG:4618 e opções de transformação SAD69](https://epsg.io/4618).
- [Sistemas brasileiros e SAD69(96), OSGeo](https://wiki.osgeo.org/wiki/Brazilian_Coordinate_Reference_Systems).

## Regressão

`tests/fixtures/crs/` contém WKTs reais exportados do catálogo EPSG (via EPSG.io), sem depender da rede durante os testes. A maioria está no formato ESRI sem autoridade EPSG; também há WKT2. `tests/crs.test.mjs` verifica fusos, posições de controle, medições, transformação explícita, associação Unicode, ZIP e seleção manual. `tests/e2e/crs.spec.mjs` valida upload simultâneo de cinco componentes, identificação automática, WKT desconhecido, seleção manual, comparação e retorno ao bloqueio automático no build de produção.
