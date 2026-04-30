/**
 * TAEngineProxy — main-thread proxy around the TA worker.
 * Falls back to inline TAEngine.compute when Workers are unavailable.
 */

import { TAEngine, type TAEngineOptions, type TAOutput } from "./engine.js";
import type { Bar } from "./structure/types.js";

interface PendingSlot {
  resolve: (value: TAOutput) => void;
  reject: (err: Error) => void;
}

interface WorkerMessage {
  id?: number;
  type: "ready" | "result" | "error";
  result?: TAOutput;
  message?: string;
}

export class TAEngineProxy {
  ready: Promise<void>;
  private _seq = 0;
  private _pending = new Map<number, PendingSlot>();
  private _fallback = false;
  private _readyResolve: (() => void) | null = null;
  private _worker?: Worker;

  constructor(opts: { workerUrl?: string | URL } = {}) {
    this.ready = new Promise<void>((res) => (this._readyResolve = res));
    try {
      if (typeof Worker === "undefined") throw new Error("Worker unsupported");
      const url = opts.workerUrl ?? new URL("../workers/taWorker.js", import.meta.url);
      this._worker = new Worker(url, { type: "module" });
      this._worker.addEventListener("message", (ev: MessageEvent<WorkerMessage>) =>
        this._onMessage(ev)
      );
      this._worker.addEventListener("error", (ev) => {
        console.warn("[TAEngineProxy] worker error, falling back to main thread", ev);
        this._fallback = true;
        this._readyResolve?.();
      });
    } catch (err) {
      console.warn("[TAEngineProxy] no worker → main-thread fallback:", (err as Error).message);
      this._fallback = true;
      queueMicrotask(() => this._readyResolve?.());
    }
  }

  private _onMessage(ev: MessageEvent<WorkerMessage>): void {
    const msg = ev.data;
    if (!msg) return;
    if (msg.type === "ready") {
      this._readyResolve?.();
      return;
    }
    if (msg.id == null) return;
    const slot = this._pending.get(msg.id);
    if (!slot) return;
    this._pending.delete(msg.id);
    if (msg.type === "result" && msg.result) slot.resolve(msg.result);
    else if (msg.type === "error") slot.reject(new Error(msg.message ?? "worker error"));
  }

  async compute(candles: Bar[], options: TAEngineOptions = {}): Promise<TAOutput> {
    await this.ready;
    if (this._fallback || !this._worker) return TAEngine.compute(candles, options);
    const id = ++this._seq;
    return new Promise<TAOutput>((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._worker!.postMessage({ id, type: "compute", candles, options });
    });
  }

  dispose(): void {
    this._worker?.terminate();
    this._pending.forEach(({ reject }) => reject(new Error("proxy disposed")));
    this._pending.clear();
  }
}
