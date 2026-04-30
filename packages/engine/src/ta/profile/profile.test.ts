/**
 * Smoke tests for volume profile.
 */
import { describe, it, expect } from "vitest";
import {
  tpoLetter, bucketIndex, valueArea, computeVolumeProfile, summarizeProfile,
} from "./volumeProfileEnhanced.js";
import type { Bar } from "../structure/types.js";

describe("volumeProfile helpers", () => {
  it("tpoLetter spreadsheet-style", () => {
    expect(tpoLetter(0)).toBe("A");
    expect(tpoLetter(25)).toBe("Z");
    expect(tpoLetter(26)).toBe("AA");
    expect(tpoLetter(27)).toBe("AB");
  });
  it("bucketIndex bounds", () => {
    expect(bucketIndex(50, 0, 100, 10)).toBe(5);
    expect(bucketIndex(-1, 0, 100, 10)).toBe(-1);
    expect(bucketIndex(150, 0, 100, 10)).toBe(9);
    expect(bucketIndex(NaN, 0, 100, 10)).toBe(-1);
  });
});

describe("computeVolumeProfile", () => {
  function makeBars(n = 100): Bar[] {
    const bars: Bar[] = [];
    let seed = 21;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < n; i++) {
      const c = 100 + Math.sin(i / 6) * 4 + (rand() - 0.5) * 0.3;
      const h = c + Math.abs(rand()) * 0.5;
      const l = c - Math.abs(rand()) * 0.5;
      bars.push({ t: 1_700_000_000_000 + i * 60_000, o: c, h, l, c, v: 100 + rand() * 50 });
    }
    return bars;
  }

  it("returns a valid bundle", () => {
    const bundle = computeVolumeProfile(makeBars(), { buckets: 16, lookback: 100 });
    expect(bundle).not.toBeNull();
    expect(bundle!.rows.length).toBe(16);
    expect(bundle!.pocIdx).toBeGreaterThanOrEqual(0);
    expect(bundle!.totalVolume).toBeGreaterThan(0);
    expect(bundle!.rows.some((r) => r.isPOC)).toBe(true);
  });

  it("VAH >= POC >= VAL price", () => {
    const bundle = computeVolumeProfile(makeBars())!;
    if (Number.isFinite(bundle.vahPrice) && Number.isFinite(bundle.valPrice)) {
      expect(bundle.vahPrice).toBeGreaterThanOrEqual(bundle.pocPrice);
      expect(bundle.pocPrice).toBeGreaterThanOrEqual(bundle.valPrice);
    }
  });

  it("valueArea reaches >= target on uniform input", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      idx: i, lo: i, hi: i + 1, mid: i + 0.5,
      vol: 10, up: 5, dn: 5, tpo: [],
      isPOC: false, isVAH: false, isVAL: false, inValueArea: false,
      density: null as null,
    }));
    const va = valueArea(rows, 5, { valueAreaPct: 0.7 });
    expect(va.areaPct).toBeGreaterThanOrEqual(0.7);
  });

  it("summarizeProfile for null", () => {
    expect(summarizeProfile(null)).toBeNull();
  });
});
