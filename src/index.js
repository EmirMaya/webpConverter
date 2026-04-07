import { resolveInputDirectory } from "./modules/cli.js";
import { convertJpgDirectoryToWebp } from "./modules/converter.js";

async function main() {
  try {
    const inputDirectory = resolveInputDirectory(process.argv);
    const result = await convertJpgDirectoryToWebp(inputDirectory);

    console.log(`Conversion finalizada: ${result.convertedCount} archivo(s) procesado(s).`);
    console.log(`Carpeta de salida: ${result.outputDirectory}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    console.error(`No se pudo completar la conversion: ${message}`);
    process.exitCode = 1;
  }
}

await main();
