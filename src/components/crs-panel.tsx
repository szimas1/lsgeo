"use client";
import { useState } from "react";
import { CRS_OPTIONS } from "@/lib/geo/crs-catalog";
import type { CrsInfo } from "@/lib/geo/types";

export default function CrsPanel({
  info,
  layer,
  onApply,
}: {
  info: CrsInfo;
  layer: "A" | "B";
  onApply: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="crs-panel">
      <p>
        <strong>
          CRS: {info.label}
          {info.epsg ? ` — ${info.epsg}` : ""}
        </strong>
      </p>
      <p className="muted">
        PRJ: {info.prjName || "Não encontrado"} ·{" "}
        {info.source === "manual"
          ? "Definido manualmente"
          : "Identificação pelo WKT"}
      </p>
      {info.reason && (
        <p className="issue alerta">
          {info.reason} Mapa e cálculos bloqueados até definir o CRS.
        </p>
      )}
      {info.transformation && (
        <p className="coordinates">{info.transformation}</p>
      )}
      {info.warning && <p className="issue alerta">{info.warning}</p>}
      <details open={Boolean(info.reason)}>
        <summary>WKT e definição manual de CRS</summary>
        <pre className="crs-wkt" aria-label={`WKT da camada ${layer}`}>
          {info.wkt || "Nenhum conteúdo WKT disponível."}
        </pre>
        <p className="upload-help">
          Escolha o CRS original dos dados, não o CRS desejado para o mapa. A
          escolha reprocessa os arquivos originais.
        </p>
        <label className="crs-selector">
          CRS de origem da camada {layer}
          <select
            aria-label={`CRS de origem da camada ${layer}`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          >
            <option value="">Selecione o CRS de origem…</option>
            {CRS_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label} — {option.code}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!code} onClick={() => onApply(code)}>
          Aplicar CRS à camada {layer}
        </button>
        {info.source === "manual" && (
          <button onClick={() => onApply("")}>
            Voltar à identificação automática
          </button>
        )}
      </details>
    </div>
  );
}
