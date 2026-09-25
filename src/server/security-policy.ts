export const SECURITY_POLICY = {
  clientRequests: 60,
  clientBurst: 5,
  globalRequests: 120,
  clientBytes: 64 * 1024 * 1024,
  globalBytes: 256 * 1024 * 1024,
  globalConcurrent: 2,
  // Longer than the Vercel function's maxDuration (60 s).
  leaseMs: 90_000,
  uploadTimeoutMs: 15_000,
  conversionTimeoutMs: 25_000,
} as const;

export type LimitScope = "clientRequests" | "clientBurst" | "globalRequests" | "clientBytes" | "globalBytes";
export const RATE_RULES: Record<LimitScope, { limit: number; windowMs: number }> = {
  clientRequests: { limit: SECURITY_POLICY.clientRequests, windowMs: 60_000 },
  clientBurst: { limit: SECURITY_POLICY.clientBurst, windowMs: 5_000 },
  globalRequests: { limit: SECURITY_POLICY.globalRequests, windowMs: 60_000 },
  clientBytes: { limit: SECURITY_POLICY.clientBytes, windowMs: 60_000 },
  globalBytes: { limit: SECURITY_POLICY.globalBytes, windowMs: 60_000 },
};
