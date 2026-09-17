import sharp from "sharp";
import heicConvert from "heic-convert";
import { DEFAULT_QUALITY, MAX_FILE_BYTES, MAX_PIXELS } from "../shared/policy.js";

export class ConversionError extends Error {}

/**
 * Shared conversion core: no filesystem or HTTP dependencies.
 * @param {Buffer} input
 * @param {{ quality?: number }} options
 * @returns {Promise<Buffer>}
 */
export async function convertImageBuffer(input, { quality = DEFAULT_QUALITY } = {}) {
  if (!input.length || input.length > MAX_FILE_BYTES) throw new ConversionError("La imagen debe pesar entre 1 byte y 20 MB.");
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new ConversionError("La calidad debe ser un entero entre 1 y 100.");
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).metadata();
    if (!["jpeg", "png", "heif"].includes(metadata.format ?? "")) throw new ConversionError("Formato no admitido. Usá JPG, PNG o HEIC.");
    if (metadata.format === "heif" && metadata.compression !== "hevc") throw new ConversionError("Este archivo HEIF no usa la compresión HEIC admitida.");
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw new ConversionError("La imagen supera el límite de 40 megapíxeles.");
    if ((metadata.pages ?? 1) > 1) throw new ConversionError("Las imágenes animadas o con múltiples páginas no están admitidas.");
    let source = input;
    if (metadata.format === "heif") source = Buffer.from(await heicConvert({ buffer: input, format: "PNG" }));
    return await sharp(source, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).autoOrient().webp({ quality }).toBuffer();
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError("No se pudo leer la imagen. Verificá que no esté dañada y que no supere 40 megapíxeles.");
  }
}
