# Precisão de área e separação dos CRS

## Diagnóstico

O fluxo anterior lia as coordenadas do SHP, convertia os vértices para WGS84, descartava a geometria UTM, fazia união/interseção/diferença nesse plano longitude/latitude e media os resultados com `Turf.area`/`Turf.length`.

Há três efeitos distintos:

1. **Modelo de medição:** Turf usa uma esfera de raio 6.371.008,8 m. Área esférica, área elipsoidal e área da grade UTM são grandezas diferentes. A diferença varia com latitude, distância ao meridiano central e geometria; não existe fator constante que resolva o problema.
2. **Plano de recorte:** `Turf.intersect`, `difference` e `union` usam `polyclip-ts`, um recortador planar. Transformar somente os vértices e unir seus destinos por segmentos retos altera as bordas, pois uma projeção não preserva retas em geral. Recortar esses segmentos em longitude/latitude pode alterar a interseção, mesmo que depois se meça de volta em UTM.
3. **Erro numérico da transformação:** o arredondamento de uma ida/volta proj4 é outro efeito, separado dos anteriores. Nos controles abaixo é muito menor, mas isso não demonstra a precisão de datum/época dos dados reais.

Os Shapefiles do caso relatado (324.254 versus 323.667 m², valores aproximados) não estão disponíveis no repositório. Logo, **não foi reproduzida nem atribuída exatamente a diferença de 587 m²**. A metodologia anterior era incompatível com a comparação com área plana UTM e foi corrigida sem calibrar números para esse exemplo.

## Contrato das geometrias

| Campo | CRS / finalidade |
| --- | --- |
| `originalGeometry` | Cópia das coordenadas de origem; não passa por ida/volta para medir UTM |
| `analysisGeometry` | Geometria usada para validação, recortes e medição no contexto escolhido |
| `displayGeometry` | WGS84 longitude/latitude, exclusivo para MapLibre |
| `Dataset.sourceProjection`, `crs` | Definição de origem e nome legível |
| `Dataset.analysis` | Projeção, método, unidades e descrição explícitos |
| `Dataset.displayCrs`, `displayBounds`, `mapData` | EPSG:4326; o enquadramento nunca recebe bbox UTM |
| `FeatureResult.feature` | Alias de compatibilidade para a feature de visualização; não é entrada das operações |
| `Dataset.union` | União na geometria de análise, não para renderização direta |
| `Comparison.analysisIntersection`, `analysisOnlyA/B` | Resultados no CRS comum de análise |
| `Comparison.intersection`, `onlyA/B` | Cópias convertidas para exibição |

O parser conserva tanto a geometria original quanto a cópia WGS84; `rawFeatures` continua contendo a cópia para visualização por compatibilidade. CRS desconhecido conserva a geometria original para diagnóstico, mas bloqueia análise e mapa.

## Métodos implementados

### UTM identificado pelos parâmetros

Parâmetros da projeção, unidades, meridiano de Greenwich, escala 0,9996 e falsos leste/norte determinam se o CRS é UTM. Um título contendo “UTM” não basta. SIRGAS 2000 UTM 18S–25S, WGS84 UTM e SAD69 UTM seguem este caminho.

- Validação e recorte planar sobre coordenadas UTM originais. A validação da cópia para o mapa mantém as restrições de cobertura e coordenadas já existentes.
- Área por fórmula de Gauss (*shoelace*), com origem transladada e soma compensada para reduzir cancelamento numérico em coordenadas grandes. Exterior menos buracos, independente do sentido dos anéis; soma das partes.
- Perímetro e comprimento por distância euclidiana em metros, incluindo contornos dos buracos. Altitude não participa.
- União, interseção e diferenças pelo recortador planar do Turf/polyclip-ts **nesse mesmo plano**. Nenhuma chamada a `Turf.area` ou `Turf.length` no motor de medição.
- O resultado é **área/distância de grade**, não área/distância no terreno ou sobre o elipsoide. A escala UTM varia espacialmente; não foi aplicada “correção” para forçar equivalência entre grandezas.
- Dados fora da faixa nominal do fuso recebem diagnóstico; o método continua explicitamente o da grade declarada.

### Origem geográfica e outras projeções

GeoJSON RFC 7946 permanece WGS84. Projeções não reconhecidas como UTM adequado, incluindo Web Mercator, são convertidas para WGS84 para medição elipsoidal. Ter unidades em metros não torna Web Mercator apropriado para área cadastral.

`GeographicLib` calcula área e distâncias no elipsoide WGS84 pelo algoritmo geodésico de Karney. Nunca se interpreta grau como metro. O recorte de dados geográficos continua seguindo segmentos retos em longitude/latitude, conforme a representação do GeoJSON; a medição considera segmentos geodésicos entre os vértices resultantes. Portanto, inserir vértices em uma borda geográfica pode alterar ligeiramente a área geodésica, e áreas antes/depois de recortes não têm identidade algébrica exata. Para comparação cadastral plana, use dados no CRS projetado apropriado. Não se afirma equivalência desse caminho com recortes geodésicos ou com segmentos UTM originais que um GeoJSON já não contém.

