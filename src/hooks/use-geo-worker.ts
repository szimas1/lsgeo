"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useGeoWorker<T>() {
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => stop, [stop]);
  const reset = useCallback(() => {
    stop();
    setResult(null);
    setError(null);
    setBusy(false);
  }, [stop]);
  const run = useCallback(
    (request: unknown) => {
      stop();
      setResult(null);
      setError(null);
      setBusy(true);
      try {
        const current = new Worker(
          new URL("../lib/geo/geo.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current = current;
        const fail = (message: string) => {
          if (worker.current !== current) return;
          stop();
          setError(message);
          setBusy(false);
        };
        timer.current = setTimeout(
          () =>
            fail(
              "Processamento excedeu 45 segundos. Reduza a camada ou processe-a em uma ferramenta GIS externa.",
            ),
          45000,
        );
        current.onmessage = (
          event: MessageEvent<{ ok: boolean; result: T; error: string }>,
        ) => {
          if (worker.current !== current) return;
          if (event.data.ok) {
            setResult(event.data.result);
            stop();
            setBusy(false);
          } else fail(event.data.error);
        };
        current.onerror = () =>
          fail(
            "Falha no processamento geoespacial. Tente um arquivo menor ou verifique sua estrutura.",
          );
        current.postMessage(request);
      } catch {
        stop();
        setBusy(false);
        setError("Não foi possível iniciar o processamento no navegador.");
      }
    },
    [stop],
  );
  return { result, error, busy, run, reset };
}
