/**
 * My Next Prediction v3.0 — M-LEARN-2 · Anti-pattern Discovery
 * Cluster Mistake-Ledger rows by their feature-vector, surface clusters
 * where the model has been reliably wrong, and persist them as queryable
 * anti-patterns the meta-veto layer can match against the live feature vector.
 *
 * Pure / IDB. No DOM, no events.
 */

import type { AntiPattern, AntiPatternMatch, Mistake } from "../types.js";
import { put, withStore, req2promise, count as idbCount } from "../data/idb.js";

const STORE = "antiPatterns" as const;

const DEFAULTS = Object.freeze({
  k: 8,
  minSamples: 20,
  badThreshold: 0.45,
  embargoBars: 0,
  maxIters: 30,
});

/* ═══════════════════════════ Math helpers ═══════════════════════════ */

export function sqDist(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const n = Math.max(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = +a[i]! || 0;
    const y = +b[i]! || 0;
    const d = x - y;
    s += d * d;
  }
  return s;
}

export function mean(vecs: number[][]): number[] | null {
  if (!Array.isArray(vecs) || vecs.length === 0) return null;
  const dim = vecs[0]!.length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) out[i]! += +v[i]! || 0;
  }
  for (let i = 0; i < dim; i++) out[i]! /= vecs.length;
  return out;
}

export function clusterRadius(vecs: number[][], centroid: number[], percentile = 0.9): number {
  if (!Array.isArray(vecs) || vecs.length === 0) return 0;
  const dists = vecs.map((v) => sqDist(v, centroid)).sort((a, b) => a - b);
  const idx = Math.min(
    dists.length - 1,
    Math.max(0, Math.floor(percentile * (dists.length - 1)))
  );
  return dists[idx]!;
}

/* ═══════════════════════════ Mini-batch k-means ═══════════════════════════ */

export interface KMeansResult {
  labels: number[];
  centroids: number[][];
}

export function kmeans(
  vecs: number[][],
  k: number = DEFAULTS.k,
  maxIters: number = DEFAULTS.maxIters
): KMeansResult {
  if (!Array.isArray(vecs) || vecs.length === 0) return { labels: [], centroids: [] };
  const n = vecs.length;
  const K = Math.max(1, Math.min(k, n));
  let centroids: number[][] = [];
  for (let i = 0; i < K; i++) centroids.push(vecs[Math.floor((i * n) / K)]!.slice());

  const labels = new Array<number>(n).fill(0);
  for (let iter = 0; iter < maxIters; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const d = sqDist(vecs[i]!, centroids[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        moved++;
      }
    }
    if (moved === 0 && iter > 0) break;
    const sums = Array.from({ length: K }, () =>
      new Array<number>(centroids[0]!.length).fill(0)
    );
    const counts = new Array<number>(K).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i]!;
      counts[c]!++;
      for (let j = 0; j < vecs[i]!.length; j++) sums[c]![j]! += +vecs[i]![j]! || 0;
    }
    for (let c = 0; c < K; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < sums[c]!.length; j++) sums[c]![j]! /= counts[c]!;
      centroids[c] = sums[c]!;
    }
  }
  return { labels, centroids };
}

/* ═══════════════════════════ Discovery pipeline ═══════════════════════════ */

interface DiscoverOpts {
  mistakes?: Mistake[];
  corrects?: Array<{ context?: { featureVec?: number[] } }>;
  k?: number;
  minSamples?: number;
  badThreshold?: number;
}

export interface DiscoverResult {
  added: number;
  updated: number;
  total: number;
  skipped: string | null;
}