### Camadas em CRS diferentes

A comparação escolhe a grade UTM de A quando disponível; caso contrário, a de B; se nenhuma é UTM, usa o contexto geográfico. Reprojeta a outra união antes do recorte e recalcula **todas** as áreas e percentuais nesse contexto comum. As áreas da comparação podem, portanto, diferir dos totais individuais medidos em outra grade. A escolha de grade está visível; trocar A/B pode mudar a grade escolhida.

Ao transformar bordas entre contextos, subdivide segmentos adaptativamente usando desvio nos pontos 1/4, 1/2 e 3/4: tolerância de 0,001 m na grade de destino (ou 1e-8 grau para destino geográfico), até 20 níveis e 15.000 vértices. Isso controla aproximação de curvas, **não** precisão do datum ou erro absoluto de área. A comparação cruzada é bloqueada se a outra camada ultrapassa a faixa nominal do fuso/hemisfério escolhido. Nesse caso deve-se preparar ambas em um CRS comum apropriado em um SIG.

Transformações de datum continuam com as limitações declaradas em [crs.md](crs.md). Em duas camadas no mesmo UTM/datum, a aproximação SIRGAS→WGS84 para o mapa não entra na área da grade. SAD69, épocas e grades de transformação exigem atenção quando se cruzam referenciais distintos. A implementação não certifica conformidade SIGEF/SICAR nem substitui os requisitos específicos dessas bases.

## Experimento reproduzível

Execute `npx tsx scripts/audit-measurements.mjs`. Dois controles sintéticos em EPSG:31981: triângulo de catetos 1.000 m e retângulo deslocado 250 m a leste e 100 m ao norte. A interseção tem catetos de 650 m: área analítica **211.250 m²**. O leste inicial é 650.000 m; somente a posição norte muda.

| Medição / etapa (m²) | N = 8.300.000 | N = 6.700.000 |
| --- | ---: | ---: |
| Interseção UTM, método atual | 211.250,000000 | 211.250,000000 |
| Interseção UTM → WGS84 → UTM, medida na grade | 211.250,000000416 | 211.250,000000227 |
| Recorte em lon/lat, retornado e medido na grade | 211.254,461575 | 211.259,047046 |
| Interseção UTM convertida, medida no elipsoide | 211.300,792368 | 211.301,072806 |
| Interseção UTM convertida, medida na esfera | 212.053,030820 | 211.553,971598 |
| Fluxo antigo completo: recorte lon/lat + esfera | 212.057,509362 | 211.563,031698 |

Esses resultados isolam os efeitos do modelo de área e do plano de recorte. Não são uma reprodução do arquivo do usuário nem uma estimativa universal de erro.

## Como comparar com QGIS

Use os mesmos arquivos, datum, CRS de processamento e opções de precisão, sem reparos/simplificações diferentes. Para testar este caminho UTM, execute a interseção em EPSG:31981 e compare a área **planimétrica** da geometria nesse CRS (por exemplo, `area($geometry)` com a camada efetivamente nesse CRS). `$area` respeita as configurações de elipsoide/unidades do projeto; selecionar EPSG:31981 no mapa, por si só, não prova que a medição foi plana. Compare também contagem de partes, buracos, validade e soma das áreas das diferenças.

## Testes e tolerâncias

`tests/measurement-precision.test.mjs` inclui os oito fusos SIRGAS, retângulos com área analítica, recorte oblíquo, conservação de área UTM, buracos, MultiPolygon, orientação invertida, linhas 3–4–5, quadrado de 1 cm com northing grande, ida/volta de projeção, comparação entre fusos, bloqueio fora do domínio, Web Mercator e referência geográfica independente por integração do elipsoide. A tolerância usual da aritmética UTM é 1e-6 m²; ida/volta, 0,001 m²; comparação entre fusos do controle, 0,2 m². Não são garantias de acurácia posicional dos arquivos.

Em desenvolvimento, `[LSGeo analysis]` registra CRS de origem/análise/exibição, área de análise e área elipsoidal da cópia de exibição. O script de auditoria mantém o método antigo somente para diagnóstico; o aplicativo não o usa para corrigir ou ajustar resultados.

## Referências

- [Turf — área](https://turfjs.org/docs/api/area) e [raio esférico](https://turfjs.org/docs/next/api/constants/earthRadius).
- [Código do recorte Turf](https://github.com/Turfjs/turf/blob/master/packages/turf-intersect/index.ts).
- [GeographicLib JavaScript — algoritmos e exemplos](https://geographiclib.sourceforge.io/html/js/).
- [PROJ — projeções e escala UTM](https://proj.org/en/stable/tutorials/EUREF2019/exercises/projections3.html).
- [QGIS — funções `area` e `$area`](https://docs.qgis.org/3.40/en/docs/user_manual/expressions/functions_list.html).
