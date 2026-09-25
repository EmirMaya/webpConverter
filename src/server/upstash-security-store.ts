import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import type { LeaseStore, RateStore } from "./security-contracts";
import { RATE_RULES, type LimitScope } from "./security-policy";
import { securityUnavailable } from "./errors";

// Compare-and-delete is atomic: an expired owner's release cannot delete a new lease.
const RELEASE_LEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export class UpstashSecurityStore implements RateStore, LeaseStore {
  private readonly redis: Redis;
  private readonly limiters: Record<LimitScope, Ratelimit>;

  constructor(url: string, token: string, private readonly prefix: string) {
    this.redis = new Redis({
      url, token,
      retry: false,
      enableAutoPipelining: false,
      signal: () => AbortSignal.timeout(2000),
    });
    this.limiters = Object.fromEntries(Object.entries(RATE_RULES).map(([scope, rule]) => [
      scope,
      new Ratelimit({
        redis: this.redis,
        prefix: `${prefix}:rate:${scope}`,
        limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowMs} ms`),
        timeout: 2500,
        analytics: false,
        ephemeralCache: false,
      }),
    ])) as Record<LimitScope, Ratelimit>;
  }

  async consume(scope: LimitScope, client: string, cost: number) {
    const decision = await this.limiters[scope].limit(client, { rate: cost });
    // The SDK normally allows traffic on timeout. Explicitly override that behavior.
    if (decision.reason === "timeout") {
      void decision.pending.catch(() => {});
      throw securityUnavailable();
    }
    await decision.pending;
    return {
      allowed: decision.success,
      retryAfter: Math.max(1, Math.ceil((decision.reset - Date.now()) / 1000)),
    };
  }

  async claim(key: string, owner: string, ttlMs: number) {
    return await this.redis.set(`${this.prefix}:lease:${key}`, owner, { nx: true, px: ttlMs }) === "OK";
  }

  async release(key: string, owner: string) {
    await this.redis.eval(RELEASE_LEASE, [`${this.prefix}:lease:${key}`], [owner]);
  }
}
