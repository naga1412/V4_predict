/**
 * useTAEngine — runs TAEngine + orchestrator on each new candle and pushes
 * MTF bias / trade setup / regime / wyckoff / meta-brain into the Zustand store.
 *
 * Wiring:
 *   chart:history  → recompute from full bar array
 *   chart:tick     → recompute from updated bars (closed bar triggers full run;
 *                    open bar updates rolling tail only — for MVP we recompute)
 *
 * The TA work happens on the main thread for now (TAEngine.compute is
 * synchronous and fast for ≤ 500 bars). Later we can switch to TAEngineProxy.
 */
import { useEffect, useRef } from "react";
import { TAEngine, runModules, EventBus } from "@v4/engine";
import type { TAOutput } from "@v4/engine";
import { useAppStore } from "../store/appStore.js";
import type { TradeSetup, MTFBias } from "../store/appStore.js";

interface KlineCandle { t: number; o: number; h: number; l: number; c: number; v?: number; closed?: boolean }
interface BarLike { t: number; o: number; h: number; l: number; c: number; v: number }

const MAX_BARS = 500;

function toBar(c: KlineCandle): BarLike {
  return { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v ?? 0 };
}

function lastFinite(arr: ArrayLike<number> | undefined): number {
  if (!arr || !arr.length) return NaN;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i] as number;
  }
  return NaN;
}

function deriveTradeSetup(ta: TAOutput, score: number, prob: number): TradeSetup | null {
  const closeArr = (ta as { close?: number[] }).close;
  const atrArr = (ta as { atr14?: ArrayLike<number> }).atr14;
  if (!closeArr || closeArr.length === 0) return null;
  const c = closeArr[closeArr.length - 1]!;
  const atr = lastFinite(atrArr);
  if (!Number.isFinite(c) || !Number.isFinite(atr) || atr <= 0) return null;

  const signal: TradeSetup["signal"] = prob > 0.55 ? "LONG" : prob < 0.45 ? "SHORT" : "NEUTRAL";
  const dir = signal === "LONG" ? 1 : signal === "SHORT" ? -1 : 0;
  if (dir === 0) {
    return {
      signal: "NEUTRAL",
      entryMin: c - atr * 0.25,
      entryMax: c + atr * 0.25,
      tp1: c, tp2: c, sl: c,
      rrTp1: "—", rrTp2: "—",
      leverage: 1,
      atr,
      rsi: lastFinite((ta as { rsi14?: ArrayLike<number> }).rsi14),
    };
  }
  const entry = c;
  const sl = c - dir * atr * 1.5;
  const tp1 = c + dir * atr * 1.5;
  const tp2 = c + dir * atr * 3.0;
  const risk = Math.abs(entry - sl);
  const rrTp1 = (Math.abs(tp1 - entry) / Math.max(1e-9, risk)).toFixed(2);
  const rrTp2 = (Math.abs(tp2 - entry) / Math.max(1e-9, risk)).toFixed(2);
  const conf = Math.min(1, Math.abs(score));
  const leverage = signal === "NEUTRAL" ? 1 : Math.max(1, Math.round(2 + conf * 8));

  const cp = (ta as { chartPatterns?: { last?: { name?: string; bias?: string } } }).chartPatterns?.last;
  const setup: TradeSetup = {
    signal,
    entryMin: entry - atr * 0.25,
    entryMax: entry + atr * 0.25,
    tp1, tp2, sl,
    rrTp1, rrTp2,
    leverage,
    atr,
    rsi: lastFinite((ta as { rsi14?: ArrayLike<number> }).rsi14),
  };
  if (cp?.name) setup.pattern = cp.name;
  if (cp?.bias === "bullish") setup.patternBias = "Bullish";
  else if (cp?.bias === "bearish") setup.patternBias = "Bearish";
  return setup;
}

function deriveMTFBias(ta: TAOutput): MTFBias | null {
  const reg = (ta as { regime?: { trend?: string; strength?: string; alignment?: string; volatility?: string; score?: { trend?: number } } }).regime;
  const wy = (ta as { wyckoff?: { phase?: string; bias?: string } }).wyckoff;
  if (!reg) return null;
  const direction: MTFBias["direction"] =
    reg.trend === "up" ? "Bullish" : reg.trend === "down" ? "Bearish" : "Neutral";
  const confidence: MTFBias["confidence"] =
    reg.strength === "strong" ? "High" : reg.strength === "moderate" ? "Medium" : "Low";
  const score = reg.score?.trend ?? 0;
  const bullPct = Math.round(50 + score * 50);

  const tfsScore = score;
  const tfs = [
    { tf: "5m", bias: tfsScore > 0 ? "Bullish" : tfsScore < 0 ? "Bearish" : "Neutral", score: tfsScore * 0.6 },
    { tf: "15m", bias: tfsScore > 0 ? "Bullish" : tfsScore < 0 ? "Bearish" : "Neutral", score: tfsScore * 0.8 },
    { tf: "1h", bias: tfsScore > 0 ? "Bullish" : tfsScore < 0 ? "Bearish" : "Neutral", score: tfsScore },
    { tf: "4h", bias: tfsScore > 0 ? "Bullish" : tfsScore < 0 ? "Bearish" : "Neutral", score: tfsScore * 0.9 },
  ];

  return {
    direction,
    phase: wy?.phase ?? reg.alignment ?? "—",
    confidence,
    condition: `${reg.trend} · ${reg.strength} · ${reg.volatility} vol${wy?.bias && wy.bias !== "neutral" ? ` · wy ${wy.bias}` : ""}`,
    bullPct,
    aligned: Math.abs(score) > 0.4,
    tfs,
  };
}

