import { test, expect } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs/promises";
import { unzipSync } from "fflate";

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
  expect((await request.post("/api/convert", { headers, data: Buffer.alloc(20 * 1024 * 1024 + 1) })).status()).toBe(413);
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
