import fs from "node:fs/promises";
import path from "node:path";
import heicConvert from "heic-convert";
import sharp from "sharp";

import {
  createOutputDirectory,
  ensureDirectoryExists,
  getConvertibleImageFiles
} from "./file-system.js";

const WEBP_OPTIONS = { quality: 80 };

function isHeicFile(filePath) {
  return path.extname(filePath).toLowerCase() === ".heic";
}

async function convertHeicToWebp(inputPath, outputPath) {
  const inputBuffer = await fs.readFile(inputPath);
  const pngBuffer = await heicConvert({
    buffer: inputBuffer,
    format: "PNG"
  });

  await sharp(Buffer.from(pngBuffer))
    .webp(WEBP_OPTIONS)
    .toFile(outputPath);
}

async function convertFileToWebp(inputPath, outputPath) {
  if (isHeicFile(inputPath)) {
    await convertHeicToWebp(inputPath, outputPath);
    return;
  }

  await sharp(inputPath)
    .webp(WEBP_OPTIONS)
    .toFile(outputPath);
}

export async function convertImageDirectoryToWebp(inputDirectory) {
  await ensureDirectoryExists(inputDirectory);

  const imageFiles = await getConvertibleImageFiles(inputDirectory);

  if (imageFiles.length === 0) {
    throw new Error("No se encontraron archivos .jpg, .jpeg o .heic en la carpeta indicada.");
  }

  const outputDirectory = await createOutputDirectory(inputDirectory);

  for (const file of imageFiles) {
    const outputPath = path.join(outputDirectory, file.outputName);
    await convertFileToWebp(file.inputPath, outputPath);
  }

  return {
    convertedCount: imageFiles.length,
    outputDirectory
  };
}

export const convertJpgDirectoryToWebp = convertImageDirectoryToWebp;
