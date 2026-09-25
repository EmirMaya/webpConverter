"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { droppedFiles, formatBytes, selectedFiles } from "@/lib/files";
import { downloadUrl, downloadZip } from "@/lib/download";
import { useConverter } from "@/lib/use-converter";

function Icon({ kind, size = 22 }: { kind: "upload" | "image" | "download" | "folder" | "arrow"; size?: number }) {
  const paths = {
    upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 16v5h16v-5"/></>,
    folder: <path d="M3 7V4h7l2 3h9v13H3Z"/>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export function Converter() {
  const converter = useConverter();
  const { items, running } = converter;
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const busy = running || reading || zipping;
  const completed = items.filter((item) => item.status === "done");
  const settled = items.filter((item) => ["done", "error", "cancelled"].includes(item.status)).length;
  const inputBytes = completed.reduce((total, item) => total + item.file.size, 0);
  const outputBytes = completed.reduce((total, item) => total + (item.blob?.size ?? 0), 0);
  const saved = inputBytes ? Math.round((1 - outputBytes / inputBytes) * 100) : 0;

  async function saveZip() {
    setZipping(true);
    try { await downloadZip(completed.map((item) => ({ outputPath: item.outputPath, blob: item.blob! }))); }
    catch { converter.setNotice("No se pudo crear el ZIP. Podés descargar las imágenes individualmente."); }
    finally { setZipping(false); }
  }

  return <main className="shell">
    <header className="site-header"><Link className="brand" href="/" aria-label="WebP Studio, inicio"><span className="brand-mark"><Icon kind="image"/></span>webp<span className="brand-light">studio</span><span className="brand-dot"/></Link><span className="header-label">MENOS PESO. MÁS POSIBILIDADES.</span></header>
    <section className="intro"><span className="eyebrow"><span/> TU PRÓXIMO PASO HACIA UNA WEB MÁS LIGERA</span><h1>Tus imágenes.<br/><span>Ahora en WebP.</span></h1><p>Arrastrá, convertí y descargá. Dale a tus imágenes un formato<br className="desktop-break"/> más liviano, con la calidad que vos elegís.</p></section>
    <div className="workspace">
      <section className="upload-panel" aria-labelledby="upload-title">
        <div className="section-title"><span className="step">01</span><h2 id="upload-title">Agregá tus imágenes</h2><span className="small-tag">JPG · PNG · HEIC</span></div>
        <div className={`drop-zone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={async (event) => {
          event.preventDefault(); setDragging(false); if (busy) return;
          setReading(true);
          try { converter.addFiles(await droppedFiles(event.dataTransfer)); }
          catch (error) { converter.setNotice(error instanceof Error ? error.message : "No se pudo leer la carpeta. Usá el selector de archivos."); }
          finally { setReading(false); }
        }}>
          <div className="upload-art"><span className="art-back"/><span className="art-front"><Icon kind="upload" size={34}/></span><span className="art-plus">+</span></div>
          <h3>{reading ? "Leyendo tu selección…" : dragging ? "Soltá tus imágenes acá" : "Un nuevo formato empieza acá"}</h3>
          <p>Arrastrá tus imágenes o una carpeta completa</p>
          <div className="pick-actions"><button className="button primary" onClick={() => filesInput.current?.click()} disabled={busy}><Icon kind="image" size={18}/>Elegir imágenes</button><button className="button secondary" onClick={() => folderInput.current?.click()} disabled={busy}><Icon kind="folder" size={18}/>Elegir carpeta</button></div>
          <span className="drop-hint">Hasta 100 imágenes · 20 MB por imagen · 200 MB por lote</span>
          <input ref={filesInput} className="visually-hidden" type="file" aria-label="Seleccionar imágenes" accept=".jpg,.jpeg,.png,.heic,.heif" multiple disabled={busy} onChange={(event) => { if (event.target.files) converter.addFiles(selectedFiles(event.target.files)); event.target.value = ""; }}/>
          <input ref={folderInput} className="visually-hidden" type="file" aria-label="Seleccionar carpeta" multiple {...{ webkitdirectory: "" }} disabled={busy} onChange={(event) => { if (event.target.files) converter.addFiles(selectedFiles(event.target.files)); event.target.value = ""; }}/>
        </div>
        <div className="privacy-note"><span aria-hidden="true">↗</span><p>Solo para convertir. Las imágenes se procesan en el servidor en memoria, sin guardarse en disco.</p></div>
      </section>
      <aside className="settings-panel" aria-labelledby="settings-title"><div className="section-title"><span className="step">02</span><h2 id="settings-title">A tu medida</h2></div>
        <div className="format-row"><span>Formato de salida</span><span className="format-badge">WEBP <span>✓</span></span></div>
        <div className="quality-heading"><label htmlFor="quality">Calidad de imagen</label><output htmlFor="quality">{converter.quality}<span>%</span></output></div>
        <input id="quality" type="range" min="1" max="100" value={converter.quality} disabled={busy} onChange={(event) => converter.setQuality(Number(event.target.value))}/>
        <div className="range-labels"><span>Menor peso</span><span>Mayor calidad</span></div>
        <p className="quality-help">80% es un buen punto de partida para equilibrar detalle y tamaño.</p>
        <div className="settings-details"><p><span>✓</span> Dimensiones originales</p><p><span>✓</span> Transparencia conservada</p><p><span>✓</span> Subcarpetas dentro del ZIP</p></div>
        <button className="button primary convert-button" disabled={busy || !items.some((item) => item.status !== "done")} onClick={() => void converter.start()}>{running ? "Convirtiendo…" : "Convertir a WebP"}<Icon kind="arrow" size={19}/></button>
        {running && <button className="text-button cancel" onClick={converter.cancel}>Cancelar conversión</button>}
        <span className="settings-foot">Sin registro. Sin vueltas.</span>
      </aside>
    </div>
    {converter.notice && <p className="notice" role="status">{converter.notice}</p>}
    <section className="results-panel" aria-labelledby="results-title"><div className="results-heading"><div className="section-title"><span className="step">03</span><h2 id="results-title">Tus imágenes</h2><span className="count">{items.length}</span></div><div className="result-actions">{!!items.length && <button className="text-button" disabled={busy} onClick={converter.clear}>Limpiar</button>}<button className="button secondary compact" disabled={busy || !completed.length} onClick={() => void saveZip()}><Icon kind="download" size={17}/>{zipping ? "Preparando ZIP…" : "Descargar ZIP"}</button></div></div>
      {!!items.length && <div className="progress-area" aria-live="polite"><span>{running ? "Procesando" : "Resultados"}: {completed.length} de {items.length} convertidas{completed.length > 0 ? ` · ${formatBytes(outputBytes)}${saved > 0 ? ` · ${saved}% menos peso` : ""}` : ""}</span><progress value={settled} max={items.length} aria-label="Progreso de conversión"/></div>}
      {!items.length ? <div className="empty-state"><span className="empty-icon"><Icon kind="image" size={25}/></span><p>Todo listo para tus imágenes</p><span>Los archivos que agregues aparecerán acá.</span></div> : <ul className="file-list">{items.map((item) => <li className="file-row" key={item.id}><span className={`file-icon ${item.status === "done" ? "file-done" : ""}`}><Icon kind="image"/></span><div className="file-info"><p title={item.relativePath}>{item.relativePath}</p><span>{formatBytes(item.file.size)}{item.blob ? ` → ${formatBytes(item.blob.size)}` : ""}</span>{item.message && <span className="file-error">{item.message}</span>}</div><span className={`status status-${item.status}`}>{({ pending: "En espera", processing: "Convirtiendo…", done: "Lista", error: "Error", cancelled: "Cancelada" })[item.status]}</span>{item.url && <button className="icon-button" aria-label={`Descargar ${item.outputPath}`} onClick={() => downloadUrl(item.url!, item.outputPath.split("/").pop()!)}><Icon kind="download" size={18}/></button>}<button className="icon-button remove-button" disabled={busy} aria-label={`Quitar ${item.relativePath}`} onClick={() => converter.remove(item.id)}>×</button></li>)}</ul>}
    </section>
    <footer className="site-footer"><span>Un formato pequeño. Una gran diferencia.</span><span>Hecho para simplificar.</span></footer>
  </main>;
}
