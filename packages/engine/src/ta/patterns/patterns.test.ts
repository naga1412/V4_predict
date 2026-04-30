/**
 * Smoke tests for Wave 7 patterns.
 */
import { describe, it, expect } from "vitest";
import {
  isDoji, isHammer, isBullishEngulfing, isBearishEngulfing,
  isBullishHarami, isBearishHarami,
  isMorningStar, isEveningStar,
  detectAll,
  detectChartPatterns, summarizeChartPattern,
} from "./index.js";
import type { Bar } from "../structure/types.js";

const bar = (o: number, h: number, l: number, c: number, t = 0, v = 1): Bar => ({ o, h, l, c, t, v });

describe("candle patterns", () => {
  it("doji: tiny body relative to range", () => {
    expect(isDoji(bar(100, 102, 98, 100.05))).toBe(true);
    expect(isDoji(bar(100, 102, 98, 101))).toBe(false);
  });
  it("hammer: long lower shadow, small upper", () => {
    // body=0.5, lower=4.5, upper=0.1 → ratios 9.0 / 0.2 satisfy thresholds
    expect(isHammer(bar(99.5, 100.1, 95, 100))).toBe(true);
  });
  it("bullish engulfing", () => {
    const prev = bar(101, 101.5, 99.5, 100);   // bear
    const cur = bar(99.5, 102, 99, 102);        // bull engulfs
    expect(isBullishEngulfing(prev, cur)).toBe(true);
    expect(isBearishEngulfing(prev, cur)).toBe(false);
  });
  it("harami: cur body inside prev body", () => {
    const prev = bar(102, 103, 99, 99);          // bear with wide body
    const cur = bar(100, 100.5, 99.5, 100.4);    // bull tiny inside body
    expect(isBullishHarami(prev, cur)).toBe(true);
    expect(isBearishHarami(prev, cur)).toBe(false);
  });
  it("morning star: bear / small / bull above midpoint", () => {
    const c1 = bar(105, 105.5, 99, 99.5);        // bear
    const c2 = bar(99.5, 100, 98.5, 99.6);       // small body
    const c3 = bar(99.7, 104, 99.6, 103);         // bull above mid(c1)=102.25
    expect(isMorningStar(c1, c2, c3)).toBe(true);
  });
  it("evening star: bull / small / bear below midpoint", () => {
    const c1 = bar(99, 105, 99, 105);
    const c2 = bar(105, 105.5, 104.5, 105.1);
    const c3 = bar(105, 105.2, 99, 100);
    expect(isEveningStar(c1, c2, c3)).toBe(true);
  });
  it("detectAll returns hits with patterns array", () => {
    const candles: Bar[] = [
      bar(101, 101.5, 99.5, 100),
      bar(99.5, 102, 99, 102),  // bull engulf
      bar(102, 102.4, 100, 100.05), // doji-ish
    ];
    const hits = detectAll(candles);
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.some((h) => h.patterns.includes("bullEngulf"))).toBe(true);
  });
});

describe("chart patterns", () => {
  function makeBars(n = 200): Bar[] {
    const bars: Bar[] = [];
    let seed = 13;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < n; i++) {
      const c = 100 + Math.sin(i / 5) * 6 + (rand() - 0.5) * 0.4;
      const h = c + Math.abs(rand()) * 0.6;
      const l = c - Math.abs(rand()) * 0.6;
      bars.push({ t: 1_700_000_000_000 + i * 60_000, o: c - 0.05, h, l, c, v: 1000 });
    }
    return bars;
  }
  it("detectChartPatterns returns a structure", () => {
    const r = detectChartPatterns(makeBars());
    expect(Array.isArray(r.patterns)).toBe(true);
    expect(typeof r.last === "object").toBe(true);
  });
  it("summarizeChartPattern handles null", () => {
    expect(summarizeChartPattern(null)).toBeNull();
  });
});