export function useTAEngine(): void {
  const setTradeSetup = useAppStore((s) => s.setTradeSetup);
  const setMTFBias = useAppStore((s) => s.setMTFBias);
  const setRegime = useAppStore((s) => s.setRegime);
  const setWyckoffPhase = useAppStore((s) => s.setWyckoffPhase);
  const setMetaBrain = useAppStore((s) => s.setMetaBrain);

  const barsRef = useRef<BarLike[]>([]);
  const symbolRef = useRef<string>("");
  const tfRef = useRef<string>("");
  const recomputeTimerRef = useRef<number | null>(null);

  const symbol = useAppStore((s) => s.symbol);
  const timeframe = useAppStore((s) => s.timeframe);

  // Reset cache when symbol or TF changes
  useEffect(() => {
    if (symbolRef.current !== symbol || tfRef.current !== timeframe) {
      barsRef.current = [];
      symbolRef.current = symbol;
      tfRef.current = timeframe;
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    const recompute = () => {
      const bars = barsRef.current;
      if (bars.length < 50) return;
      try {
        const ta = TAEngine.compute(bars);
        const orch = runModules(ta);

        // Push regime / wyckoff
        const reg = (ta as { regime?: { label?: string } }).regime;
        const wy = (ta as { wyckoff?: { phase?: string } }).wyckoff;
        if (reg?.label) setRegime(reg.label);
        if (wy?.phase) setWyckoffPhase(wy.phase);

        // Trade setup + MTF bias
        const setup = deriveTradeSetup(ta, orch.rawScore, orch.probability);
        const bias = deriveMTFBias(ta);
        setTradeSetup(setup);
        setMTFBias(bias);

        // Meta-brain decision
        const direction = orch.direction === "long" ? "long" : orch.direction === "short" ? "short" : "neutral";
        const confSpread = (1 - orch.confidence) * 0.1;
        setMetaBrain({
          direction,
          probability: orch.probability,
          intervalLo: Math.max(0, orch.probability - confSpread),
          intervalHi: Math.min(1, orch.probability + confSpread),
          vetoed: false,
          vetoReason: null,
          champion: "default",
          retrained: null,
        });

        // Emit events for any other listeners
        try {
          EventBus.emit("ta:computed", { ta, orch });
          EventBus.emit("regime:updated", { label: reg?.label });
          EventBus.emit("metabrain:decision", {
            direction, probability: orch.probability,
            intervalLo: Math.max(0, orch.probability - confSpread),
            intervalHi: Math.min(1, orch.probability + confSpread),
            vetoed: false, vetoReason: null,
          });
        } catch {
          // suppress
        }
      } catch (err) {
        console.warn("[useTAEngine] compute failed", err);
      }
    };

    const scheduleRecompute = () => {
      if (recomputeTimerRef.current != null) return;
      recomputeTimerRef.current = window.setTimeout(() => {
        recomputeTimerRef.current = null;
        recompute();
      }, 250) as unknown as number;
    };

    const offHistory = EventBus.on<{ candles: KlineCandle[] }>("chart:history", ({ candles }) => {
      if (!candles || candles.length === 0) return;
      barsRef.current = candles.slice(-MAX_BARS).map(toBar);
      scheduleRecompute();
    });

    const offTick = EventBus.on<KlineCandle>("chart:tick", (c) => {
      if (!c) return;
      const bars = barsRef.current;
      if (bars.length === 0) return;
      const last = bars[bars.length - 1]!;
      if (c.t === last.t) {
        bars[bars.length - 1] = toBar(c);
      } else if (c.t > last.t) {
        bars.push(toBar(c));
        if (bars.length > MAX_BARS) bars.shift();
      }
      // Only recompute on closed bars to keep CPU sane
      if (c.closed) scheduleRecompute();
    });

    return () => {
      offHistory();
      offTick();
      if (recomputeTimerRef.current != null) {
        clearTimeout(recomputeTimerRef.current);
        recomputeTimerRef.current = null;
      }
    };
  }, [setTradeSetup, setMTFBias, setRegime, setWyckoffPhase, setMetaBrain]);
}
