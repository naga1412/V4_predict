import { beforeEach, describe, expect, it } from "vitest";
import type { Prediction, Verdict } from "../types.js";
import {
  buildMistake,
  classifyError,
  clearAll,
  count,
  recent,
  recordMistake,
  startAutoRecorder,
  summary,
} from "./mistakeLedger.js";
import { EventBus } from "../core/bus.js";

/* ───────── Fixtures ───────── */

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    id: 1,
    symbol: "BTCUSDT",
    tf: "1h",
    t: 1_700_000_000_000,
    kind: "direction",
    payload: { direction: "long", probability: 0.7, refPrice: 30000 },
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    kind: "direction",
    hit: false,
    realized: -0.02,
    realizedDir: "down",
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAll();
});

/* ═══════════════════════════ classifyError ═══════════════════════════ */

describe("classifyError", () => {
  it("returns null when prediction or verdict is missing", () => {
    expect(classifyError(null as unknown as Prediction, makeVerdict())).toBeNull();
    expect(classifyError(makePrediction(), null as unknown as Verdict)).toBeNull();
  });

  it("returns null when verdict.abstain is true", () => {
    expect(classifyError(makePrediction(), makeVerdict({ abstain: true }))).toBeNull();
  });

  it("direction — hit=true → null (not a mistake)", () => {
    expect(classifyError(makePrediction(), makeVerdict({ hit: true }))).toBeNull();
  });

  it("direction — hit=false → errorType:direction with ATR-normalized mag", () => {
    const result = classifyError(makePrediction(), makeVerdict({ hit: false, realized: -0.02 }), {
      atr: 0.01,
    });
    expect(result).not.toBeNull();
    expect(result?.errorType).toBe("direction");
    expect(typeof result?.errorMag).toBe("number");
    expect(result?.errorMag).toBeGreaterThan(0);
  });

  it("direction — hit=false without atr → uses |realizedRet| directly", () => {
    const result = classifyError(
      makePrediction(),
      makeVerdict({ hit: false, realized: -0.05 })
    );
    expect(result?.errorType).toBe("direction");
    expect(result?.errorMag).toBeCloseTo(0.05, 4);
  });

  it("direction — hit=false with non-finite realized → errorMag=1.0", () => {
    const result = classifyError(
      makePrediction(),
      { kind: "direction", hit: false }
    );
    expect(result?.errorMag).toBe(1.0);
  });

  it("interval — covered=false → interval-miss", () => {
    const pred = makePrediction({ kind: "interval" });
    const verdict = makeVerdict({ kind: "interval", covered: false, centreResidual: 0.03 });
    const result = classifyError(pred, verdict);
    expect(result?.errorType).toBe("interval-miss");
    expect(result?.errorMag).toBeCloseTo(0.03, 4);
  });

  it("interval — covered=true → null", () => {
    const pred = makePrediction({ kind: "interval" });
    const verdict = makeVerdict({ kind: "interval", covered: true });
    expect(classifyError(pred, verdict)).toBeNull();
  });

  it("return — absError > atr → magnitude error", () => {
    const pred = makePrediction({ kind: "return" });
    const verdict = makeVerdict({ kind: "return", absError: 0.02 });
    const result = classifyError(pred, verdict, { atr: 0.01 });
    expect(result?.errorType).toBe("magnitude");
    expect(result?.errorMag).toBeCloseTo(2.0, 4);
  });

  it("return — absError <= atr → null (not a meaningful miss)", () => {
    const pred = makePrediction({ kind: "return" });
    const verdict = makeVerdict({ kind: "return", absError: 0.005 });
    expect(classifyError(pred, verdict, { atr: 0.01 })).toBeNull();
  });

  it("set — covered=false → set-miss", () => {
    const pred = makePrediction({ kind: "set" });
    const verdict = makeVerdict({ kind: "set", covered: false });
    expect(classifyError(pred, verdict)?.errorType).toBe("set-miss");
  });

  it("unknown kind → null", () => {
    const pred = makePrediction({ kind: "direction" });
    const verdict = makeVerdict({ kind: "unknown-kind" });
    expect(classifyError(pred, verdict)).toBeNull();
  });
});

/* ═══════════════════════════ buildMistake ═══════════════════════════ */

