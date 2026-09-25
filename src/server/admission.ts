import { AdmissionService } from "./admission-service";
import { MemorySecurityStore } from "./memory-security-store";
import { UpstashSecurityStore } from "./upstash-security-store";
import { securityUnavailable } from "./errors";
import type { AdmissionControl } from "./security-contracts";

export function createAdmission(env: Readonly<Record<string, string | undefined>> = process.env): AdmissionControl {
  const onVercel = env.VERCEL === "1";
  const mode = env.RATE_LIMIT_BACKEND || (onVercel || env.NODE_ENV === "production" ? "redis" : "memory");
  if (mode === "memory" && !onVercel) {
    const store = new MemorySecurityStore();
    return new AdmissionService(store, store);
  }
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const prefix = env.RATE_LIMIT_PREFIX;
  if (mode !== "redis" || !url || !token || !prefix || !/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix)) throw securityUnavailable();
  if (!url.startsWith("https://") || (onVercel && (env.RATE_LIMIT_ID_SECRET?.length ?? 0) < 32)) throw securityUnavailable();
  const store = new UpstashSecurityStore(url, token, prefix);
  return new AdmissionService(store, store);
}

let admission: AdmissionControl | undefined;
export function getAdmission(): AdmissionControl {
  return admission ??= createAdmission();
}
