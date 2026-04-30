/**
 * Smoke tests for Wave 6 structure modules.
 */
import { describe, it, expect } from "vitest";
import {
  findPivots, classifyPivots, currentTrend,
  detectBreaks,
  detectFVG,
  detectOrderBlocks,
  detectLiquidity,
  premiumDiscount,
  sessionOf, tagSessions, sessionStats,
  detectTrendlines, positionInChannel, leastSquares,
} from "./index.js";
import { clusterLevels } from "../levels/supportResistance.js";
import type { Bar } from "./types.js";

/** Deterministic OHLCV series with clear up-then-down structure. */
function makeBars(n = 200): Bar[] {
  const bars: Bar[] = [];
  let seed = 7;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) {
    // up trend for first 100, down trend after
    const drift = i < 100 ? i * 0.4 : 40 - (i - 100) * 0.4;
    const wave = Math.sin(i / 8) * 3;
    const c = 100 + drift + wave + (rand() - 0.5) * 0.5;
    const h = c + Math.abs(rand()) * 0.6;
    const l = c - Math.abs(rand()) * 0.6;
    const o = c + (rand() - 0.5) * 0.3;
    bars.push({ t: 1_700_000_000_000 + i * 60_000, o, h, l, c, v: 1000 + rand() * 500 });
  }
  return bars;
}

describe("swings", () => {
  const bars = makeBars();
  const piv = findPivots(bars);
  it("returns alternating high/low pivots", () => {
    expect(piv.length).toBeGreaterThan(5);
    const kinds = new Set(piv.map((p) => p.kind));
    expect(kinds.has("high")).toBe(true);
    expect(kinds.has("low")).toBe(true);
  });
  it("classifyPivots assigns class", () => {
    const cls = classifyPivots(piv.slice());
    expect(cls.every((p) => p.class !== undefined)).toBe(true);
  });
  it("currentTrend produces a known label", () => {
    const cls = classifyPivots(piv.slice());
    const t = currentTrend(cls);
    expect(["up", "down", "range", "unknown"]).toContain(t);
  });
});

describe("bos", () => {
  it("emits BoS/CHoCH events", () => {
    const bars = makeBars();
    const piv = classifyPivots(findPivots(bars));
    const ev = detectBreaks(bars, piv);
    expect(Array.isArray(ev)).toBe(true);
    if (ev.length > 0) {
      expect(["BoS", "CHoCH"]).toContain(ev[0]!.type);
      expect(["up", "down"]).toContain(ev[0]!.dir);
    }
  });
});

describe("fvg", () => {
  it("detects gaps and tracks mitigation", () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) {
      const c = 100 + i;
      bars.push({ t: 1000 + i * 60, o: c, h: c + 0.2, l: c - 0.2, c, v: 1 });
    }
    // Inject a clear bullish FVG: bar[i-2].h=10.2, gap, bar[i].l=12
    bars[10] = { t: 1000 + 10 * 60, o: 110, h: 110.2, l: 109.8, c: 110, v: 1 };
    bars[11] = { t: 1000 + 11 * 60, o: 110, h: 111.5, l: 109.9, c: 111.5, v: 1 };
    bars[12] = { t: 1000 + 12 * 60, o: 112, h: 112.4, l: 112.0, c: 112.3, v: 1 };
    const r = detectFVG(bars);
    expect(r.open.length + r.mitigated.length).toBeGreaterThan(0);
  });
});

describe("orderBlocks", () => {
  it("returns array (may be empty for noisy series)", () => {
    const bars = makeBars();
    const piv = findPivots(bars);
    const blocks = detectOrderBlocks(bars, piv);
    expect(Array.isArray(blocks)).toBe(true);
  });
});

describe("liquidity", () => {
  it("requires positive tolerance", () => {
    const bars = makeBars();
    const piv = findPivots(bars);
    const r = detectLiquidity(bars, piv, { tolerance: 0 });
    expect(r.eqHighs.length).toBe(0);
    expect(r.eqLows.length).toBe(0);
  });
  it("clusters with positive tolerance", () => {
    const bars = makeBars();
    const piv = findPivots(bars);
    const r = detectLiquidity(bars, piv, { tolerance: 1.5, minTouches: 2 });
    expect(Array.isArray(r.eqHighs)).toBe(true);
    expect(Array.isArray(r.sweeps)).toBe(true);
  });
});

describe("premiumDiscount", () => {
  it("classifies last close into a zone", () => {
    const bars = makeBars();
    const piv = findPivots(bars);
    const pd = premiumDiscount(bars, piv);
    expect(pd).not.toBeNull();
    expect(["discount", "equilibrium", "premium", "outside"]).toContain(pd!.lastZone);
    expect(pd!.rangeHigh).toBeGreaterThan(pd!.rangeLow);
  });
});

describe("sessions", () => {
  it("tags candles by session", () => {
    const bars = makeBars(48);
    const tags = tagSessions(bars);
    expect(tags.length).toBe(bars.length);
    expect(["asia", "london", "ny-am", "ny-pm", "off-hours"]).toContain(tags[0]!);
  });
  it("computes per-session stats", () => {
    const bars = makeBars(48);
    const stats = sessionStats(bars);
    for (const v of Object.values(stats)) {
      expect(v.count).toBeGreaterThan(0);
      expect(v.avgRange).toBeGreaterThanOrEqual(0);
    }
  });
  it("sessionOf for unknown timestamp", () => {
    expect(sessionOf(NaN)).toBe("unknown");
  });
});

describe("trendlines", () => {
  it("leastSquares fits a line", () => {
    const r = leastSquares([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(r.slope).toBeCloseTo(1, 6);
    expect(r.intercept).toBeCloseTo(0, 6);
    expect(r.r2).toBeGreaterThan(0.99);
  });
  it("detectTrendlines returns a structure", () => {
    const bars = makeBars();
    const tl = detectTrendlines(bars);
    expect(tl.meta.lookback).toBeGreaterThan(0);
    if (tl.upper && tl.lower) {
      const pos = positionInChannel(tl, bars.length - 1, bars[bars.length - 1]!.c);
      // Finite when channel is well-formed; NaN if lines crossed at lastIdx — both legal.
      expect(typeof pos).toBe("number");
    }
  });
});

describe("supportResistance", () => {
  it("clusters pivots into levels sorted by strength", () => {
    const bars = makeBars();
    const piv = findPivots(bars);
    const lvl = clusterLevels(piv, { tolerance: 1.5 });
    expect(Array.isArray(lvl)).toBe(true);
    if (lvl.length >= 2) expect(lvl[0]!.strength).toBeGreaterThanOrEqual(lvl[1]!.strength);
  });
});
