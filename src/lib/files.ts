import { MAX_FILES } from "@/shared/policy.js";

export type SelectedFile = { file: File; relativePath: string };

export function selectedFiles(files: FileList | File[]): SelectedFile[] {
  return Array.from(files).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

export async function droppedFiles(transfer: DataTransfer): Promise<SelectedFile[]> {
  // Capture entries synchronously: browsers protect DataTransfer after the drop event.
  const entries = Array.from(transfer.items).filter((item) => item.kind === "file").map((item) => ({
    entry: item.webkitGetAsEntry?.(), file: item.getAsFile(),
  }));
  const fallback = selectedFiles(transfer.files);
  const result: SelectedFile[] = [];
  let visited = 0;
  async function visit(entry: FileSystemEntry, prefix = "", depth = 0): Promise<void> {
    if (++visited > 1000 || depth > 20 || result.length >= MAX_FILES) throw new Error("La selección supera 100 archivos, 1000 entradas o 20 niveles de carpetas. Seleccioná una carpeta más pequeña.");
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      result.push({ file, relativePath: `${prefix}${file.name}` });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await visit(child, `${prefix}${entry.name}/`, depth + 1);
      }
    }
  }
  if (!entries.length) return fallback;
  for (const { entry, file } of entries) {
    if (entry) await visit(entry);
    else if (file) result.push({ file, relativePath: file.name });
  }
  return result;
}

export function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
