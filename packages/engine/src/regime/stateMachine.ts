/**
 * Regime State Machine — hysteresis wrapper around classifyRegime.
 */

import type { RegimeDescriptor } from "./types.js";

const STATE_KEY = (r: RegimeDescriptor): string => `${r.trend}|${r.strength}|${r.volatility}`;

export interface FSMOpts {
  confirmBars?: number;
  maxHistory?: number;
}

export interface Transition {
  from: RegimeDescriptor | null;
  to: RegimeDescriptor;
  i: number;
  t: number | null;
}

export class RegimeFSM {
  readonly confirmBars: number;
  readonly maxHistory: number;
  current: RegimeDescriptor | null = null;
  private _pending: RegimeDescriptor | null = null;
  private _pendingCount = 0;
  private _enteredAt = 0;
  history: Transition[] = [];

  constructor(opts: FSMOpts = {}) {
    this.confirmBars = Math.max(1, opts.confirmBars ?? 3);
    this.maxHistory = opts.maxHistory ?? 200;
  }

  observe(regime: RegimeDescriptor | null, meta: { i?: number; t?: number } = {}): RegimeDescriptor | null {
    if (!regime) return this.current;
    const i = Number.isInteger(meta.i)
      ? (meta.i as number)
      : (this.current ? this._enteredAt + 1 : 0);
    const t = Number.isFinite(meta.t) ? (meta.t as number) : null;

    if (!this.current) {
      this.current = regime;
      this._enteredAt = i;
      this._recordTransition(null, regime, i, t);
      this._pending = null;
      this._pendingCount = 0;
      return this.current;
    }

    const sameAsCurrent = STATE_KEY(regime) === STATE_KEY(this.current);
    if (sameAsCurrent) {
      this._pending = null;
      this._pendingCount = 0;
      return this.current;
    }

    if (!this._pending || STATE_KEY(this._pending) !== STATE_KEY(regime)) {
      this._pending = regime;
      this._pendingCount = 1;
    } else {
      this._pendingCount++;
    }

    if (this._pendingCount >= this.confirmBars && this._pending) {
      const prev = this.current;
      this.current = this._pending;
      this._recordTransition(prev, this.current, i, t);
      this._enteredAt = i;
      this._pending = null;
      this._pendingCount = 0;
    }
    return this.current;
  }

  dwellBars(currentBarIndex?: number): number {
    if (!this.current) return 0;
    return Math.max(0, (currentBarIndex ?? 0) - this._enteredAt);
  }

  private _recordTransition(from: RegimeDescriptor | null, to: RegimeDescriptor, i: number, t: number | null): void {
    this.history.push({ from, to, i, t });
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  static runSeries(series: RegimeDescriptor[], timestamps: number[] = []): { committed: (RegimeDescriptor | null)[]; transitions: Transition[] } {
    const fsm = new RegimeFSM();
    const committed: (RegimeDescriptor | null)[] = new Array(series.length);
    for (let i = 0; i < series.length; i++) {
      committed[i] = fsm.observe(series[i]!, { i, ...(timestamps[i] != null ? { t: timestamps[i]! } : {}) });
    }
    return { committed, transitions: fsm.history };
  }

  snapshot(): {
    current: RegimeDescriptor | null;
    pending: RegimeDescriptor | null;
    pendingCount: number;
    enteredAt: number;
    transitionsCount: number;
    lastTransitions: Transition[];
  } {
    return {
      current: this.current,
      pending: this._pending,
      pendingCount: this._pendingCount,
      enteredAt: this._enteredAt,
      transitionsCount: this.history.length,
      lastTransitions: this.history.slice(-5),
    };
  }
}
