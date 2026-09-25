import type { LeaseStore, RateStore } from "./security-contracts";
import { RATE_RULES, type LimitScope } from "./security-policy";
import { securityUnavailable } from "./errors";

/** Development adapter; never selected on Vercel. */
export class MemorySecurityStore implements RateStore, LeaseStore {
  private events = new Map<string, { at: number; cost: number }[]>();
  private leases = new Map<string, { owner: string; expires: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(scope: LimitScope, client: string, cost: number) {
    const now = this.now();
    const rule = RATE_RULES[scope];
    for (const [key, events] of this.events) {
      if (!events.some((event) => event.at > now - 60_000)) this.events.delete(key);
    }
    const key = `${scope}:${client}`;
    if (!this.events.has(key) && this.events.size >= 4096) throw securityUnavailable();
    const events = (this.events.get(key) ?? []).filter((event) => event.at > now - rule.windowMs);
    const used = events.reduce((sum, event) => sum + event.cost, 0);
    if (used + cost > rule.limit) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil(((events[0]?.at ?? now) + rule.windowMs - now) / 1000)) };
    }
    events.push({ at: now, cost });
    this.events.set(key, events);
    return { allowed: true, retryAfter: 0 };
  }

  async claim(key: string, owner: string, ttlMs: number) {
    const now = this.now();
    for (const [leaseKey, lease] of this.leases) if (lease.expires <= now) this.leases.delete(leaseKey);
    if (this.leases.has(key)) return false;
    this.leases.set(key, { owner, expires: now + ttlMs });
    return true;
  }

  async release(key: string, owner: string) {
    if (this.leases.get(key)?.owner === owner) this.leases.delete(key);
  }
}
