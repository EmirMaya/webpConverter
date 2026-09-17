import { Worker } from "node:worker_threads";
import path from "node:path";

export class RequestError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export function convertInWorker(input: Uint8Array, quality: number, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new RequestError("Conversión cancelada.", 408));
    const worker = new Worker(path.join(process.cwd(), "src/workers/convert.mjs"), {
      workerData: { input, quality },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let settled = false;
    const finish = (error?: Error, data?: Uint8Array) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void worker.terminate().finally(() => error ? reject(error) : resolve(data!));
    };
    const abort = () => finish(new RequestError("Conversión cancelada.", 408));
    const timer = setTimeout(() => finish(new RequestError("La conversión superó los 30 segundos.", 408)), 30_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.once("message", (result: { ok: boolean; data?: Uint8Array; message?: string }) => {
      if (result.ok && result.data) finish(undefined, result.data);
      else finish(new RequestError(result.message ?? "No se pudo convertir la imagen.", 422));
    });
    worker.once("error", () => finish(new RequestError("No se pudo procesar la imagen.", 422)));
    worker.once("exit", () => { if (!settled) finish(new RequestError("El procesamiento se interrumpió.", 422)); });
  });
}
