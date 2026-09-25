import { test } from "node:test";
import assert from "node:assert/strict";
import { AdmissionService } from "../src/server/admission-service";
import { MemorySecurityStore } from "../src/server/memory-security-store";
import { createAdmission } from "../src/server/admission";
import { identifyClient, normalizeClientAddress } from "../src/server/client-identity";
import { createConvertHandler, type ConversionEvent } from "../src/server/convert-handler";
import { RequestError } from "../src/server/errors";
import { SECURITY_POLICY } from "../src/server/security-policy";
import { MAX_WEB_FILE_BYTES } from "../src/shared/policy.js";
import { convertUpload, UploadError, waitForRetry } from "../src/lib/convert-upload";
import { UpstashSecurityStore } from "../src/server/upstash-security-store";

function localAdmission(now: () => number = Date.now) {
  const store = new MemorySecurityStore(now);
  return { store, admission: new AdmissionService(store, store) };
}

test("two service instances share concurrency slots and enforce one job per client", async () => {
  const { store, admission } = localAdmission();
  const other = new AdmissionService(store, store);
  const first = await admission.acquire("alice");
  await assert.rejects(other.acquire("alice"), (error: RequestError) => error.code === "client_concurrency");
  const second = await other.acquire("bob");
  await assert.rejects(admission.acquire("carol"), (error: RequestError) => error.code === "global_concurrency");
  await first.release();
  const third = await other.acquire("carol");
  await Promise.all([second.release(), third.release(), first.release()]);
});

test("burst quota does not block a different client and expires", async () => {
  let now = 100_000;
  const { admission } = localAdmission(() => now);
  for (let i = 0; i < 5; i++) await (await admission.acquire("alice")).release();
  await assert.rejects(admission.acquire("alice"), (error: RequestError) => error.status === 429 && error.retryAfter === 5);
  await (await admission.acquire("bob")).release();
  now += 5001;
  await (await admission.acquire("alice")).release();
});

test("byte budgets block processing and reset after their window", async () => {
  let now = 100_000;
  const { admission } = localAdmission(() => now);
  const first = await admission.acquire("alice");
  await first.chargeBytes(SECURITY_POLICY.clientBytes);
  await first.release();
  const second = await admission.acquire("alice");
  await assert.rejects(second.chargeBytes(1), (error: RequestError) => error.code === "clientBytes");
  await second.release();
  now += 60_001;
  const third = await admission.acquire("alice");
  await third.chargeBytes(1);
  await third.release();
});

test("an expired lease cannot be released by its old owner", async () => {
  let now = 100;
  const store = new MemorySecurityStore(() => now);
  assert.equal(await store.claim("slot", "old", 1000), true);
  now += 1001;
  assert.equal(await store.claim("slot", "new", 1000), true);
  await store.release("slot", "old");
  assert.equal(await store.claim("slot", "third", 1000), false);
});

test("Vercel cannot silently use local limits or missing Redis credentials", () => {
  assert.throws(() => createAdmission({ VERCEL: "1", RATE_LIMIT_BACKEND: "memory" }), /no está disponible/);
  assert.throws(() => createAdmission({ VERCEL: "1" }), /no está disponible/);
  assert.throws(() => createAdmission({ NODE_ENV: "production" }), /no está disponible/);
  assert.ok(createAdmission({ NODE_ENV: "development" }));
});

test("identity trusts Vercel's address, ignores generic forwarded headers, and groups IPv6", () => {
  const env = { VERCEL: "1", RATE_LIMIT_ID_SECRET: "test-secret-that-is-at-least-32-chars" };
  const request = (ip: string) => new Request("https://app.test", { headers: { "x-vercel-forwarded-for": ip, "x-forwarded-for": "1.2.3.4" } });
  assert.equal(identifyClient(request("2001:db8:1:2::1"), env), identifyClient(request("2001:db8:1:2::999"), env));
  assert.equal(normalizeClientAddress("::ffff:192.0.2.1"), "192.0.2.1");
  assert.match(identifyClient(request("192.0.2.1"), env), /^[a-f0-9]{64}$/);
  assert.throws(() => identifyClient(new Request("https://app.test", { headers: { "x-forwarded-for": "1.2.3.4" } }), env));
  assert.throws(() => identifyClient(request("1.2.3.4, 5.6.7.8"), env));
  assert.equal(identifyClient(request("invalid"), {}), "local");
});

test("Redis transport errors fail closed without leaking secrets", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("secret redis transport error"); });
  const store = new UpstashSecurityStore("https://example.upstash.io", "test-token", "test");
  const admission = new AdmissionService(store, store);
  await assert.rejects(admission.acquire("alice"), (error: RequestError) => error.status === 503 && !error.message.includes("secret"));
});

test("HTTP handler rejects oversized outputs, releases permits, and emits sanitized telemetry", async () => {
  let released = 0;
  const events: ConversionEvent[] = [];
  const handler = createConvertHandler({
    admission: () => ({ acquire: async () => ({ chargeBytes: async () => {}, release: async () => { released++; } }) }),
    identify: () => "private-client",
    read: async () => new Uint8Array([1, 2]),
    convert: async () => new Uint8Array(MAX_WEB_FILE_BYTES + 1),
    report: (event) => events.push(event),
  });
  const response = await handler(new Request("http://localhost/api/convert", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: "test" }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "output_size");
  assert.equal(released, 1);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(events[0].inputBytes, 2);
  assert.ok(!JSON.stringify(events).includes("private-client"));
});

test("admission failure returns 503 before reading or converting the image", async () => {
  const handler = createConvertHandler({
    admission: () => createAdmission({ VERCEL: "1" }),
    identify: () => "client",
    read: async () => { assert.fail("must not read uploads"); },
    convert: async () => { assert.fail("must not convert"); },
    report: () => {},
  });
  const response = await handler(new Request("http://localhost/api/convert", { method: "POST", headers: { "Content-Type": "application/octet-stream" } }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "10");
});

test("client respects Retry-After and stops after two retries", async () => {
  const waits: number[] = [];
  let calls = 0;
  await assert.rejects(convertUpload(new File(["image"], "image.jpg"), 80, new AbortController().signal, () => {}, {
    fetch: async () => { calls++; return Response.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "2" } }); },
    wait: async (ms) => { waits.push(ms); },
  }), (error: UploadError) => error.pauseBatch);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2250, 2250]);
});

test("client retries a transient failure but never retries corrupt input", async () => {
  let calls = 0;
  const blob = await convertUpload(new File(["image"], "image.jpg"), 80, new AbortController().signal, () => {}, {
    fetch: async () => ++calls === 1 ? new Response(null, { status: 503 }) : new Response("webp", { headers: { "Content-Type": "image/webp" } }),
    wait: async () => {},
  });
  assert.equal(await blob.text(), "webp");
  calls = 0;
  await assert.rejects(convertUpload(new File(["image"], "image.jpg"), 80, new AbortController().signal, () => {}, {
    fetch: async () => { calls++; return Response.json({ error: "corrupt" }, { status: 422 }); },
    wait: async () => assert.fail("must not wait"),
  }), /corrupt/);
  assert.equal(calls, 1);
});

test("retry waiting can be cancelled immediately", async () => {
  const controller = new AbortController();
  const waiting = waitForRetry(60_000, controller.signal);
  controller.abort();
  await assert.rejects(waiting);
});
