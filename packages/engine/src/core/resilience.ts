/**
 * My Next Prediction v3.0 — ResilienceLayer
 * Handles: health probes, circuit breakers, exponential backoff, graceful degrade,
 * online/offline transitions, quota monitoring.
 */

import { EventBus } from "./bus.js";

/* ───────── Circuit breaker ───────── */

interface CircuitBreakerOpts {
  name: string;
  threshold?: number;
  cooldownMs?: number;
  halfOpenMax?: number;
}

type CircuitState = "closed" | "open" | "half";

export class CircuitBreaker {
  private name: string;
  private threshold: number;
  private cooldownMs: number;
  private halfOpenMax: number;
  private state: CircuitState = "closed";
  private fails = 0;
  private openedAt = 0;
  private inflight = 0;

  constructor({ name, threshold = 5, cooldownMs = 30_000, halfOpenMax = 1 }: CircuitBreakerOpts) {
    this.name = name;
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.halfOpenMax = halfOpenMax;
  }

  canPass(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = "half";
        this.inflight = 0;
      } else return false;
    }
    if (this.state === "half") return this.inflight < this.halfOpenMax;
    return false;
  }

  onSuccess(): void {
    if (this.state === "half") EventBus.emit("circuit:close", { name: this.name });
    this.state = "closed";
    this.fails = 0;
    this.inflight = Math.max(0, this.inflight - 1);
  }

  onFailure(err: unknown): void {
    this.inflight = Math.max(0, this.inflight - 1);
    this.fails++;
    if (this.state === "half" || this.fails >= this.threshold) {
      this.state = "open";
      this.openedAt = Date.now();
      EventBus.emit("circuit:open", {
        name: this.name,
        err: String((err as Error)?.message ?? err),
      });
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canPass()) {
      const e = Object.assign(new Error(`circuit[${this.name}] open`), {
        code: "CIRCUIT_OPEN",
      });
      throw e;
    }
    this.inflight++;
    try {
      const r = await fn();
      this.onSuccess();
      return r;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }
}

/* ───────── Retry with backoff ───────── */

interface WithRetryOpts {
  tries?: number;
  baseMs?: number;
  maxMs?: number;
  signal?: AbortSignal;
  onAttempt?: (attempt: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: WithRetryOpts = {}): Promise<T> {
  const { tries = 4, baseMs = 400, maxMs = 8_000, signal, onAttempt } = opts;
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    if (signal?.aborted) throw signal.reason ?? new Error("aborted");
    try {
      onAttempt?.(i);
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === tries - 1) break;
      const wait = Math.min(maxMs, baseMs * 2 ** i) * (0.7 + 0.6 * Math.random());
      await sleepAbortable(wait, signal);
    }
  }
  throw lastErr;
}

export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true }
    );
  });
}

/* ───────── Health registry ───────── */

interface HealthEntry {
  check: () => Promise<boolean>;
  intervalMs: number;
  nextAt: number;
}

interface HealthState {
  ok: boolean | null;
  lastOk: number;
  lastErr: string | null;
}

class HealthRegistry {
  private checks = new Map<string, HealthEntry>();
  private state = new Map<string, HealthState>();
  private timer: ReturnType<typeof setInterval> | null = null;

  register(name: string, check: () => Promise<boolean>, { intervalMs = 30_000 } = {}): void {
    this.checks.set(name, { check, intervalMs, nextAt: 0 });
    this.state.set(name, { ok: null, lastOk: 0, lastErr: null });
  }

  async runOnce(name: string): Promise<void> {
    const entry = this.checks.get(name);
    if (!entry) return;
    try {
      const ok = await entry.check();
      this.state.set(name, { ok: !!ok, lastOk: Date.now(), lastErr: null });
      EventBus.emit("health", { name, ok: !!ok });
    } catch (err) {
      this.state.set(name, {
        ok: false,
        lastOk: this.state.get(name)?.lastOk ?? 0,
        lastErr: String((err as Error)?.message ?? err),
      });
      EventBus.emit("health", {
        name,
        ok: false,
        err: String((err as Error)?.message ?? err),
      });
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [name, entry] of this.checks) {
        if (now >= entry.nextAt) {
          entry.nextAt = now + entry.intervalMs;
          void this.runOnce(name);
        }
      }
    }, 2_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snapshot(): Record<string, HealthState> {
    return Object.fromEntries(this.state);
  }
}

export const Health = new HealthRegistry();

/* ───────── Online/offline ───────── */

export function wireNetworkEvents(): void {
  const emit = () => EventBus.emit("net", { online: navigator.onLine });
  addEventListener("online", emit);
  addEventListener("offline", emit);
  emit();
}

/* ───────── Visibility ───────── */

export function wireVisibility(): void {
  document.addEventListener("visibilitychange", () => {
    EventBus.emit("visibility", { visible: !document.hidden });
  });
}

/* ───────── Quota watcher ───────── */

export function wireQuotaWatcher({ intervalMs = 60_000 } = {}): void {
  if (!(navigator.storage && navigator.storage.estimate)) return;
  const tick = async () => {
    try {
      const e = await navigator.storage.estimate();
      const freePct = e.quota ? 1 - (e.usage ?? 0) / e.quota : null;
      EventBus.emit("quota", { quota: e.quota ?? 0, usage: e.usage ?? 0, freePct });
      if (freePct != null && freePct < 0.1) {
        EventBus.emit("quota:low", { freePct });
      }
    } catch {
      // quota unavailable
    }
  };
  void tick();
  setInterval(() => void tick(), intervalMs);
}

/* ───────── Degrade mode ───────── */

const _flags = new Set<string>();

export function degrade(flag: string, reason: string): void {
  if (_flags.has(flag)) return;
  _flags.add(flag);
  console.warn(`[MNP] degrade: ${flag} — ${reason}`);
  EventBus.emit("degrade", { flag, reason });
}

export function restore(flag: string): void {
  if (!_flags.delete(flag)) return;
  EventBus.emit("restore", { flag });
}

export function isDegraded(flag: string): boolean {
  return _flags.has(flag);
}

export function degradedFlags(): string[] {
  return [..._flags];
}

/* ───────── Fetch wrapper with timeout + circuit ───────── */

interface FetchGuardedOpts extends RequestInit {
  timeoutMs?: number;
  breaker?: CircuitBreaker;
  signal?: AbortSignal;
}

export async function fetchGuarded(url: string, opts: FetchGuardedOpts = {}): Promise<Response> {
  const { timeoutMs = 10_000, breaker, signal, ...init } = opts;
  const ctl = new AbortController();
  const onExt = () => ctl.abort(signal?.reason ?? new Error("aborted"));
  signal?.addEventListener("abort", onExt, { once: true });
  const t = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  const run = async () => {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) {
      const e = Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      throw e;
    }
    return r;
  };
  try {
    return breaker ? await breaker.run(run) : await run();
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onExt);
  }
}
