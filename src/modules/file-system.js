import fs from "node:fs/promises";
import path from "node:path";

import { isSupportedName, uniqueWebpPath } from "../shared/policy.js";

export async function ensureDirectoryExists(directoryPath) {
  const stats = await fs.stat(directoryPath).catch(() => null);

  if (!stats || !stats.isDirectory()) {
    throw new Error(`La carpeta no existe o no es valida: ${directoryPath}`);
  }
}

export async function createOutputDirectory(inputDirectory) {
  const parentDirectory = path.dirname(inputDirectory);
  const inputDirectoryName = path.basename(inputDirectory);
  const outputDirectory = path.join(parentDirectory, `${inputDirectoryName}-webp`);

  await fs.mkdir(outputDirectory, { recursive: true });

  return outputDirectory;
}

export async function getConvertibleImageFiles(directoryPath) {
  const files = [];
  const used = new Set();
  async function visit(directory, relative = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const inputPath = path.join(directory, entry.name);
      const relativePath = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(inputPath, relativePath);
      else if (entry.isFile() && isSupportedName(entry.name)) files.push({ inputPath, outputName: uniqueWebpPath(relativePath, used) });
    }
  }
  await visit(directoryPath);
  return files;
}

export const getJpgFiles = getConvertibleImageFiles;
