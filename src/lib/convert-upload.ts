export class UploadError extends Error {
  constructor(message: string, public readonly pauseBatch = false) { super(message); }
}

export function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

interface UploadDependencies {
  fetch: typeof fetch;
  wait: typeof waitForRetry;
}

export async function convertUpload(
  file: File, quality: number, signal: AbortSignal,
  onWait: (seconds: number) => void,
  deps: UploadDependencies = { fetch: globalThis.fetch.bind(globalThis), wait: waitForRetry },
): Promise<Blob> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await deps.fetch(`/api/convert?quality=${quality}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file,
      signal: AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
    });
    if (response.ok) return response.blob();
    const payload = await response.json().catch(() => null);
    const transient = response.status === 429 || response.status === 503;
    if (!transient) throw new UploadError(payload?.error || (response.status === 413 ? "La imagen supera el tamaño admitido por el servidor." : `No se pudo convertir (HTTP ${response.status}).`));
    if (attempt === 2) throw new UploadError("El servicio sigue ocupado. Conservamos los pendientes; podés reanudar el lote más tarde.", true);
    const raw = response.headers.get("retry-after");
    const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : 3;
    if (seconds > 120) throw new UploadError("El servicio pidió una pausa prolongada. Reanudá el lote más tarde.", true);
    // A small margin prevents retrying just before a quota window expires.
    onWait(Math.max(1, seconds));
    await deps.wait(Math.max(1, seconds) * 1000 + 250, signal);
  }
  throw new UploadError("No se pudo completar la conversión.");
}
