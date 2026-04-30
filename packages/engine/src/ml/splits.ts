/**
 * Cross-validation splits with purging and embargo.
 */

export interface WalkForwardOpts {
  trainFrac?: number;
  valFrac?: number;
  embargo?: number;
}

export interface SplitIndices {
  trainIdx: number[];
  valIdx: number[];
  testIdx: number[];
}

export function walkForwardSplit(n: number, opts: WalkForwardOpts = {}): SplitIndices {
  const { trainFrac = 0.7, valFrac = 0.15, embargo = 0 } = opts;
  const trainEnd = Math.floor(n * trainFrac);
  const valEnd = Math.floor(n * (trainFrac + valFrac));
  const trainIdx: number[] = [];
  const valIdx: number[] = [];
  const testIdx: number[] = [];
  for (let i = 0; i < trainEnd - embargo; i++) trainIdx.push(i);
  for (let i = trainEnd; i < valEnd - embargo; i++) valIdx.push(i);
  for (let i = valEnd; i < n; i++) testIdx.push(i);
  return { trainIdx, valIdx, testIdx };
}

export interface KFoldOpts {
  k?: number;
  embargo?: number;
}

export interface Fold {
  trainIdx: number[];
  testIdx: number[];
}

export function purgedKFold(t1Arr: ArrayLike<number | null>, opts: KFoldOpts = {}): Fold[] {
  const { k = 5, embargo = 0 } = opts;
  const n = t1Arr.length;
  if (n === 0 || k < 2) return [];
  const foldSize = Math.floor(n / k);
  const folds: Fold[] = [];
  for (let f = 0; f < k; f++) {
    const testStart = f * foldSize;
    const testEnd = f === k - 1 ? n : testStart + foldSize;
    const testIdx: number[] = [];
    for (let i = testStart; i < testEnd; i++) testIdx.push(i);

    let testExtendedEnd = testEnd - 1;
    for (let i = testStart; i < testEnd; i++) {
      const v = t1Arr[i];
      const e = Number.isInteger(v) ? (v as number) : i;
      if (e > testExtendedEnd) testExtendedEnd = e;
    }
    const embargoEnd = Math.min(n - 1, testExtendedEnd + embargo);

    const trainIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i >= testStart && i < testEnd) continue;
      const v = t1Arr[i];
      const ei = Number.isInteger(v) ? (v as number) : i;
      if (!(ei < testStart || i > testEnd - 1)) continue;
      if (i > testEnd - 1 && i <= embargoEnd) continue;
      trainIdx.push(i);
    }
    folds.push({ trainIdx, testIdx });
  }
  return folds;
}

export function gatherRows(matrix: Float32Array, d: number, idx: number[]): Float32Array {
  const out = new Float32Array(idx.length * d);
  for (let r = 0; r < idx.length; r++) {
    const src = idx[r]! * d;
    out.set(matrix.subarray(src, src + d), r * d);
  }
  return out;
}

export function gather<T>(arr: ArrayLike<T>, idx: number[]): T[] {
  const out: T[] = new Array(idx.length);
  for (let r = 0; r < idx.length; r++) out[r] = arr[idx[r]!]!;
  return out;
}
