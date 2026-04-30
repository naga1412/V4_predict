/**
 * Drift detection helpers — rolling-accuracy + Page-Hinkley change detection.
 */

export interface PageHinkleyState {
  mean: number;
  cumSum: number;
  minSum: number;
  n: number;
  triggered: boolean;
  triggeredAt?: number;
}

export interface PageHinkleyOpts {
  delta?: number;
  lambda?: number;
}

/** Page-Hinkley test for distribution drift. Update with each new observation. */
export function newPageHinkley(): PageHinkleyState {
  return { mean: 0, cumSum: 0, minSum: 0, n: 0, triggered: false };
}

export function updatePageHinkley(
  state: PageHinkleyState,
  x: number,
  opts: PageHinkleyOpts = {}
): PageHinkleyState {
  const { delta = 0.005, lambda = 50 } = opts;
  state.n += 1;
  state.mean = state.mean + (x - state.mean) / state.n;
  state.cumSum += x - state.mean - delta;
  if (state.cumSum < state.minSum) state.minSum = state.cumSum;
  const ph = state.cumSum - state.minSum;
  if (ph > lambda && !state.triggered) {
    state.triggered = true;
    state.triggeredAt = Date.now();
  }
  return state;
}

export interface RollingAccuracyOpts {
  window?: number;
}

export interface RollingAccuracy {
  push: (correct: 0 | 1) => void;
  value: () => number;
  count: () => number;
  reset: () => void;
}

export function rollingAccuracy(opts: RollingAccuracyOpts = {}): RollingAccuracy {
  const { window = 100 } = opts;
  const buf: (0 | 1)[] = [];
  let sum = 0;
  return {
    push(correct) {
      buf.push(correct);
      sum += correct;
      if (buf.length > window) {
        const drop = buf.shift()!;
        sum -= drop;
      }
    },
    value() {
      return buf.length > 0 ? sum / buf.length : NaN;
    },
    count() {
      return buf.length;
    },
    reset() {
      buf.length = 0;
      sum = 0;
    },
  };
}

/** EWMA accuracy. */
export interface EWMAState {
  value: number;
  alpha: number;
  n: number;
}

export function newEWMA(alpha = 0.1): EWMAState {
  return { value: 0, alpha, n: 0 };
}

export function updateEWMA(state: EWMAState, x: number): EWMAState {
  state.n += 1;
  state.value = state.n === 1 ? x : state.alpha * x + (1 - state.alpha) * state.value;
  return state;
}
