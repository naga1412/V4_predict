import { neutral, clampSignal, num, getSeries, getObj, type ModuleCtx, type ModuleMeta, type Signal } from "./baseModule.js";
import type { TAOutput } from "../ta/engine.js";

export const meta: ModuleMeta = Object.freeze({
  id: "breakout",
  name: "Breakout",
  category: "structure",
  description: "Recent BoS/CHoCH with volume confirmation",
  weight: 1.1,
});

function smaLast(arr: ArrayLike<number> | undefined, period = 20): number {
  if (!arr || !Number.isInteger(arr.length) || arr.length === 0) return NaN;
  const n = Math.min(period, arr.length);
  let s = 0;
  let c = 0;
  for (let i = arr.length - n; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isFinite(v)) {
      s += v as number;
      c++;
    }
  }
  return c > 0 ? s / c : NaN;
}

interface Break { i?: number; t?: number; type?: string; dir?: string; level?: number }

export function evaluate(ta: TAOutput, ctx: ModuleCtx = {}): Signal {
  const lookback = ctx.lookback ?? 10;
  const breaks = getObj<Break[]>(ta, "breaks") ?? [];
  if (breaks.length === 0) return neutral("no structural breaks");
  const closeArr = getSeries(ta, "close");
  const lastIdx = (closeArr?.length ?? 1) - 1;

  let recent: Break | null = null;
  for (let i = breaks.length - 1; i >= 0; i--) {
    const b = breaks[i]!;
    if (!Number.isInteger(b.i)) continue;
    if (lastIdx - (b.i as number) <= lookback) {
      recent = b;
      break;
    }
    break;
  }
  if (!recent) return clampSignal({ signal: 0, confidence: 0.05, reasons: [`no break in last ${lookback} bars`] });

  const dir =
    recent.dir === "up" || /up/i.test(recent.type ?? "") ? 1
    : recent.dir === "down" || /down/i.test(recent.type ?? "") ? -1 : 0;
  if (dir === 0) return neutral("break direction unknown");

  const volArr = getSeries(ta, "volume");
  const vol = volArr ? volArr[recent.i as number] : NaN;
  const sliceEnd = (recent.i as number) + 1;
  const sliced = volArr && typeof (volArr as number[]).slice === "function"
    ? (volArr as number[]).slice(0, sliceEnd)
    : volArr;
  const vsma = smaLast(sliced, 20);
  const volRel = num((vol as number) / (vsma || 1), 1);
  const volBoost = volRel >= 2 ? 0.3 : volRel >= 1.5 ? 0.2 : volRel >= 1.2 ? 0.1 : 0;

  const age = lastIdx - (recent.i as number);
  const recencyBoost = age <= 2 ? 0.25 : age <= 5 ? 0.15 : 0.05;

  const isChoch = /CHoCH/i.test(recent.type ?? "");
  const base = isChoch ? 0.4 : 0.5;
  const signal = dir * Math.min(1, base + volBoost + recencyBoost);
  const confidence = Math.min(1, base + volBoost + recencyBoost * 0.8);

  return clampSignal({
    signal, confidence,
    reasons: [
      `${recent.type ?? "break"} ${dir > 0 ? "up" : "down"}`,
      `${age} bar${age === 1 ? "" : "s"} ago`,
      `volume ${volRel.toFixed(2)}× avg`,
    ],
    payload: { break: recent, volRel },
  });
}
