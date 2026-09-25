import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { securityUnavailable } from "./errors";

/** Group IPv6 by /64 so rotating interface addresses cannot reset a quota. */
export function normalizeClientAddress(ip: string): string {
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind !== 6) throw securityUnavailable();
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const leading = left ? left.split(":") : [];
  const trailing = right ? right.split(":") : [];
  const words = right === undefined ? leading : [...leading, ...Array(8 - leading.length - trailing.length).fill("0"), ...trailing];
  const values = words.map((word) => parseInt(word, 16));
  if (values.slice(0, 5).every((part) => part === 0) && values[5] === 0xffff) {
    return [values[6] >> 8, values[6] & 255, values[7] >> 8, values[7] & 255].join(".");
  }
  return `${values.slice(0, 4).map((part) => part.toString(16)).join(":")}::/64`;
}

export function identifyClient(request: Request, env: Readonly<Record<string, string | undefined>> = process.env) {
  // On localhost no forwarded header is trusted. All local requests share an identity.
  if (env.VERCEL !== "1") return "local";
  const secret = env.RATE_LIMIT_ID_SECRET;
  if (!secret || secret.length < 32) throw securityUnavailable();
  // This header is supplied by Vercel; do not fall back to caller-controlled headers.
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || ip.includes(",")) throw securityUnavailable();
  return createHmac("sha256", secret).update(normalizeClientAddress(ip)).digest("hex");
}
