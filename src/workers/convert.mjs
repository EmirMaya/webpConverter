import { parentPort, workerData } from "node:worker_threads";
import { convertImageBuffer } from "../modules/image-engine.js";

try {
  const result = await convertImageBuffer(Buffer.from(workerData.input), { quality: workerData.quality });
  parentPort.postMessage({ ok: true, data: result });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error instanceof Error ? error.message : "No se pudo convertir la imagen." });
}
