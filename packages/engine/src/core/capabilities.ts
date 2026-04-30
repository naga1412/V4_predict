/**
 * My Next Prediction v3.0 — Capability Detector
 * Detects browser features so downstream modules can route to fast path or fallback.
 */

import type { Capabilities } from "../types.js";

const RESULT: Partial<Capabilities> & { _done?: boolean } = {};

export async function detectCapabilities(): Promise<Capabilities> {
  if (RESULT._done) return RESULT as Capabilities;

  RESULT.ua = navigator.userAgent;
  RESULT.platform = navigator.platform || "unknown";
  RESULT.online = navigator.onLine;
  RESULT.hardwareCores = navigator.hardwareConcurrency || 2;
  RESULT.deviceMemGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  RESULT.touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  RESULT.smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
  RESULT.dpr = window.devicePixelRatio || 1;
  RESULT.lang = navigator.language || "en";
  RESULT.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  RESULT.webgpu = await probeWebGPU();
  RESULT.wasm = probeWasm();
  RESULT.wasmSIMD = await probeWasmSimd();
  RESULT.workers = typeof Worker !== "undefined";
  RESULT.sharedWorker = typeof SharedWorker !== "undefined";
  RESULT.sab = probeSAB();
  RESULT.coiIsolated =
    typeof crossOriginIsolated !== "undefined" && (crossOriginIsolated as boolean);

  RESULT.localStorage = probeLocalStorage();
  RESULT.sessionStorage = probeSessionStorage();
  RESULT.indexedDB = typeof indexedDB !== "undefined";
  RESULT.opfs = await probeOPFS();
  RESULT.fsAccess = "showDirectoryPicker" in window;
  RESULT.persistent = !!(navigator.storage && navigator.storage.persist);
  RESULT.quota = await probeQuota();
  RESULT.privateMode = await probePrivateMode();

  RESULT.websocket = typeof WebSocket !== "undefined";
  RESULT.broadcastCh = typeof BroadcastChannel !== "undefined";
  RESULT.webLocks = !!(navigator.locks && navigator.locks.request);
  RESULT.serviceWorker = "serviceWorker" in navigator;

  RESULT.webCrypto = !!(window.crypto && window.crypto.subtle);
  RESULT.resizeObserver = typeof ResizeObserver !== "undefined";
  RESULT.intersection = typeof IntersectionObserver !== "undefined";
  RESULT.prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  RESULT.prefersContrast = matchMedia("(prefers-contrast: more)").matches;

  RESULT._done = true;
  Object.freeze(RESULT);
  return RESULT as Capabilities;
}

/* ───────── Probes ───────── */

async function probeWebGPU(): Promise<boolean> {
  try {
    if (!("gpu" in navigator)) return false;
    const adapter = await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

function probeWasm(): boolean {
  try {
    return (
      typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function"
    );
  } catch {
    return false;
  }
}

async function probeWasmSimd(): Promise<boolean> {
  if (!probeWasm()) return false;
  try {
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
      253, 15, 253, 98, 11,
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

function probeSAB(): boolean {
  try {
    if (typeof SharedArrayBuffer !== "function") return false;
    new SharedArrayBuffer(16);
    return true;
  } catch {
    return false;
  }
}

function probeLocalStorage(): boolean {
  try {
    const k = "__mnp_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function probeSessionStorage(): boolean {
  try {
    const k = "__mnp_probe__";
    sessionStorage.setItem(k, "1");
    sessionStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

async function probeOPFS(): Promise<boolean> {
  try {
    if (!navigator.storage || !navigator.storage.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    return !!root;
  } catch {
    return false;
  }
}

async function probeQuota(): Promise<Capabilities["quota"]> {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { quota, usage } = await navigator.storage.estimate();
    return {
      quota: quota ?? 0,
      usage: usage ?? 0,
      freePct: quota ? 1 - (usage ?? 0) / quota : null,
    };
  } catch {
    return null;
  }
}

async function probePrivateMode(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota } = await navigator.storage.estimate();
      if (quota && quota < 120 * 1024 * 1024) return true;
    }
  } catch {
    // ignore
  }
  if (typeof indexedDB === "undefined") return true;
  return false;
}

/* ───────── Classification ───────── */

export interface TierResult {
  tier: "rich" | "standard" | "lite";
  reasons: string[];
}

export function classifyTier(caps: Capabilities): TierResult {
  const reasons: string[] = [];
  let score = 0;
  if (caps.indexedDB) score += 3;
  else reasons.push("no IndexedDB");
  if (caps.opfs) score += 2;
  else reasons.push("no OPFS");
  if (caps.workers) score += 2;
  else reasons.push("no WebWorker");
  if (caps.wasm) score += 1;
  else reasons.push("no WASM");
  if (caps.websocket) score += 2;
  else reasons.push("no WebSocket");
  if (caps.serviceWorker) score += 1;
  else reasons.push("no SW");
  if (caps.webCrypto) score += 1;
  else reasons.push("no WebCrypto");
  if (caps.broadcastCh) score += 1;
  else reasons.push("no BroadcastChannel");
  if (caps.privateMode) {
    score -= 2;
    reasons.push("private/incognito");
  }
  if (caps.hardwareCores < 4) reasons.push("low CPU");
  if (caps.deviceMemGB && caps.deviceMemGB < 4) reasons.push("low RAM");

  const tier: TierResult["tier"] = score >= 10 ? "rich" : score >= 6 ? "standard" : "lite";
  return { tier, reasons };
}

export function summarize(caps: Capabilities): {
  tier: string;
  reasons: string[];
  compute: string;
  storage: string;
  net: string;
} {
  const { tier, reasons } = classifyTier(caps);
  return {
    tier,
    reasons,
    compute: [
      caps.wasm && "wasm",
      caps.wasmSIMD && "simd",
      caps.webgpu && "gpu",
      caps.workers && "worker",
      caps.sab && "sab",
    ]
      .filter(Boolean)
      .join("+") || "js-only",
    storage: [
      caps.indexedDB && "idb",
      caps.opfs && "opfs",
      caps.fsAccess && "fsa",
      caps.localStorage && "ls",
    ]
      .filter(Boolean)
      .join("+") || "none",
    net: caps.online ? "online" : "offline",
  };
}

export function getCapabilities(): Capabilities {
  if (!RESULT._done) throw new Error("capabilities not yet detected");
  return RESULT as Capabilities;
}
