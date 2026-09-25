import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";
import { convertImageBuffer } from "../src/modules/image-engine.js";
import { convertInWorker } from "../src/server/convert-worker";

test("real HEIC converts through the shared engine and worker", { skip: !process.env.HEIC_FIXTURE && "Set HEIC_FIXTURE to a real HEIC file (see README)." }, async () => {
  const input = await fs.readFile(process.env.HEIC_FIXTURE!);
  const original = await sharp(input).metadata();
  assert.equal(original.format, "heif");
  assert.equal(original.compression, "hevc");
  for (const output of [await convertImageBuffer(input), await convertInWorker(input, 80, new AbortController().signal)]) {
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp");
    assert.ok(metadata.width && metadata.height);
    assert.equal(metadata.width * metadata.height, original.width! * original.height!);
  }
});
