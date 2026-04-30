/**
 * Feature normalization. Fit-on-train, apply-on-val/test.
 */

export interface ZScoreStats {
  type: "zscore";
  mean: number[];
  std: number[];
  count: number;
}

export interface MinMaxStats {
  type: "minmax";
  min: number[];
  max: number[];
  count: number;
}

export type NormStats = ZScoreStats | MinMaxStats;

export function fitZScore(
  matrix: Float32Array,
  d: number,
  rowIdx: number[] | null = null,
  valid: Uint8Array | null = null
): ZScoreStats {
  const n = matrix.length / d;
  const idx = rowIdx ?? Array.from({ length: n }, (_, i) => i);
  const mean = new Float64Array(d);
  const M2 = new Float64Array(d);
  let count = 0;
  for (const i of idx) {
    if (valid && !valid[i]) continue;
    count++;
    for (let k = 0; k < d; k++) {
      const x = matrix[i * d + k]!;
      const delta = x - mean[k]!;
      mean[k] = mean[k]! + delta / count;
      const delta2 = x - mean[k]!;
      M2[k] = M2[k]! + delta * delta2;
    }
  }
  const std = new Float64Array(d);
  for (let k = 0; k < d; k++) {
    std[k] = count > 1 ? Math.sqrt(M2[k]! / (count - 1)) : 0;
    if (!Number.isFinite(std[k]) || std[k]! < 1e-12) std[k] = 1;
  }
  return { type: "zscore", mean: Array.from(mean), std: Array.from(std), count };
}

export function fitMinMax(
  matrix: Float32Array,
  d: number,
  rowIdx: number[] | null = null,
  valid: Uint8Array | null = null
): MinMaxStats {
  const n = matrix.length / d;
  const idx = rowIdx ?? Array.from({ length: n }, (_, i) => i);
  const mn = new Float64Array(d).fill(Infinity);
  const mx = new Float64Array(d).fill(-Infinity);
  let count = 0;
  for (const i of idx) {
    if (valid && !valid[i]) continue;
    count++;
    for (let k = 0; k < d; k++) {
      const x = matrix[i * d + k]!;
      if (x < mn[k]!) mn[k] = x;
      if (x > mx[k]!) mx[k] = x;
    }
  }
  for (let k = 0; k < d; k++) {
    if (!Number.isFinite(mn[k])) mn[k] = 0;
    if (!Number.isFinite(mx[k])) mx[k] = 0;
    if (mx[k] === mn[k]) mx[k] = mn[k]! + 1;
  }
  return { type: "minmax", min: Array.from(mn), max: Array.from(mx), count };
}

export function applyStats(
  matrix: Float32Array,
  d: number,
  stats: NormStats,
  inPlace = false
): Float32Array {
  const out = inPlace ? matrix : new Float32Array(matrix);
  const n = matrix.length / d;
  if (stats.type === "zscore") {
    const { mean, std } = stats;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < d; k++) {
        out[i * d + k] = (matrix[i * d + k]! - mean[k]!) / std[k]!;
      }
    }
  } else if (stats.type === "minmax") {
    const { min, max } = stats;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < d; k++) {
        const span = max[k]! - min[k]!;
        out[i * d + k] = span > 0
          ? (2 * (matrix[i * d + k]! - min[k]!)) / span - 1
          : 0;
      }
    }
  }
  return out;
}

export function clipMatrix(
  matrix: Float32Array,
  _d: number,
  c = 5,
  inPlace = true
): Float32Array {
  const out = inPlace ? matrix : new Float32Array(matrix);
  for (let i = 0; i < out.length; i++) {
    if (out[i]! > c) out[i] = c;
    else if (out[i]! < -c) out[i] = -c;
  }
  return out;
}
