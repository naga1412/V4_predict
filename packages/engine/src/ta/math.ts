/**
 * My Next Prediction v3.0 — TA math helpers
 * Streaming-friendly primitives so indicators can update O(1) per new bar.
 */

/** Fixed-length FIFO with running sum + sum of squares. */
export class RollingWindow {
  readonly size: number;
  readonly buf: number[] = [];
  private _sum = 0;
  private _sumSq = 0;

  constructor(size: number) {
    if (!(size > 0)) throw new Error("RollingWindow size must be > 0");
    this.size = size | 0;
  }

  push(x: number): this {
    this.buf.push(x);
    this._sum += x;
    this._sumSq += x * x;
    if (this.buf.length > this.size) {
      const drop = this.buf.shift()!;
      this._sum -= drop;
      this._sumSq -= drop * drop;
    }
    return this;
  }

  get filled(): boolean {
    return this.buf.length === this.size;
  }

  get length(): number {
    return this.buf.length;
  }

  mean(): number {
    return this.buf.length ? this._sum / this.buf.length : NaN;
  }

  variance(): number {
    const n = this.buf.length;
    if (n < 2) return NaN;
    const m = this.mean();
    let s = 0;
    for (const x of this.buf) {
      const d = x - m;
      s += d * d;
    }
    return s / n;
  }

  stdev(): number {
    return Math.sqrt(this.variance());
  }

  first(): number | undefined {
    return this.buf[0];
  }

  last(): number | undefined {
    return this.buf[this.buf.length - 1];
  }

  values(): number[] {
    return this.buf.slice();
  }
}

/**
 * Classic EMA with SMA warm-up. Caller pushes prices in order.
 *   state = new EMAState(period)
 *   for each price p: y = state.next(p)  // NaN during warm-up
 */
export class EMAState {
  readonly period: number;
  readonly k: number;
  value = NaN;
  private _seedSum = 0;
  private _count = 0;

  constructor(period: number) {
    if (!(period > 0)) throw new Error("EMA period must be > 0");
    this.period = period | 0;
    this.k = 2 / (this.period + 1);
  }

  next(x: number): number {
    if (this._count < this.period) {
      this._seedSum += x;
      this._count++;
      if (this._count === this.period) this.value = this._seedSum / this.period;
      return this.value;
    }
    this.value = (x - this.value) * this.k + this.value;
    return this.value;
  }
}

/** Wilder smoothing (ATR, ADX, RSI use this — smoother than classic EMA). */
export class WilderState {
  readonly period: number;
  value = NaN;
  private _seedSum = 0;
  private _count = 0;

  constructor(period: number) {
    if (!(period > 0)) throw new Error("Wilder period must be > 0");
    this.period = period | 0;
  }

  next(x: number): number {
    if (this._count < this.period) {
      this._seedSum += x;
      this._count++;
      if (this._count === this.period) this.value = this._seedSum / this.period;
      return this.value;
    }
    this.value = (this.value * (this.period - 1) + x) / this.period;
    return this.value;
  }
}

interface DequeEntry {
  v: number;
  i: number;
}

/** Rolling max via monotonically-decreasing deque. O(1) amortized per push. */
export class RollingMax {
  private size: number;
  private dq: DequeEntry[] = [];
  private i = 0;

  constructor(size: number) {
    this.size = size | 0;
  }

  push(x: number): number {
    const idx = this.i++;
    while (this.dq.length && this.dq[this.dq.length - 1]!.v <= x) this.dq.pop();
    this.dq.push({ v: x, i: idx });
    while (this.dq.length && this.dq[0]!.i <= idx - this.size) this.dq.shift();
    return this.value();
  }

  value(): number {
    return this.dq.length ? this.dq[0]!.v : NaN;
  }

  get filled(): boolean {
    return this.i >= this.size;
  }
}

/** Rolling min via monotonically-increasing deque. */
export class RollingMin {
  private size: number;
  private dq: DequeEntry[] = [];
  private i = 0;

  constructor(size: number) {
    this.size = size | 0;
  }

  push(x: number): number {
    const idx = this.i++;
    while (this.dq.length && this.dq[this.dq.length - 1]!.v >= x) this.dq.pop();
    this.dq.push({ v: x, i: idx });
    while (this.dq.length && this.dq[0]!.i <= idx - this.size) this.dq.shift();
    return this.value();
  }

  value(): number {
    return this.dq.length ? this.dq[0]!.v : NaN;
  }

  get filled(): boolean {
    return this.i >= this.size;
  }
}

/** True range for an individual bar (needs prevClose). */
export function trueRange(h: number, l: number, prevClose: number): number {
  if (!Number.isFinite(prevClose)) return h - l;
  return Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
}

/** Round to given precision without float artefacts (best-effort). */
export function round(n: number, dp = 8): number {
  if (!Number.isFinite(n)) return n;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Clamp to [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** NaN-safe last defined value. */
export function lastFinite(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i]!)) return arr[i]!;
  }
  return NaN;
}
