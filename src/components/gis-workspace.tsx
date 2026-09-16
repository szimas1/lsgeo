"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useGeoWorker } from "@/hooks/use-geo-worker";
import type { Comparison, Dataset } from "@/lib/geo/types";
import DatasetPanel, { Attributes, areaLabel, number } from "./dataset-panel";
import CrsPanel from "./crs-panel";

const GeoMap = dynamic(() => import("./geo-map"), {
  ssr: false,
  loading: () => <div className="map-shell map-loading">Preparando mapa…</div>,
});
export default function GisWorkspace() {
  const a = useGeoWorker<Dataset>(),
    b = useGeoWorker<Dataset>(),
    comparison = useGeoWorker<Comparison>();
  const [selected, setSelected] = useState<{
    layer: "A" | "B";
    index: number;
  } | null>(null);
  const [overlay, setOverlay] = useState<
    "intersection" | "onlyA" | "onlyB" | "none"
  >("intersection");
  const [names, setNames] = useState({ A: "", B: "" });
  const sourceFiles = useRef<Record<"A" | "B", File[]>>({ A: [], B: [] });
  const select = (layer: "A" | "B", index: number) =>
    setSelected({ layer, index });
  const chosen = selected
    ? (selected.layer === "A" ? a.result : b.result)?.features[selected.index]
    : undefined;
  const c = comparison.result;
  return (
    <main className="gis-app">
      <header className="app-header">
        <Link href="/" className="brand">
          <span className="brand-mark">▧</span> LSGeo
        </Link>
        <span className="header-caption">ANÁLISE GEOESPACIAL</span>
        <span className="tag">Processamento local · Alpha</span>
      </header>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">ÁREA DE TRABALHO</p>
          <h1>Explore seus dados. Entenda seu território.</h1>
          <p className="muted">
            Carregue camadas, inspecione geometrias e compare áreas com dados
            reais.
          </p>
        </div>
      </div>
      <div className="upload-grid">
        {(["A", "B"] as const).map((layer) => {
          const state = layer === "A" ? a : b;
          return (
            <section className="upload-card" key={layer}>
              <div className="section-heading">
                <h2>
                  <span className={`layer-badge ${layer.toLowerCase()}`}>
                    {layer}
                  </span>{" "}
                  Camada {layer}
                </h2>
                {(state.result || state.busy || state.error) && (
                  <button
                    className="text-button"
                    onClick={() => {
                      state.reset();
                      comparison.reset();
                      setSelected(null);
                      setNames((n) => ({ ...n, [layer]: "" }));
                      sourceFiles.current[layer] = [];
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="upload-row">
                <label className="upload-button">
                  {state.busy ? "Substituir seleção" : "Selecionar arquivos"}
                  <input
                    className="sr-only"
                    type="file"
                    multiple
                    accept=".geojson,.json,.shp,.shx,.dbf,.prj,.cpg,.zip"
                    aria-label={`Selecionar arquivos da camada ${layer}`}
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files || []);
                      event.currentTarget.value = "";
                      if (!files.length) return;
                      sourceFiles.current[layer] = files;
                      comparison.reset();
                      setSelected(null);
                      setNames((n) => ({
                        ...n,
                        [layer]: files.map((f) => f.name).join(", "),
                      }));
                      state.run({ kind: "load", files });
                    }}
                  />
                </label>
                <span className="muted filename">
                  {names[layer] || "Nenhum arquivo selecionado"}
                </span>
              </div>
              <p className="upload-help">
                GeoJSON ou Shapefile (.shp + .shx + .dbf + .prj), solto ou ZIP.
                Até 20 MB.
              </p>
              <div aria-live="polite">
                {state.busy && (
                  <p className="processing">
                    Lendo, validando e calculando…{" "}
                    <button onClick={state.reset}>Cancelar</button>
                  </p>
                )}
                {state.error && (
                  <p role="alert" className="issue erro">
                    {state.error}
                  </p>
                )}
                {state.result && (
                  <p className="load-status">
                    {state.result.features.length} features lidas ·{" "}
                    {state.result.mapData.features.length} disponíveis no mapa
                  </p>
                )}
              </div>
              {state.result?.crsInfo && (
                <CrsPanel
                  key={`${layer}-${state.result.crsInfo.source}-${state.result.crs}`}
                  info={state.result.crsInfo}
                  layer={layer}
                  onApply={(code) => {
                    comparison.reset();
                    setSelected(null);
                    state.run({
                      kind: "load",
                      files: sourceFiles.current[layer],
                      manualCrs: code || undefined,
                    });
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
      <GeoMap
        a={a.result}
        b={b.result}
        overlay={c && overlay !== "none" ? c[overlay] : null}
        onSelect={select}
      />
      {chosen && (
        <section className="panel selected-panel">
          <div className="section-heading">
            <h2>Inspeção · Camada {selected?.layer}</h2>
            <button onClick={() => setSelected(null)}>Fechar inspeção</button>
          </div>
          <Attributes feature={chosen} />
        </section>
      )}
      <section className="panel comparison-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ANÁLISE ESPACIAL</p>
            <h2>Comparação A × B</h2>
          </div>
          <button
            className="primary-button"
            disabled={
              !a.result || !b.result || a.busy || b.busy || comparison.busy
            }
            onClick={() =>
              comparison.run({ kind: "compare", a: a.result, b: b.result })
            }
          >
            {comparison.busy ? "Calculando…" : "Comparar camadas"}
          </button>
        </div>
        <p className="muted">
          Compara a união dos polígonos de cada camada, evitando dupla contagem
          interna.
        </p>
        {!a.result || !b.result ? (
          <p>Carregue as duas camadas para analisar interseção e diferenças.</p>
        ) : null}
        {comparison.error && (
          <p className="issue erro" role="alert">
            {comparison.error}
          </p>
        )}
        {c && (
          <div aria-live="polite">
            <p className="muted">Medições: {c.analysis.description}</p>
            <p className="muted">Operações: {c.analysis.crs} · {c.analysis.method === "projected" ? "plano da projeção" : "segmentos em longitude/latitude"}</p>
            <p className="comparison-status">
              {c.intersects
                ? c.intersectionArea
                  ? "Sobreposição detectada"
                  : "As camadas se tocam, sem área sobreposta"
                : "Camadas sem interseção"}
            </p>
            <div className="metrics">
              <div>
                <small>Área ocupada A / B</small>
                <strong>
                  {areaLabel(c.areaA)} / {areaLabel(c.areaB)}
                </strong>
              </div>
              <div>
                <small>Interseção</small>
                <strong>{areaLabel(c.intersectionArea)}</strong>
                <span>{number(c.intersectionArea)} m²</span>
              </div>
              <div>
                <small>Diferença A − B</small>
                <strong>{areaLabel(c.differenceA)}</strong>
              </div>
              <div>
                <small>Diferença B − A</small>
                <strong>{areaLabel(c.differenceB)}</strong>
              </div>
            </div>
            <p>
              <b>{number(c.percentA)}%</b> de A está dentro de B ·{" "}
              <b>{number(c.percentB)}%</b> de B está dentro de A.
            </p>
            <label className="overlay-control">
              Exibir no mapa{" "}
              <select
                value={overlay}
                onChange={(e) => setOverlay(e.target.value as typeof overlay)}
              >
                <option value="intersection">Interseção A ∩ B</option>
                <option value="onlyA">Diferença A − B</option>
                <option value="onlyB">Diferença B − A</option>
                <option value="none">Somente camadas originais</option>
              </select>
            </label>
          </div>
        )}
      </section>
      <div className="results-grid">
        {a.result && (
          <DatasetPanel
            key={`A-${names.A}`}
            dataset={a.result}
            layer="A"
            onSelect={select}
          />
        )}
        {b.result && (
          <DatasetPanel
            key={`B-${names.B}`}
            dataset={b.result}
            layer="B"
            onSelect={select}
          />
        )}
      </div>
      <footer className="workspace-footer">
        Medições em 2D: plano da projeção para UTM; elipsoide WGS84 para dados
        geográficos. Área de grade UTM não é área no terreno. A precisão depende
        dos dados e da transformação de datum. Diagnósticos não substituem uma
        validação topológica completa. Arquivos processados neste navegador; o
        mapa-base consulta OpenStreetMap.
      </footer>
    </main>
  );
}
