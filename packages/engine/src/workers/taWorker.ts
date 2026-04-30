/**
 * TA Worker — runs TAEngine.compute off the main thread.
 *
 * Protocol (postMessage JSON):
 *   → { id, type:"compute", candles, options }
 *   ← { id, type:"result",  result }  or  { id, type:"error", message }
 *
 * Module worker — boot via:
 *   new Worker(new URL("./taWorker.ts", import.meta.url), { type: "module" })
 */

/// <reference lib="webworker" />

import { TAEngine } from "../ta/engine.js";

interface ComputeMessage {
  id: number;
  type: "compute";
  candles: Parameters<typeof TAEngine.compute>[0];
  options?: Parameters<typeof TAEngine.compute>[1];
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (ev: MessageEvent<ComputeMessage>) => {
  const msg = ev.data;
  if (!msg || msg.type !== "compute") return;
  const { id, candles, options } = msg;
  try {
    const t0 = performance.now();
    const result = TAEngine.compute(candles, options ?? {});
    const ms = performance.now() - t0;
    (result as { __workerMs?: number }).__workerMs = ms;
    ctx.postMessage({ id, type: "result", result });
  } catch (err) {
    const e = err as Error;
    ctx.postMessage({ id, type: "error", message: e?.message ?? String(err), stack: e?.stack });
  }
});

ctx.postMessage({ id: 0, type: "ready" });
