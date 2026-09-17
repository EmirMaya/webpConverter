import fs from "node:fs/promises";
import path from "node:path";
import { convertImageBuffer } from "./image-engine.js";
import { MAX_FILE_BYTES } from "../shared/policy.js";

import {
  createOutputDirectory,
  ensureDirectoryExists,
  getConvertibleImageFiles
} from "./file-system.js";

export async function convertImageDirectoryToWebp(inputDirectory) {
  await ensureDirectoryExists(inputDirectory);

  const imageFiles = await getConvertibleImageFiles(inputDirectory);

  if (imageFiles.length === 0) {
    throw new Error("No se encontraron archivos JPG, PNG o HEIC en la carpeta indicada.");
  }

  const outputDirectory = await createOutputDirectory(inputDirectory);

  let convertedCount = 0;
  const errors = [];
  for (const file of imageFiles) {
    try {
      const stats = await fs.stat(file.inputPath);
      if (stats.size > MAX_FILE_BYTES) throw new Error("La imagen supera el límite de 20 MB.");
      const output = await convertImageBuffer(await fs.readFile(file.inputPath));
      const outputPath = path.join(outputDirectory, file.outputName);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, output, { flag: "wx" });
      convertedCount++;
    } catch (error) {
      errors.push({ file: file.inputPath, message: error.code === "EEXIST" ? "El archivo de salida ya existe; no se sobrescribió." : error.message });
    }
  }

  return {
    convertedCount,
    outputDirectory,
    errors
  };
}

export const convertJpgDirectoryToWebp = convertImageDirectoryToWebp;
