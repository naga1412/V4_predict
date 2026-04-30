/**
 * Smoke tests for all Wave 5 indicators.
 * Each test verifies: shape (length matches input), warm-up NaN window,
 * post-warm-up finite values, and key range invariants.
 */
import { describe, it, expect } from "vitest";
import {
  sma, ema, wma, dema, tema,
  rsi, macd, stochastic, roc,
  atr, adx,
  bbands, keltner,
  vwap, obv, cmf,
  mfi, cci, williamsR, psar, ichimoku,
} from "./index.js";

/** Deterministic OHLC series — sine-wave price + small drift, fixed RNG. */
function makeSeries(n = 200) {
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  const volume: number[] = [];
  const t: number[] = [];
  let seed = 1;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) {
    const base = 100 + Math.sin(i / 10) * 5 + i * 0.05;
    const noise = (rand() - 0.5) * 0.6;
    const c = base + noise;
    const h = c + Math.abs(rand()) * 0.4;
    const l = c - Math.abs(rand()) * 0.4;
    high.push(h);
    low.push(l);
    close.push(c);
    volume.push(1000 + rand() * 500);
    t.push(1_700_000_000_000 + i * 60_000);
  }
  return { high, low, close, volume, t };
}

const finiteCount = (a: ArrayLike<number>): number => {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]!)) c++;
  return c;
};

describe("moving averages", () => {
  const { close } = makeSeries();
  it("sma length and warm-up", () => {
    const out = sma(close, 20);
    expect(out.length).toBe(close.length);
    expect(Number.isNaN(out[18]!)).toBe(true);
    expect(Number.isFinite(out[19]!)).toBe(true);
    expect(Number.isFinite(out.at(-1)!)).toBe(true);
  });
  it("ema converges towards series", () => {
    const out = ema(close, 14);
    expect(Number.isFinite(out.at(-1)!)).toBe(true);
    expect(Math.abs(out.at(-1)! - close.at(-1)!)).toBeLessThan(15);
  });
  it("wma, dema, tema produce finite tails", () => {
    expect(Number.isFinite(wma(close, 14).at(-1)!)).toBe(true);
    expect(Number.isFinite(dema(close, 14).at(-1)!)).toBe(true);
    expect(Number.isFinite(tema(close, 14).at(-1)!)).toBe(true);
  });
});

describe("oscillators", () => {
  const { high, low, close } = makeSeries();
  it("rsi in [0,100]", () => {
    const out = rsi(close, 14);
    for (let i = 14; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(100);
    }
  });
  it("macd shape", () => {
    const r = macd(close);
    expect(r.macd.length).toBe(close.length);
    expect(r.signal.length).toBe(close.length);
    expect(r.hist.length).toBe(close.length);
    expect(Number.isFinite(r.hist.at(-1)!)).toBe(true);
  });
  it("stochastic %K in [0,100]", () => {
    const r = stochastic(high, low, close);
    for (let i = 14; i < r.k.length; i++) {
      expect(r.k[i]).toBeGreaterThanOrEqual(0);
      expect(r.k[i]).toBeLessThanOrEqual(100);
    }
  });
  it("roc finite tail", () => {
    expect(Number.isFinite(roc(close, 10).at(-1)!)).toBe(true);
  });
});

describe("volatility", () => {
  const { high, low, close } = makeSeries();
  it("atr non-negative", () => {
    const out = atr(high, low, close, 14);
    expect(Number.isFinite(out.at(-1)!)).toBe(true);
    expect(out.at(-1)!).toBeGreaterThanOrEqual(0);
  });
  it("adx output shape and ranges", () => {
    const r = adx(high, low, close, 14);
    expect(r.adx.length).toBe(close.length);
    const last = r.adx.at(-1)!;
    expect(Number.isFinite(last)).toBe(true);
    expect(last).toBeGreaterThanOrEqual(0);
    expect(last).toBeLessThanOrEqual(100);
  });
});

describe("bands", () => {
  const { close, high, low } = makeSeries();
  it("bbands up >= mid >= lo", () => {
    const r = bbands(close, 20, 2);
    for (let i = 19; i < r.mid.length; i++) {
      expect(r.up[i]!).toBeGreaterThanOrEqual(r.mid[i]!);
      expect(r.mid[i]!).toBeGreaterThanOrEqual(r.lo[i]!);
    }
  });
  it("keltner uses precomputed ema+atr", () => {
    const e = ema(close, 20);
    const a = atr(high, low, close, 14);
    const r = keltner(e, a, 2);
    expect(r.up.length).toBe(close.length);
    expect(Number.isFinite(r.up.at(-1)!)).toBe(true);
  });
});

describe("volume indicators", () => {
  const { high, low, close, volume, t } = makeSeries();
  it("vwap rolling produces finite tail", () => {
    expect(Number.isFinite(vwap(high, low, close, volume).at(-1)!)).toBe(true);
  });
  it("vwap anchored requires t", () => {
    expect(Number.isFinite(vwap(high, low, close, volume, { mode: "anchored", t }).at(-1)!)).toBe(true);
  });
  it("obv first=0, monotonic-ish", () => {
    const out = obv(close, volume);
    expect(out[0]).toBe(0);
    expect(Number.isFinite(out.at(-1)!)).toBe(true);
  });
  it("cmf in [-1,1]", () => {
    const out = cmf(high, low, close, volume, 20);
    for (let i = 19; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(-1);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe("misc indicators", () => {
  const { high, low, close, volume } = makeSeries();
  it("mfi in [0,100] modulo float drift", () => {
    const eps = 1e-9;
    const out = mfi(high, low, close, volume, 14);
    for (let i = 14; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(-eps);
      expect(out[i]).toBeLessThanOrEqual(100 + eps);
    }
  });
  it("cci finite tail", () => {
    expect(Number.isFinite(cci(high, low, close).at(-1)!)).toBe(true);
  });
  it("williamsR in [-100,0]", () => {
    const out = williamsR(high, low, close, 14);
    for (let i = 13; i < out.length; i++) {
      expect(out[i]).toBeLessThanOrEqual(0);
      expect(out[i]).toBeGreaterThanOrEqual(-100);
    }
  });
  it("psar trend ∈ {-1,+1}, output finite", () => {
    const r = psar(high, low);
    expect(r.psar.length).toBe(high.length);
    for (let i = 0; i < r.trend.length; i++) {
      expect(Math.abs(r.trend[i]!)).toBe(1);
    }
    expect(Number.isFinite(r.psar.at(-1)!)).toBe(true);
  });
  it("ichimoku produces 5 aligned arrays", () => {
    const r = ichimoku(high, low, close);
    expect(r.tenkan.length).toBe(close.length);
    expect(r.kijun.length).toBe(close.length);
    expect(r.senkouA.length).toBe(close.length);
    expect(r.senkouB.length).toBe(close.length);
    expect(r.chikou.length).toBe(close.length);
    expect(finiteCount(r.tenkan)).toBeGreaterThan(0);
  });
});
