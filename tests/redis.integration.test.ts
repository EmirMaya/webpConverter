import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { UpstashSecurityStore } from "../src/server/upstash-security-store";
import { AdmissionService } from "../src/server/admission-service";
import { RequestError } from "../src/server/errors";

// Explicit opt-in: do not spend Redis commands from an ordinary local test run.
test("Redis shares quotas and leases across independent instances", { skip: process.env.RUN_REDIS_INTEGRATION !== "1" }, async () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.ok(url && token, "Redis integration needs URL and token");
  const prefix = `webp-test:${randomUUID()}`;
  const firstStore = new UpstashSecurityStore(url, token, prefix);
  const secondStore = new UpstashSecurityStore(url, token, prefix);
  const first = new AdmissionService(firstStore, firstStore);
  const second = new AdmissionService(secondStore, secondStore);
  const permit = await first.acquire("client");
  try {
    await assert.rejects(second.acquire("client"), (error: RequestError) => error.code === "client_concurrency");
    await permit.chargeBytes(1);
  } finally { await permit.release(); }
  await (await second.acquire("client")).release();
  assert.equal(await firstStore.claim("expiry", "old", 1), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await secondStore.claim("expiry", "new", 1000), true);
  await firstStore.release("expiry", "old");
  assert.equal(await firstStore.claim("expiry", "other", 1000), false);
  await secondStore.release("expiry", "new");
  for (let i = 0; i < 5; i++) assert.equal((await firstStore.consume("clientBurst", "burst", 1)).allowed, true);
  assert.equal((await secondStore.consume("clientBurst", "burst", 1)).allowed, false);
});
