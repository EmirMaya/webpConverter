import path from "node:path";

export function resolveInputDirectory(argv) {
  const rawInput = argv[2];

  if (!rawInput) {
    throw new Error(
      "Debes indicar la carpeta de entrada. Ejemplo: npm run convert -- ./imagenes"
    );
  }

  return path.resolve(rawInput);
}
