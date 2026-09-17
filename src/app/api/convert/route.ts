import { acquireConversion } from "@/server/admission";
import { convertInWorker, RequestError } from "@/server/convert-worker";
import { readUpload } from "@/server/read-upload";
import { DEFAULT_QUALITY, MAX_FILE_BYTES } from "@/shared/policy.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new RequestError("Origen de solicitud no permitido.", 403);
    if (request.headers.get("content-type") !== "application/octet-stream") throw new RequestError("Enviá el archivo como application/octet-stream.", 415);
    const rawQuality = url.searchParams.get("quality");
    const quality = rawQuality === null ? DEFAULT_QUALITY : Number(rawQuality);
    if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new RequestError("La calidad debe ser un entero entre 1 y 100.");
    release = acquireConversion();
    const bytes = await readUpload(request);
    const result = await convertInWorker(bytes, quality, request.signal);
    if (result.byteLength > MAX_FILE_BYTES) throw new RequestError("El WebP generado supera el límite de 20 MB.", 422);
    return new Response(new Uint8Array(result), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": 'attachment; filename="imagen.webp"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    return Response.json({ error: error instanceof RequestError ? error.message : "No se pudo completar la conversión." }, {
      status,
      headers: { "Cache-Control": "no-store", ...([429, 503].includes(status) ? { "Retry-After": status === 429 ? "60" : "3" } : {}) },
    });
  } finally { release?.(); }
}
