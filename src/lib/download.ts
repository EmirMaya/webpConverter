import { zip } from "fflate";

export function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadZip(files: { outputPath: string; blob: Blob }[]) {
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const file of files) entries[file.outputPath] = new Uint8Array(await file.blob.arrayBuffer());
  // WebP is already compressed. Async ZIP keeps the UI responsive.
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => error ? reject(error) : resolve(data));
  });
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  downloadUrl(url, "imagenes-webp.zip");
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
