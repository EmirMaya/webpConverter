import { randomUUID } from "node:crypto";
import type { AdmissionControl, ConversionPermit, LeaseStore, RateStore } from "./security-contracts";
import { RequestError, securityUnavailable } from "./errors";
import { SECURITY_POLICY, type LimitScope } from "./security-policy";

export class AdmissionService implements AdmissionControl {
  constructor(private readonly rates: RateStore, private readonly leases: LeaseStore) {}

  private async consume(scope: LimitScope, client: string, cost = 1) {
    const decision = await this.rates.consume(scope, client, cost);
    if (!decision.allowed) throw new RequestError(
      "Alcanzaste el límite temporal. La conversión podrá reintentarse en unos segundos.",
      429, scope, decision.retryAfter,
    );
  }

  async acquire(client: string): Promise<ConversionPermit> {
    const owner = randomUUID();
    const clientKey = `client:${client}`;
    const claimed: string[] = [];
    try {
      await this.consume("clientBurst", client);
      await this.consume("clientRequests", client);
      await this.consume("globalRequests", "all");
      if (!await this.leases.claim(clientKey, owner, SECURITY_POLICY.leaseMs)) {
        throw new RequestError("Ya hay una conversión activa desde tu conexión.", 429, "client_concurrency", 2);
      }
      claimed.push(clientKey);
      for (let slot = 0; slot < SECURITY_POLICY.globalConcurrent; slot++) {
        const key = `global:${slot}`;
        if (await this.leases.claim(key, owner, SECURITY_POLICY.leaseMs)) {
          claimed.push(key);
          break;
        }
      }
      if (claimed.length < 2) throw new RequestError("El servidor está ocupado. Esperá unos segundos.", 503, "global_concurrency", 3);

      let released = false;
      let charged = false;
      return {
        chargeBytes: async (bytes) => {
          if (charged || released || !Number.isSafeInteger(bytes) || bytes < 1) throw securityUnavailable();
          charged = true;
          try {
            await this.consume("clientBytes", client, bytes);
            await this.consume("globalBytes", "all", bytes);
          } catch (error) {
            throw error instanceof RequestError ? error : securityUnavailable();
          }
        },
        release: async () => {
          if (released) return;
          released = true;
          const results = await Promise.allSettled(claimed.map((key) => this.leases.release(key, owner)));
          if (results.some((result) => result.status === "rejected")) throw securityUnavailable();
        },
      };
    } catch (error) {
      // Unknown network outcomes are also bounded by lease expiry.
      await Promise.allSettled(claimed.map((key) => this.leases.release(key, owner)));
      throw error instanceof RequestError ? error : securityUnavailable();
    }
  }
}