describe("buildMistake", () => {
  it("returns null when no error is classified (hit=true)", () => {
    const result = buildMistake({
      prediction: makePrediction(),
      verdict: makeVerdict({ hit: true }),
    });
    expect(result).toBeNull();
  });

  it("builds a Mistake row with correct field mapping", () => {
    const m = buildMistake({
      prediction: makePrediction({ id: 42 }),
      verdict: makeVerdict({ hit: false, realized: -0.02, realizedDir: "down" }),
      ta: { atr14: 0.01 },
      regime: "trending-up",
      wyckoff: "markup",
    });
    expect(m).not.toBeNull();
    expect(m?.predictionId).toBe(42);
    expect(m?.symbol).toBe("BTCUSDT");
    expect(m?.tf).toBe("1h");
    expect(m?.errorType).toBe("direction");
    expect(m?.context.regime).toBe("trending-up");
    expect(m?.context.wyckoff).toBe("markup");
    expect(m?.realized.direction).toBe("down");
  });

  it("captures topModules sorted by |signal × confidence|, capped at 4", () => {
    const m = buildMistake({
      prediction: makePrediction(),
      verdict: makeVerdict(),
      orch: {
        signals: [
          { id: "m1", signal: 0.9, confidence: 0.8 },
          { id: "m2", signal: 0.1, confidence: 0.1 },
          { id: "m3", signal: 0.5, confidence: 0.9 },
          { id: "m4", signal: 0.3, confidence: 0.7 },
          { id: "m5", signal: 0.2, confidence: 0.6 },
        ],
      },
    });
    expect(m?.context.topModules).toHaveLength(4);
    // First should be m1 (0.9 * 0.8 = 0.72)
    expect(m?.context.topModules?.[0]?.moduleId).toBe("m1");
  });

  it("captures orch.featureVec when provided", () => {
    const fv = [0.1, 0.2, 0.3];
    const m = buildMistake({
      prediction: makePrediction(),
      verdict: makeVerdict(),
      orch: { featureVec: fv },
    });
    expect(m?.context.featureVec).toEqual(fv);
  });

  it("falls back to ta.lastFeatureVec when orch.featureVec is absent", () => {
    const fv = [0.4, 0.5];
    const m = buildMistake({
      prediction: makePrediction(),
      verdict: makeVerdict(),
      ta: { lastFeatureVec: fv },
    });
    expect(m?.context.featureVec).toEqual(fv);
  });

  it("inverts long→short direction when realizedDir is absent", () => {
    const m = buildMistake({
      prediction: makePrediction({ payload: { direction: "long" } }),
      verdict: { kind: "direction", hit: false },
    });
    expect(m?.realized.direction).toBe("short");
  });

  it("extracts atr from array tail", () => {
    const m = buildMistake({
      prediction: makePrediction(),
      verdict: makeVerdict(),
      ta: { atr14: [0.008, 0.009, 0.01] },
    });
    expect(m?.context.atr).toBeCloseTo(0.01, 4);
  });
});

/* ═══════════════════════════ recordMistake / IDB round-trip ═══════════════════════════ */

describe("recordMistake", () => {
  it("throws on non-object input", async () => {
    await expect(recordMistake(null as unknown as Parameters<typeof recordMistake>[0])).rejects
      .toThrow("recordMistake: object required");
  });

  it("persists a Mistake and returns a valid id", async () => {
    const m = buildMistake({ prediction: makePrediction(), verdict: makeVerdict() })!;
    const id = await recordMistake(m);
    expect(typeof id === "number" || typeof id === "string").toBe(true);
    expect(await count()).toBe(1);
  });

  it("emits mistake:recorded event", async () => {
    const events: unknown[] = [];
    const off = EventBus.on("mistake:recorded", (e) => events.push(e));
    const m = buildMistake({ prediction: makePrediction(), verdict: makeVerdict() })!;
    await recordMistake(m);
    off();
    expect(events).toHaveLength(1);
  });
});

/* ═══════════════════════════ recent() ═══════════════════════════ */

