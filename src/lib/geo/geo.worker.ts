import { parseFiles } from "./parsing";
import { analyzeDataset } from "./analyze";
import { compareDatasets } from "./spatial";
import type { Dataset } from "./types";

type Request =
  | { kind: "load"; files: File[]; manualCrs?: string }
  | { kind: "compare"; a: Dataset; b: Dataset };
self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const request = event.data;
    const result =
      request.kind === "load"
        ? analyzeDataset(await parseFiles(request.files, request.manualCrs))
        : compareDatasets(request.a, request.b);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível processar os dados.",
    });
  }
};
