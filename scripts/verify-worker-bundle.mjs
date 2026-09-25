import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const directory = path.resolve(".next/server/app/api/convert");
const manifest = JSON.parse(await fs.readFile(path.join(directory, "route.js.nft.json"), "utf8"));
const files = new Set(manifest.files.map((file) => path.resolve(directory, file)));
const required = [
  "package.json",
  "src/workers/convert.mjs",
  "src/modules/image-engine.js",
  "src/shared/policy.js",
  ...["sharp", "@img/colour", "semver", "detect-libc", "heic-convert", "heic-decode", "libheif-js", "pngjs", "jpeg-js"].map((name) => `node_modules/${name}/package.json`),
];
for (const file of required) assert.ok(files.has(path.resolve(file)), `Missing worker dependency in deployment trace: ${file}`);
assert.ok([...files].some((file) => file.includes(`${path.sep}@img${path.sep}`) && file.endsWith(".node")), "The deployment trace must include sharp's native binary");
console.log(`Worker trace verified: ${required.length} required entries and sharp native binary included.`);
