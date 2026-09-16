"use client";
import { useEffect, useRef, useState } from "react";
import {
  Map as LibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { Bounds, Dataset, PolygonFeature } from "@/lib/geo/types";
import { mergeBounds } from "@/lib/geo/measurements";

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
export default function GeoMap({
  a,
  b,
  overlay,
  onSelect,
}: {
  a: Dataset | null;
  b: Dataset | null;
  overlay: PolygonFeature | null;
  onSelect: (layer: "A" | "B", index: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const selectRef = useRef(onSelect);
  const bounds = useRef<Bounds | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!container.current) return;
    let map: LibreMap;
    try {
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new LibreMap({
        container: container.current,
        center: [-55, -15],
        zoom: 3,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 19,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#e8eeeb" },
            },
            {
              id: "osm",
              type: "raster",
              source: "osm",
              paint: { "raster-saturation": -0.65 },
            },
          ],
        },
      });
      mapRef.current = map;
      map.addControl(new NavigationControl(), "top-right");
      map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
      map.on("error", (event) => {
        if ("sourceId" in event && event.sourceId === "osm")
          setError(
            "Fundo cartográfico indisponível. As camadas locais continuam disponíveis.",
          );
        else
          setError(
            "Falha ao renderizar o mapa. Os resultados permanecem disponíveis nos painéis.",
          );
      });
      // Camadas locais não dependem de o servidor de tiles terminar de carregar.
      map.on("style.load", () => {
        for (const [id, color] of [
          ["A", "#097b70"],
          ["B", "#bb6726"],
          ["result", "#9845bf"],
        ]) {
          map.addSource(id, { type: "geojson", data: empty });
          map.addLayer({
            id: `${id}-fill`,
            source: id,
            type: "fill",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": color,
              "fill-opacity": id === "result" ? 0.55 : 0.23,
            },
          });
          map.addLayer({
            id: `${id}-line`,
            source: id,
            type: "line",
            filter: ["!=", ["geometry-type"], "Point"],
            paint: { "line-color": color, "line-width": 2.5 },
          });
          map.addLayer({
            id: `${id}-point`,
            source: id,
            type: "circle",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-color": color,
              "circle-radius": 6,
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 2,
            },
          });
        }
        const layers = ["A", "B"].flatMap((id) => [
          `${id}-fill`,
          `${id}-line`,
          `${id}-point`,
        ]);
        map.on("click", (event) => {
          const hit = map.queryRenderedFeatures(event.point, { layers })[0];
          if (hit && typeof hit.properties.featureIndex === "number")
            selectRef.current(
              hit.source as "A" | "B",
              hit.properties.featureIndex,
            );
        });
        map.on("mousemove", (event) => {
          map.getCanvas().style.cursor = map.queryRenderedFeatures(
            event.point,
            { layers },
          ).length
            ? "pointer"
            : "";
        });
        setReady(true);
      });
    } catch {
      // Falha da API externa durante a inicialização, não estado derivado da renderização.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        "WebGL não está disponível neste navegador. As análises continuam disponíveis abaixo.",
      );
    }
    return () => {
      map?.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("A") as GeoJSONSource).setData(a?.mapData || empty);
    (map.getSource("B") as GeoJSONSource).setData(b?.mapData || empty);
    bounds.current = mergeBounds(
      a?.displayBounds || null,
      b?.displayBounds || null,
    );
    if (bounds.current)
      map.fitBounds(bounds.current, {
        padding: 65,
        maxZoom: 16,
        duration: 700,
      });
  }, [a, b, ready]);
  useEffect(() => {
    if (ready && mapRef.current)
      (mapRef.current.getSource("result") as GeoJSONSource).setData(
        overlay || empty,
      );
  }, [overlay, ready]);
  return (
    <div className="map-shell">
      <div
        ref={container}
        className="map-canvas"
        aria-label="Mapa interativo das camadas geoespaciais"
      />
      <button
        className="map-fit"
        onClick={() => {
          if (bounds.current)
            mapRef.current?.fitBounds(bounds.current, {
              padding: 65,
              maxZoom: 16,
            });
        }}
      >
        Enquadrar camadas
      </button>
      <div className="map-legend">
        <span className="dot a" /> Camada A <span className="dot b" /> Camada B{" "}
        {overlay && (
          <>
            <span className="dot result" /> Resultado
          </>
        )}
      </div>
      {!a && !b && (
        <div className="map-hint">
          Carregue uma camada para começar a análise
        </div>
      )}
      {error && (
        <p className="map-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
