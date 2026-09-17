import { RequestError } from "./convert-worker";

type AdmissionState = { active: number; count: number; window: number };
const runtime = globalThis as typeof globalThis & { webpAdmission?: AdmissionState };
const state = runtime.webpAdmission ??= { active: 0, count: 0, window: Date.now() };

// Per-process guard. Distributed/per-client limits belong at the reverse proxy.
export function acquireConversion(): () => void {
  const now = Date.now();
  if (now - state.window >= 60_000) { state.count = 0; state.window = now; }
  if (state.count >= 120) throw new RequestError("Se alcanzó el límite de solicitudes. Esperá un minuto.", 429);
  state.count++;
  if (state.active >= 2) throw new RequestError("El servidor está ocupado. Intentá nuevamente en unos segundos.", 503);
  state.active++;
  let released = false;
  return () => { if (!released) { released = true; state.active--; } };
}
