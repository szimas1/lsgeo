import { useState } from "react";
import type { Dataset, FeatureResult, Issue } from "@/lib/geo/types";

export const number = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
export const areaLabel = (value: number) => `${number(value / 10000, 4)} ha`;
export const distanceLabel = (value: number) =>
  value >= 1000 ? `${number(value / 1000, 3)} km` : `${number(value)} m`;
export function Attributes({ feature }: { feature: FeatureResult }) {
  return (
    <div className="attribute-detail">
      <strong>
        Feature {feature.index + 1} · ID {feature.id}
      </strong>
      <p>{feature.type}</p>
      {feature.measurement?.bounds && (
        <p>
          BBox ({feature.measurement.coordinateCrs}):{" "}
          {feature.measurement.bounds.map((n) => number(n, 6)).join(" / ")}
        </p>
      )}
      {feature.measurement?.centroid && (
        <p>
          Centro dos vértices ({feature.measurement.coordinateCrs}):{" "}
          {feature.measurement.centroid.map((n) => number(n, 6)).join(", ")}
        </p>
      )}
      <dl>
        {Object.entries(feature.properties || {}).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              {typeof value === "object"
                ? JSON.stringify(value)
                : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      {!Object.keys(feature.properties || {}).length && (
        <p className="muted">Sem atributos.</p>
      )}
      {feature.issues.map((issue, i) => (
        <p key={i} className={`issue ${issue.severity}`}>
          {issue.message}
        </p>
      ))}
    </div>
  );
}
function Diagnostics({ issues }: { issues: Issue[] }) {
  const [limit, setLimit] = useState(50);
  return (
    <>
      <ul className="diagnostics">
        {issues.slice(0, limit).map((issue, i) => (
          <li key={i} className={`issue ${issue.severity}`}>
            <b>{issue.severity}</b>{" "}
            {issue.feature !== undefined && `· Feature ${issue.feature + 1}: `}
            {issue.message}
          </li>
        ))}
      </ul>
      {issues.length > limit && (
        <button onClick={() => setLimit(limit + 50)}>
          Mostrar mais diagnósticos ({issues.length - limit})
        </button>
      )}
    </>
  );
}
export default function DatasetPanel({
  dataset,
  layer,
  onSelect,
}: {
  dataset: Dataset;
  layer: "A" | "B";
  onSelect: (layer: "A" | "B", index: number) => void;
}) {
  const [page, setPage] = useState(0);
  const issues = [
    ...dataset.issues,
    ...dataset.features.flatMap((f) => f.issues),
  ];
  const valid = dataset.features.filter((f) => f.measurement).length;
  const m = dataset.totals;
  return (
    <section className="panel dataset-panel">
      <div className="section-heading">
        <h2>
          <span className={`layer-badge ${layer.toLowerCase()}`}>{layer}</span>{" "}
          Resultados da camada
        </h2>
        <span className="tag">{dataset.format}</span>
      </div>
      <p className="filename">{dataset.name}</p>
      <p className="muted">CRS de origem: {dataset.crs}</p>
      <p className="muted">Visualização: EPSG:4326</p>
      {dataset.trustedCrs && <p className="muted">Operações: {dataset.analysis.crs} · {dataset.analysis.method === "projected" ? "plano da projeção" : "segmentos em longitude/latitude"}</p>}
      <p className="muted">Medições: {dataset.trustedCrs ? dataset.analysis.description : "bloqueadas até definir o CRS"}</p>
      <p>
        {dataset.features.length} features · {valid} utilizáveis ·{" "}
        {[...new Set(dataset.features.map((f) => f.type))].join(", ") ||
          "Coleção vazia"}
      </p>
      <div className="metrics">
        <div>
          <small>
            Área somada {valid !== dataset.features.length && "(parcial)"}
          </small>
          <strong>{valid ? areaLabel(m.area) : "—"}</strong>
          <span>
            {valid
              ? `${number(m.area)} m² · ${number(m.area / 1e6, 6)} km²`
              : "Sem geometrias medidas"}
          </span>
        </div>
        <div>
          <small>Área ocupada, sem dupla contagem</small>
          <strong>
            {dataset.occupied === null || !valid
              ? "—"
              : areaLabel(dataset.occupied)}
          </strong>
          <span>União dos polígonos utilizáveis</span>
        </div>
        <div>
          <small>Perímetro dos polígonos</small>
          <strong>{valid ? distanceLabel(m.perimeter) : "—"}</strong>
          <span>Inclui contornos dos buracos</span>
        </div>
        <div>
          <small>Comprimento das linhas</small>
          <strong>{valid ? distanceLabel(m.length) : "—"}</strong>
          <span>{m.points} pontos utilizáveis</span>
        </div>
      </div>
      {dataset.displayBounds && (
        <p className="coordinates">
          BBox WGS84 (oeste, sul, leste, norte):{" "}
          {dataset.displayBounds.map((v) => number(v, 6)).join(" · ")}
        </p>
      )}
      <details open={issues.some((i) => i.severity === "erro")}>
        <summary>
          Diagnóstico{" "}
          <span className="tag">
            {issues.filter((i) => i.severity === "erro").length} erros ·{" "}
            {issues.filter((i) => i.severity === "alerta").length} alertas
          </span>
        </summary>
        {issues.length ? (
          <Diagnostics issues={issues} />
        ) : (
          <p>Nenhum problema detectado pelas verificações implementadas.</p>
        )}
      </details>
      <details>
        <summary>
          Interseções entre features{" "}
          <span className="tag">{dataset.overlaps.length}</span>
        </summary>
        {!dataset.spatialComplete && (
          <p className="issue alerta">
            Análise parcial ou indisponível. Consulte os diagnósticos.
          </p>
        )}
        {dataset.overlaps.length ? (
          <ul className="overlaps">
            {dataset.overlaps.map((o, i) => (
              <li key={i}>
                <button onClick={() => onSelect(layer, o.a)}>
                  Feature {o.a + 1}
                </button>{" "}
                ×{" "}
                <button onClick={() => onSelect(layer, o.b)}>
                  Feature {o.b + 1}
                </button>
                <strong>
                  {o.area > 0
                    ? areaLabel(o.area)
                    : "Contato sem área sobreposta"}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {dataset.occupied !== null
              ? "Nenhuma interseção encontrada entre polígonos utilizáveis."
              : "Análise indisponível."}
          </p>
        )}
      </details>
      <details open>
        <summary>Atributos e medições por feature</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Feature / ID</th>
                <th>Geometria</th>
                <th>Área</th>
                <th>Perímetro / linha</th>
                <th>Status</th>
                <th>Atributos</th>
              </tr>
            </thead>
            <tbody>
              {dataset.features.slice(page * 25, page * 25 + 25).map((f) => (
                <tr key={f.index}>
                  <td>
                    <button onClick={() => onSelect(layer, f.index)}>
                      {f.index + 1} / {f.id}
                    </button>
                  </td>
                  <td>{f.type}</td>
                  <td>{f.measurement ? areaLabel(f.measurement.area) : "—"}</td>
                  <td>
                    {f.measurement
                      ? distanceLabel(
                          f.measurement.perimeter + f.measurement.length,
                        )
                      : "—"}
                  </td>
                  <td>
                    {!f.measurement
                      ? "Excluída"
                      : f.issues.some((i) => i.severity === "alerta")
                        ? "Alerta"
                        : "Utilizável"}
                  </td>
                  <td>
                    <button onClick={() => onSelect(layer, f.index)}>
                      {Object.keys(f.properties || {}).length} campos · abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dataset.features.length > 25 && (
          <div className="pagination">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>
              Página {page + 1} / {Math.ceil(dataset.features.length / 25)}
            </span>
            <button
              disabled={(page + 1) * 25 >= dataset.features.length}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </details>
    </section>
  );
}
