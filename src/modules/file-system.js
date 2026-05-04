import fs from "node:fs/promises";
import path from "node:path";

const VALID_EXTENSIONS = new Set([".jpg", ".jpeg", ".heic"]);

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
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => VALID_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({
      inputPath: path.join(directoryPath, entry.name),
      outputName: `${path.parse(entry.name).name}.webp`
    }));
}

export const getJpgFiles = getConvertibleImageFiles;
