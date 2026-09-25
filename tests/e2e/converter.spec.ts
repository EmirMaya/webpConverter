import { test, expect } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { MAX_WEB_FILE_BYTES } from "../../src/shared/policy.js";

// A shared localhost identity intentionally uses the same real burst policy.
test.beforeEach(async () => { await new Promise((resolve) => setTimeout(resolve, 5100)); });

const image = () => sharp({ create: { width: 30, height: 20, channels: 4, background: { r: 50, g: 100, b: 60, alpha: 0.5 } } }).png().toBuffer();

test("uploads a mixed batch and downloads valid individual and ZIP results", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Seleccionar imágenes", { exact: true }).setInputFiles([
    { name: "foto.png", mimeType: "image/png", buffer: await image() },
    { name: "foto.jpg", mimeType: "image/jpeg", buffer: await sharp(await image()).jpeg().toBuffer() },
    { name: "rota.jpg", mimeType: "image/jpeg", buffer: Buffer.from("broken") },
  ]);
  await page.getByRole("button", { name: "Convertir a WebP" }).click();
  await expect(page.getByText("2 de 3 convertidas", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No se pudo leer la imagen.", { exact: false })).toBeVisible();
  const individual = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar foto.webp", exact: true }).click();
  const file = await individual;
  expect((await sharp(await fs.readFile((await file.path())!)).metadata()).format).toBe("webp");
  const zipped = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar ZIP" }).click();
  const zipFile = await zipped;
  const entries = unzipSync(await fs.readFile((await zipFile.path())!));
  expect(Object.keys(entries).sort()).toEqual(["foto (2).webp", "foto.webp"]);
  for (const bytes of Object.values(entries)) expect((await sharp(bytes).metadata()).format).toBe("webp");
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await expect(page.getByText("Todo listo para tus imágenes")).toBeVisible();
});

test("API enforces content, quality, origin and size checks", async ({ request }) => {
  const headers = { "Content-Type": "application/octet-stream" };
  const valid = await request.post("/api/convert", { headers, data: await image() });
  expect(valid.status()).toBe(200);
  expect(valid.headers()["cache-control"]).toBe("no-store");
  expect((await sharp(await valid.body()).metadata()).hasAlpha).toBe(true);
  expect((await request.post("/api/convert?quality=101", { headers, data: await image() })).status()).toBe(400);
  expect((await request.post("/api/convert", { headers: { ...headers, Origin: "https://example.com" }, data: await image() })).status()).toBe(403);
  expect((await request.post("/api/convert", { headers, data: "fake" })).status()).toBe(422);
  expect((await request.post("/api/convert", { headers, data: Buffer.alloc(MAX_WEB_FILE_BYTES + 1) })).status()).toBe(413);
});

test("cancellation keeps the interface usable", async ({ page }) => {
  await page.route("**/api/convert?*", async (route) => { await new Promise((resolve) => setTimeout(resolve, 1000)); await route.abort().catch(() => {}); });
  await page.goto("/");
  await page.getByLabel("Seleccionar imágenes", { exact: true }).setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: await image() });
  await page.getByRole("button", { name: "Convertir a WebP" }).click();
  await page.getByRole("button", { name: "Cancelar conversión" }).click();
  await expect(page.getByText("Conversión cancelada.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Convertir a WebP" })).toBeEnabled();
});

test("responsive layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tus imágenes. Ahora en WebP." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});

test("folder selection preserves subfolders in the downloaded ZIP", async ({ page }) => {
  const root = path.resolve(".test-tmp");
  await fs.mkdir(root, { recursive: true });
  const folder = await fs.mkdtemp(path.join(root, "folder-"));
  try {
    await fs.mkdir(path.join(folder, "album"));
    await fs.writeFile(path.join(folder, "foto.png"), await image());
    await fs.writeFile(path.join(folder, "album", "foto.png"), await image());
    await page.goto("/");
    await page.getByLabel("Seleccionar carpeta", { exact: true }).setInputFiles(folder);
    await page.getByRole("button", { name: "Convertir a WebP" }).click();
    await expect(page.getByText("2 de 2 convertidas", { exact: false })).toBeVisible({ timeout: 30_000 });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar ZIP" }).click();
    const entries = unzipSync(await fs.readFile((await (await download).path())!));
    expect(Object.keys(entries).sort()).toEqual([`${path.basename(folder)}/album/foto.webp`, `${path.basename(folder)}/foto.webp`]);
  } finally {
    expect(folder.startsWith(root + path.sep)).toBe(true);
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test("drag and drop adds images", async ({ page }) => {
  await page.goto("/");
  const bytes = Array.from(await image());
  await page.locator(".drop-zone").evaluate((element, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], "arrastrada.png", { type: "image/png" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
  }, bytes);
  await expect(page.getByText("arrastrada.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Convertir a WebP" }).click();
  await expect(page.getByRole("button", { name: "Descargar arrastrada.webp", exact: true })).toBeVisible();
});

test("real HEIC upload downloads a valid WebP", async ({ page }) => {
  test.skip(!process.env.HEIC_FIXTURE, "Set HEIC_FIXTURE to a real HEIC file.");
  await page.goto("/");
  await page.getByLabel("Seleccionar imágenes", { exact: true }).setInputFiles({ name: "foto.heic", mimeType: "image/heic", buffer: await fs.readFile(process.env.HEIC_FIXTURE!) });
  await page.getByRole("button", { name: "Convertir a WebP" }).click();
  const button = page.getByRole("button", { name: "Descargar foto.webp", exact: true });
  await expect(button).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent("download");
  await button.click();
  expect((await sharp(await fs.readFile((await (await download).path())!)).metadata()).format).toBe("webp");
});

test("CSP nonces vary per request and permit the application scripts", async ({ page, request }) => {
  const one = await request.get("/");
  const two = await request.get("/");
  const policy = one.headers()["content-security-policy"];
  const firstNonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  const secondNonce = /'nonce-([^']+)'/.exec(two.headers()["content-security-policy"])?.[1];
  expect(firstNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
  expect(policy.split(";").find((part) => part.trim().startsWith("script-src"))).not.toContain("unsafe-inline");
  expect(await one.text()).toContain(`nonce="${firstNonce}"`);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Elegir imágenes" })).toBeEnabled();
});

test("429 waits and retries successfully", async ({ page }) => {
  let attempts = 0;
  const output = await sharp(await image()).webp().toBuffer();
  await page.route("**/api/convert?*", async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 429, headers: { "Retry-After": "1" }, json: { error: "busy" } });
    else await route.fulfill({ status: 200, contentType: "image/webp", body: output });
  });
  await page.goto("/");
  await page.getByLabel("Seleccionar imágenes", { exact: true }).setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: await image() });
  await page.getByRole("button", { name: "Convertir a WebP" }).click();
  await expect(page.getByText("Pausa temporal:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar retry.webp", exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
