import { Worker } from "node:worker_threads";
import path from "node:path";
import { RequestError } from "./errors";
import { SECURITY_POLICY } from "./security-policy";

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
      void worker.terminate().then(
        () => error ? reject(error) : resolve(data!),
        () => reject(new RequestError("El procesamiento se interrumpió.", 500)),
      );
    };
    const abort = () => finish(new RequestError("Conversión cancelada.", 408));
    const timer = setTimeout(() => finish(new RequestError("La conversión superó los 25 segundos.", 408, "conversion_timeout")), SECURITY_POLICY.conversionTimeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    worker.once("message", (result: { ok: boolean; data?: Uint8Array; message?: string }) => {
      if (result.ok && result.data) finish(undefined, result.data);
      else finish(new RequestError(result.message ?? "No se pudo convertir la imagen.", 422));
    });
    worker.once("error", () => finish(new RequestError("No se pudo procesar la imagen.", 422)));
    worker.once("exit", () => { if (!settled) finish(new RequestError("El procesamiento se interrumpió.", 422)); });
  });
}