export async function discoverAntiPatterns(opts: DiscoverOpts = {}): Promise<DiscoverResult> {
  const {
    mistakes,
    corrects,
    k = DEFAULTS.k,
    minSamples = DEFAULTS.minSamples,
    badThreshold = DEFAULTS.badThreshold,
  } = opts;

  if (!Array.isArray(mistakes) || mistakes.length < minSamples) {
    return { added: 0, updated: 0, total: 0, skipped: "insufficient mistakes" };
  }

  const mVecs: number[][] = [];
  const mRows: Mistake[] = [];
  for (const m of mistakes) {
    const v = m?.context?.featureVec;
    if (Array.isArray(v) && v.length > 0) {
      mVecs.push(v);
      mRows.push(m);
    }
  }
  if (mVecs.length < minSamples) {
    return { added: 0, updated: 0, total: 0, skipped: "insufficient feature vectors" };
  }

  const cVecs: number[][] = [];
  if (Array.isArray(corrects)) {
    for (const c of corrects) {
      const v = c?.context?.featureVec;
      if (Array.isArray(v) && v.length > 0) cVecs.push(v);
    }
  }

  const { labels, centroids } = kmeans(mVecs, k);

  interface Bucket {
    centroid: number[] | null;
    radius: number;
    misses: number[][];
    correctsNear: number;
    errorTypes: Record<string, number>;
    dirs: { long: number; short: number };
    regimes: Record<string, number>;
  }

  const buckets: Bucket[] = centroids.map(() => ({
    centroid: null,
    radius: 0,
    misses: [],
    correctsNear: 0,
    errorTypes: { direction: 0, "interval-miss": 0, magnitude: 0, "set-miss": 0 },
    dirs: { long: 0, short: 0 },
    regimes: {},
  }));

  for (let i = 0; i < mVecs.length; i++) {
    const b = buckets[labels[i]!]!;
    b.misses.push(mVecs[i]!);
    const r = mRows[i]!;
    b.errorTypes[r.errorType] = (b.errorTypes[r.errorType] ?? 0) + 1;
    if (r.predicted?.direction === "long") b.dirs.long++;
    if (r.predicted?.direction === "short") b.dirs.short++;
    const rg = r.context?.regime ?? "unknown";
    b.regimes[rg] = (b.regimes[rg] ?? 0) + 1;
  }

  const out: Omit<AntiPattern, "id">[] = [];
  for (let c = 0; c < buckets.length; c++) {
    const b = buckets[c]!;
    if (b.misses.length < minSamples) continue;
    b.centroid = mean(b.misses)!;
    b.radius = clusterRadius(b.misses, b.centroid, 0.9);
    for (const v of cVecs) {
      if (sqDist(v, b.centroid) <= b.radius) b.correctsNear++;
    }
    const sampleN = b.misses.length + b.correctsNear;
    const mistakeN = b.misses.length;
    const hitRate = sampleN > 0 ? b.correctsNear / sampleN : 0;
    if (hitRate >= badThreshold) continue;
    const dominantDir: AntiPattern["direction"] =
      b.dirs.long > b.dirs.short * 2
        ? "long"
        : b.dirs.short > b.dirs.long * 2
          ? "short"
          : "mixed";
    const dominantRegime =
      Object.entries(b.regimes).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    out.push({
      regime: dominantRegime,
      centroid: b.centroid,
      radius: +b.radius.toFixed(6),
      hitRate: +hitRate.toFixed(3),
      sampleN,
      mistakeN,
      direction: dominantDir,
      errorTypes: b.errorTypes,
      label: `${dominantDir} in ${dominantRegime ?? "any regime"} · miss ${mistakeN}/${sampleN} (${(hitRate * 100).toFixed(0)}%)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  await clearAll();
  let added = 0;
  for (const ap of out) {
    await put(STORE, ap);
    added++;
  }

  return { added, updated: 0, total: await idbCount(STORE), skipped: null };
}

/* ═══════════════════════════ Read API ═══════════════════════════ */

export async function listAntiPatterns({
  regime,
  limit = 100,
}: { regime?: string; limit?: number } = {}): Promise<AntiPattern[]> {
  return withStore<AntiPattern[]>(STORE, "readonly", async (s) => {
    const rows = await req2promise<AntiPattern[]>(s.getAll() as IDBRequest<AntiPattern[]>);
    const out: AntiPattern[] = [];
    for (const r of rows) {
      if (regime != null && r.regime !== regime) continue;
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  });
}

export async function nearestAntiPattern(
  featureVec: number[],
  { regime }: { regime?: string } = {}
): Promise<AntiPatternMatch | null> {
  if (!Array.isArray(featureVec) || featureVec.length === 0) return null;
  const aps = await listAntiPatterns(regime !== undefined ? { regime } : {});
  if (!aps.length) return null;
  let best: AntiPattern | null = null;
  let bestD = Infinity;
  for (const ap of aps) {
    const d = sqDist(featureVec, ap.centroid);
    if (d < bestD) {
      bestD = d;
      best = ap;
    }
  }
  if (!best) return null;
  return { antiPattern: best, distance: +bestD.toFixed(6), inRadius: bestD <= best.radius };
}

export async function count(): Promise<number> {
  return idbCount(STORE);
}

export async function clearAll(): Promise<void> {
  return withStore<void>(STORE, "readwrite", async (s) => req2promise(s.clear()));
}

export const _internals = { DEFAULTS } as const;
