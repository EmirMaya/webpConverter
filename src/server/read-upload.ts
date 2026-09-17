import { MAX_FILE_BYTES } from "../shared/policy.js";
import { RequestError } from "./convert-worker";

export async function readUpload(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_FILE_BYTES)) throw new RequestError("La imagen supera el límite de 20 MB.", 413);
  if (!request.body) throw new RequestError("Adjuntá una imagen.");
  const reader = request.body.getReader();
  let timedOut = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  const timer = setTimeout(() => { timedOut = true; abort(); }, 30_000);
  request.signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (request.signal.aborted || timedOut) throw new RequestError("La carga se interrumpió o tardó demasiado.", 408);
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) { abort(); throw new RequestError("La imagen supera el límite de 20 MB.", 413); }
      chunks.push(value);
    }
    if (request.signal.aborted || timedOut) throw new RequestError("La carga se interrumpió o tardó demasiado.", 408);
    if (!total) throw new RequestError("La imagen está vacía.");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
