# Testes manuais do LSGeo

Execute `npm run dev` e abra http://localhost:3000. Use os arquivos sintéticos de `tests/fixtures/files/`.

| Caso | Arquivo / ação | Resultado esperado |
| --- | --- | --- |
| Polygon | `polygon.geojson` | 1 feature, cerca de 123,0907 ha e 4,438 km de perímetro elipsoidal WGS84; polígono no mapa |
| MultiPolygon | `multipolygon.geojson` | Duas partes no mapa, cerca de 247,2869 ha |
| Buraco | `hole.geojson` | Centro vazado, área descontada e perímetro interno incluído |
| Linha | `line.geojson` | Cerca de 1,112 km |
| Ponto | `point.geojson` | 1 ponto e bbox |
| Sobreposição interna | `overlapping.geojson` | Conflito entre features 1 e 2, cerca de 61,8217 ha |
| Sem sobreposição | `disjoint.geojson` | Sem conflitos internos |
| Camadas A × B | `layer-a.geojson` em A e `layer-b.geojson` em B | 50% de interseção em ambas; diferenças desenhadas ao selecionar |
| Autointerseção | `invalid.geojson` | Diagnóstico de erro, sem medição da feature inválida |
| Geometria nula | `null-geometry.geojson` | Atributos disponíveis, geometria excluída |
| Coleção vazia | `empty.geojson` | Zero features, sem quebra |
| Shapefile | `polygon.zip` | Mesmo resultado do Polygon, CRS WGS84 |
| Componentes soltos | Extraia o ZIP e selecione SHP + SHX + DBF + PRJ | Mesmo resultado do ZIP |
| PRJ ausente | Selecione componentes sem PRJ | Atributos disponíveis; mapa e medições bloqueados |
| SHX ausente | Selecione componentes sem SHX | Erro de conjunto incompleto |
| JSON inválido | Salve `{` em `erro.json` | Mensagem de JSON inválido |
| JSON comum | Salve `{"nome":"LSGeo"}` em `erro.json` | Mensagem exigindo FeatureCollection |
| Arquivo vazio | Selecione `.json` sem conteúdo | Mensagem de arquivo vazio |

Verifique também:

- Clique no polígono e abra seus atributos; use os botões da tabela para inspecionar a mesma feature.
- Troque A por um arquivo inválido após comparar: os resultados antigos de A e da comparação devem desaparecer.
- Reenvie o mesmo arquivo, cancele o seletor ou substitua uma seleção durante processamento.
- Use Cancelar durante uma operação: o worker deve encerrar.
- Remova uma camada e confira a atualização do mapa e da comparação.
- Desative a rede após abrir a aplicação: os arquivos locais continuam analisáveis mesmo sem mapa-base.
- Teste janela estreita (390 px), navegação por Tab, zoom, pan e Enquadrar camadas.

Testes automatizados: `npm test`; testes no build de produção: `npm run build` e `npm run test:e2e`.