describe("recent", () => {
  async function seed(n: number) {
    for (let i = 0; i < n; i++) {
      const m = buildMistake({
        prediction: makePrediction({ id: i + 1, t: 1_700_000_000_000 + i * 1000 }),
        verdict: makeVerdict(),
        regime: i % 2 === 0 ? "trending" : "ranging",
      })!;
      await recordMistake(m);
    }
  }

  it("returns newest first", async () => {
    await seed(5);
    const rows = await recent({ limit: 5 });
    expect(rows).toHaveLength(5);
    // descending by insertion order (index)
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i]!.t).toBeGreaterThanOrEqual(rows[i + 1]!.t);
    }
  });

  it("respects limit", async () => {
    await seed(10);
    expect(await recent({ limit: 3 })).toHaveLength(3);
  });

  it("filters by symbol", async () => {
    await seed(3);
    await recordMistake(
      buildMistake({
        prediction: makePrediction({ symbol: "ETHUSDT", id: 99 }),
        verdict: makeVerdict(),
      })!
    );
    const eth = await recent({ symbol: "ETHUSDT" });
    expect(eth).toHaveLength(1);
    expect(eth[0]?.symbol).toBe("ETHUSDT");
  });

  it("filters by regime", async () => {
    await seed(6); // 3 trending, 3 ranging
    const trending = await recent({ regime: "trending", limit: 100 });
    expect(trending.every((r) => r.context.regime === "trending")).toBe(true);
  });

  it("filters by errorType", async () => {
    await seed(3);
    const direction = await recent({ errorType: "direction" });
    expect(direction.every((r) => r.errorType === "direction")).toBe(true);
  });
});

/* ═══════════════════════════ summary() ═══════════════════════════ */

describe("summary", () => {
  it("returns zeroed result on empty store", async () => {
    const s = await summary();
    expect(s.total).toBe(0);
    expect(s.lastT).toBeNull();
  });

  it("aggregates byErrorType correctly", async () => {
    for (let i = 0; i < 3; i++) {
      await recordMistake(
        buildMistake({ prediction: makePrediction({ id: i + 1 }), verdict: makeVerdict() })!
      );
    }
    const s = await summary();
    expect(s.total).toBe(3);
    expect(s.byErrorType["direction"]).toBe(3);
  });

  it("tracks lastT as the most recent prediction timestamp", async () => {
    await recordMistake(
      buildMistake({
        prediction: makePrediction({ id: 1, t: 1_000 }),
        verdict: makeVerdict(),
      })!
    );
    await recordMistake(
      buildMistake({
        prediction: makePrediction({ id: 2, t: 9_000 }),
        verdict: makeVerdict(),
      })!
    );
    const s = await summary();
    expect(s.lastT).toBe(9_000);
  });
});

/* ═══════════════════════════ clearAll() ═══════════════════════════ */

describe("clearAll", () => {
  it("wipes the store", async () => {
    await recordMistake(
      buildMistake({ prediction: makePrediction(), verdict: makeVerdict() })!
    );
    expect(await count()).toBe(1);
    await clearAll();
    expect(await count()).toBe(0);
  });
});

/* ═══════════════════════════ startAutoRecorder() ═══════════════════════════ */

describe("startAutoRecorder", () => {
  it("throws when getCtx is not a function", () => {
    expect(() =>
      startAutoRecorder({ getCtx: null as unknown as () => Record<string, never> })
    ).toThrow("getCtx() resolver required");
  });

  it("auto-records when validation:verdict is emitted with a miss", async () => {
    const off = startAutoRecorder({ getCtx: () => ({}) });
    EventBus.emit("validation:verdict", {
      prediction: makePrediction({ id: 77 }),
      verdict: makeVerdict({ hit: false }),
    });
    // allow the async handler to complete
    await new Promise((r) => setTimeout(r, 10));
    off();
    expect(await count()).toBe(1);
  });

  it("does not record when verdict is a hit", async () => {
    const off = startAutoRecorder({ getCtx: () => ({}) });
    EventBus.emit("validation:verdict", {
      prediction: makePrediction({ id: 77 }),
      verdict: makeVerdict({ hit: true }),
    });
    await new Promise((r) => setTimeout(r, 10));
    off();
    expect(await count()).toBe(0);
  });

  it("off() stops recording", async () => {
    const off = startAutoRecorder({ getCtx: () => ({}) });
    off();
    EventBus.emit("validation:verdict", {
      prediction: makePrediction({ id: 77 }),
      verdict: makeVerdict({ hit: false }),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(await count()).toBe(0);
  });
});
