import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { convertImageBuffer } from "../src/modules/image-engine.js";
import { convertImageDirectoryToWebp } from "../src/modules/converter.js";
import { safeRelativePath, uniqueWebpPath, MAX_FILE_BYTES } from "../src/shared/policy.js";
import { readUpload } from "../src/server/read-upload";
import { convertInWorker } from "../src/server/convert-worker";
import { acquireConversion } from "../src/server/admission";

const makePng = () => sharp({ create: { width: 24, height: 16, channels: 4, background: { r: 20, g: 120, b: 60, alpha: 0.4 } } }).png().toBuffer();

test("PNG keeps dimensions and transparency, and yields an actual WebP", async () => {
  const output = await convertImageBuffer(await makePng());
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 24);
  assert.equal(metadata.height, 16);
  assert.equal(metadata.hasAlpha, true);
});

test("JPEG applies EXIF orientation and strips metadata", async () => {
  const input = await sharp(await makePng()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const metadata = await sharp(await convertImageBuffer(input)).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 24);
  assert.equal(metadata.exif, undefined);
});

test("rejects invalid content, SVG, unsupported format, quality and size", async () => {
  await assert.rejects(convertImageBuffer(Buffer.from("fake jpg")), /No se pudo leer/);
  await assert.rejects(convertImageBuffer(Buffer.from('<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg"></svg>')), /Formato no admitido/);
  await assert.rejects(convertImageBuffer(await makePng(), { quality: 101 }), /calidad/);
  await assert.rejects(convertImageBuffer(await makePng(), { quality: 1.5 }), /calidad/);
  await assert.rejects(convertImageBuffer(Buffer.alloc(MAX_FILE_BYTES + 1)), /20 MB/);
  await assert.rejects(convertImageBuffer(Buffer.alloc(0)), /20 MB/);
});

test("rejects oversized dimensions before pixel decoding", async () => {
  const input = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(convertImageBuffer(input), /40 megapíxeles/);
});

test("download paths remove traversal and prevent case-insensitive collisions", () => {
  assert.equal(safeRelativePath("../../album/../foto.jpg"), "album/foto.jpg");
  assert.equal(safeRelativePath("CON.jpg"), "_CON.jpg");
  const used = new Set<string>();
  assert.equal(uniqueWebpPath("album/foto.jpg", used), "album/foto.webp");
  assert.equal(uniqueWebpPath("album/FOTO.png", used), "album/FOTO (2).webp");
  assert.equal(uniqueWebpPath("album/foto.heic", used), "album/foto (3).webp");
});

test("CLI processes subfolders, preserves successes, and never overwrites outputs", async () => {
  const root = path.resolve(".test-tmp");
  await fs.mkdir(root, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(root, "cli-"));
  try {
    const input = path.join(fixture, "input");
    await fs.mkdir(path.join(input, "album"), { recursive: true });
    const png = await makePng();
    await fs.writeFile(path.join(input, "foto.png"), png);
    await fs.writeFile(path.join(input, "foto.jpg"), await sharp(png).jpeg().toBuffer());
    await fs.writeFile(path.join(input, "album", "foto.png"), png);
    await fs.writeFile(path.join(input, "bad.jpg"), "broken");
    const result = await convertImageDirectoryToWebp(input);
    assert.equal(result.convertedCount, 3);
    assert.equal(result.errors.length, 1);
    assert.equal((await sharp(path.join(result.outputDirectory, "album", "foto.webp")).metadata()).format, "webp");
    const repeated = await convertImageDirectoryToWebp(input);
    assert.equal(repeated.convertedCount, 0);
    assert.equal(repeated.errors.length, 4);
    assert.ok(repeated.errors.some((entry: { message: string }) => entry.message.includes("no se sobrescribió")));
  } finally {
    assert.ok(fixture.startsWith(root + path.sep));
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

test("streamed upload limit applies without Content-Length", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_FILE_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  const request = new Request("http://localhost/api/convert", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readUpload(request), /20 MB/);
  await assert.rejects(readUpload(new Request("http://localhost", { method: "POST", body: "" })), /vacía/);
});

test("worker converts and rejects pre-cancelled jobs", async () => {
  const bytes = await convertInWorker(await makePng(), 80, new AbortController().signal);
  assert.equal((await sharp(bytes).metadata()).format, "webp");
  await assert.rejects(convertInWorker(await makePng(), 80, AbortSignal.abort()), /cancelada/);
});

test("server limits concurrent conversions and releases capacity", () => {
  const first = acquireConversion();
  const second = acquireConversion();
  try { assert.throws(acquireConversion, /ocupado/); } finally { first(); second(); }
  const next = acquireConversion();
  next(); next();
});
