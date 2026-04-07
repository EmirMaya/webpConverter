import path from "node:path";
import sharp from "sharp";

import {
  createOutputDirectory,
  ensureDirectoryExists,
  getJpgFiles
} from "./file-system.js";

async function convertFileToWebp(inputPath, outputPath) {
  await sharp(inputPath)
    .webp({ quality: 80 })
    .toFile(outputPath);
}

export async function convertJpgDirectoryToWebp(inputDirectory) {
  await ensureDirectoryExists(inputDirectory);

  const jpgFiles = await getJpgFiles(inputDirectory);

  if (jpgFiles.length === 0) {
    throw new Error("No se encontraron archivos .jpg o .jpeg en la carpeta indicada.");
  }

  const outputDirectory = await createOutputDirectory(inputDirectory);

  for (const file of jpgFiles) {
    const outputPath = path.join(outputDirectory, file.outputName);
    await convertFileToWebp(file.inputPath, outputPath);
  }

  return {
    convertedCount: jpgFiles.length,
    outputDirectory
  };
}