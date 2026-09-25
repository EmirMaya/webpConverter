import type { LimitScope } from "./security-policy";

export interface RateDecision { allowed: boolean; retryAfter: number }

/** Narrow ports: the application does not depend on Redis or a specific SDK. */
export interface RateStore {
  consume(scope: LimitScope, client: string, cost: number): Promise<RateDecision>;
}

export interface LeaseStore {
  claim(key: string, owner: string, ttlMs: number): Promise<boolean>;
  release(key: string, owner: string): Promise<void>;
}

export interface ConversionPermit {
  chargeBytes(bytes: number): Promise<void>;
  release(): Promise<void>;
}

export interface AdmissionControl {
  acquire(client: string): Promise<ConversionPermit>;
}
