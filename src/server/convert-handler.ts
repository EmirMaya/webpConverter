import { randomUUID } from "node:crypto";
import type { AdmissionControl, ConversionPermit } from "./security-contracts";
import { RequestError } from "./errors";
import { DEFAULT_QUALITY, MAX_WEB_FILE_BYTES, MAX_WEB_FILE_MIB } from "../shared/policy.js";

export type ConversionEvent = {
  event: "conversion";
  requestId: string;
  status: number;
  code: string;
  durationMs: number;
  inputBytes: number;
  outputBytes: number;
  releaseFailed: boolean;
};

interface HandlerDependencies {
  admission(): AdmissionControl;
  identify(request: Request): string;
  read(request: Request): Promise<Uint8Array>;
  convert(bytes: Uint8Array, quality: number, signal: AbortSignal): Promise<Uint8Array>;
  report(event: ConversionEvent): void;
}

/** HTTP orchestration depends on narrow ports, not Redis, worker internals or UI. */
export function createConvertHandler(deps: HandlerDependencies) {
  return async (request: Request) => {
    const requestId = randomUUID();
    const started = Date.now();
    let permit: ConversionPermit | undefined;
    const event: ConversionEvent = { event: "conversion", requestId, status: 500, code: "internal_error", durationMs: 0, inputBytes: 0, outputBytes: 0, releaseFailed: false };
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId };
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("origin");
      if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new RequestError("Origen de solicitud no permitido.", 403, "origin");
      if (request.headers.get("content-type") !== "application/octet-stream") throw new RequestError("Enviá el archivo como application/octet-stream.", 415, "content_type");
      const rawQuality = url.searchParams.get("quality");
      const quality = rawQuality === null ? DEFAULT_QUALITY : Number(rawQuality);
      if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new RequestError("La calidad debe ser un entero entre 1 y 100.");
      permit = await deps.admission().acquire(deps.identify(request));
      const bytes = await deps.read(request);
      event.inputBytes = bytes.byteLength;
      await permit.chargeBytes(bytes.byteLength);
      const output = await deps.convert(bytes, quality, request.signal);
      event.outputBytes = output.byteLength;
      if (output.byteLength > MAX_WEB_FILE_BYTES) throw new RequestError(`El WebP supera ${MAX_WEB_FILE_MIB} MiB. Probá con menor calidad o usá la consola.`, 422, "output_size");
      event.status = 200;
      event.code = "converted";
      return new Response(new Uint8Array(output), { headers: { ...headers, "Content-Type": "image/webp", "Content-Disposition": 'attachment; filename="imagen.webp"' } });
    } catch (error) {
      event.status = error instanceof RequestError ? error.status : 500;
      event.code = error instanceof RequestError ? error.code : "internal_error";
      const retryAfter = error instanceof RequestError ? error.retryAfter : undefined;
      return Response.json({ error: error instanceof RequestError ? error.message : "No se pudo completar la conversión.", code: event.code, requestId }, {
        status: event.status,
        headers: { ...headers, ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) },
      });
    } finally {
      try { await permit?.release(); } catch { event.releaseFailed = true; }
      event.durationMs = Date.now() - started;
      // Logging must not change the response or expose file contents/identities.
      try { deps.report(event); } catch { /* observability failure is non-fatal */ }
    }
  };
}
