/**
 * Validation monitor — drains due predictions on a tick, computes verdicts,
 * persists them, and emits "validation:verdict" events.
 *
 * Pure scheduler — caller wires in a candle-lookup function. Designed to be
 * called from a Web Worker, page interval, or chart-tick handler.
 */

import { EventBus } from "../core/bus.js";
import {
  duePredictions,
  markValidated,
  saveValidation,
  type PredictionRow,
} from "./predictionStore.js";
import { verdictFor, type Verdict, type CandleLookup, type OHLCBar } from "./validator.js";

export interface MonitorOpts {
  symbol?: string;
  tf?: string;
  now?: number;
  band?: number;
  lookup: CandleLookup;
}

export interface MonitorResult {
  drained: number;
  verdicts: Array<{ prediction: PredictionRow; verdict: Verdict }>;
  pending: number;
}

export async function drainOnce(opts: MonitorOpts): Promise<MonitorResult> {
  if (typeof opts.lookup !== "function") throw new Error("monitor: lookup required");
  const due = await duePredictions(opts);
  const out: MonitorResult = { drained: 0, verdicts: [], pending: 0 };
  for (const p of due) {
    const target = p.t + (p.closeAt - p.t);
    const candle: OHLCBar | null | undefined = opts.lookup(p.symbol, p.tf, target);
    if (!candle) {
      out.pending++;
      continue;
    }
    const verdict = verdictFor(p, candle, opts.band !== undefined ? { band: opts.band } : {});
    if (!verdict.ok) {
      out.pending++;
      continue;
    }
    if (Number.isInteger(p.id)) await markValidated(p.id as number, verdict);
    await saveValidation({
      predictionId: p.id as number,
      symbol: p.symbol,
      tf: p.tf,
      t: p.t,
      kind: p.kind,
      verdict,
    });
    try {
      EventBus.emit("validation:verdict", { prediction: p, verdict });
    } catch {
      // suppress
    }
    out.verdicts.push({ prediction: p, verdict });
    out.drained++;
  }
  return out;
}

export interface IntervalMonitorOpts extends MonitorOpts {
  intervalMs?: number;
}

export interface IntervalMonitor {
  stop: () => void;
  forceTick: () => Promise<MonitorResult>;
}

export function startIntervalMonitor(opts: IntervalMonitorOpts): IntervalMonitor {
  const { intervalMs = 5000, ...rest } = opts;
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await drainOnce(rest);
    } catch (err) {
      try {
        EventBus.emit("monitor:error", { error: (err as Error).message });
      } catch {
        // suppress
      }
    }
  };
  const handle = setInterval(() => void tick(), Math.max(500, intervalMs));
  return {
    stop() {
      stopped = true;
      clearInterval(handle);
    },
    forceTick: () => drainOnce(rest),
  };
}
