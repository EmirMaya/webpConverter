// Shared by the browser, API, worker and original Node CLI.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Vercel limits request/response payloads to 4.5 MB. Keep the CLI limit separate.
export const MAX_WEB_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_WEB_FILE_MIB = MAX_WEB_FILE_BYTES / 1024 / 1024;
export const MAX_BATCH_BYTES = 200 * 1024 * 1024;
export const MAX_FILES = 100;
export const MAX_PIXELS = 40_000_000;
export const DEFAULT_QUALITY = 80;
export const SUPPORTED_EXTENSIONS = ["jpg", "jpeg", "png", "heic", "heif"];

/** @param {string} name */
export function isSupportedName(name) {
  return SUPPORTED_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");
}

/** Safe, portable relative paths for downloads and ZIP entries. @param {string} name */
export function safeRelativePath(name) {
  const parts = name.replaceAll("\\", "/").split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.slice(-20).map((part) => {
    let safe = part.normalize("NFC").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").replace(/[. ]+$/g, "").slice(0, 100);
    if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
    return safe || "imagen";
  }).join("/") || "imagen";
}

/** @param {string} name @param {Set<string>} used */
export function uniqueWebpPath(name, used) {
  const stem = safeRelativePath(name).replace(/\.[^/.]+$/, "");
  let candidate = `${stem}.webp`;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${stem} (${suffix++}).webp`;
  used.add(candidate.toLowerCase());
  return candidate;
}
