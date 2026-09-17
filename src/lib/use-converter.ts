"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_QUALITY, MAX_BATCH_BYTES, MAX_FILE_BYTES, MAX_FILES, isSupportedName, uniqueWebpPath } from "@/shared/policy.js";
import type { SelectedFile } from "./files";

export type ConversionItem = SelectedFile & {
  id: string; outputPath: string; status: "pending" | "processing" | "done" | "error" | "cancelled";
  message?: string; blob?: Blob; url?: string;
};

export function useConverter() {
  const [items, setItems] = useState<ConversionItem[]>([]);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const busy = useRef(false);

  useEffect(() => {
    const resources = urls.current;
    return () => { controller.current?.abort(); resources.forEach((url) => URL.revokeObjectURL(url)); resources.clear(); };
  }, []);

  function addFiles(incoming: SelectedFile[]) {
    if (busy.current) return;
    const accepted: SelectedFile[] = [];
    let rejected = 0;
    for (const selected of incoming) {
      if (!isSupportedName(selected.file.name) || !selected.file.size || selected.file.size > MAX_FILE_BYTES) rejected++;
      else accepted.push(selected);
    }
    if (accepted.length + items.length > MAX_FILES || [...items, ...accepted].reduce((sum, item) => sum + item.file.size, 0) > MAX_BATCH_BYTES) {
      setNotice("No se agregó la selección: el lote admite hasta 100 imágenes y 200 MB en total.");
      return;
    }
    const used = new Set(items.map((item) => item.outputPath.toLowerCase()));
    const additions = accepted.map((selected): ConversionItem => ({ ...selected, id: crypto.randomUUID(), outputPath: uniqueWebpPath(selected.relativePath, used), status: "pending" }));
    setItems((previous) => [...previous, ...additions]);
    setNotice(rejected ? `Se omitieron ${rejected} archivos vacíos, no admitidos o mayores a 20 MB.` : "");
  }

  function clear() {
    if (busy.current) return;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
    setItems([]);
    setNotice("");
  }

  function remove(id: string) {
    if (busy.current) return;
    const item = items.find((entry) => entry.id === id);
    if (item?.url) { URL.revokeObjectURL(item.url); urls.current.delete(item.url); }
    setItems((previous) => previous.filter((entry) => entry.id !== id));
  }

  async function start() {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setNotice("");
    const abort = new AbortController();
    controller.current = abort;
    const pending = items.filter((item) => item.status !== "done");
    const ids = new Set(pending.map((item) => item.id));
    setItems((previous) => previous.map((item) => ids.has(item.id) ? { ...item, status: "pending", message: undefined } : item));
    const update = (id: string, patch: Partial<ConversionItem>) => setItems((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
    let resultBytes = items.reduce((sum, item) => sum + (item.blob?.size ?? 0), 0);
    try {
      for (const item of pending) {
        if (abort.signal.aborted) break;
        update(item.id, { status: "processing" });
        try {
          const response = await fetch(`/api/convert?quality=${quality}`, {
            method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: item.file, signal: abort.signal,
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || `No se pudo convertir (HTTP ${response.status}).`);
          }
          const blob = await response.blob();
          if (abort.signal.aborted) break;
          if (resultBytes + blob.size > MAX_BATCH_BYTES) throw new Error("Los resultados superan 200 MB. Descargá este lote y comenzá uno nuevo.");
          resultBytes += blob.size;
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          update(item.id, { status: "done", blob, url });
        } catch (error) {
          if (abort.signal.aborted) break;
          update(item.id, { status: "error", message: error instanceof Error ? error.message : "No se pudo conectar con el servidor." });
        }
      }
    } finally {
      if (abort.signal.aborted) {
        setItems((previous) => previous.map((item) => ["pending", "processing"].includes(item.status) ? { ...item, status: "cancelled" } : item));
        setNotice("Conversión cancelada. Podés descargar los resultados o reanudar los pendientes.");
      }
      controller.current = null;
      busy.current = false;
      setRunning(false);
    }
  }

  return { items, quality, setQuality, running, notice, setNotice, addFiles, clear, remove, start, cancel: () => controller.current?.abort() };
}
