/**
 * Trading session / "kill zone" tagging (UTC hours).
 *   Asia    22:00 – 02:00   (wraps midnight)
 *   London  07:00 – 10:00
 *   NY-AM   12:00 – 15:00
 *   NY-PM   13:30 – 16:00   (we use whole hours: 13–16)
 */

import type { Bar, SessionName, SessionStats } from "./types.js";

interface Session {
  name: Exclude<SessionName, "off-hours" | "unknown">;
  startH: number;
  endH: number;
}

export const SESSIONS: readonly Session[] = [
  { name: "asia", startH: 22, endH: 2 },
  { name: "london", startH: 7, endH: 10 },
  { name: "ny-am", startH: 12, endH: 15 },
  { name: "ny-pm", startH: 13, endH: 16 },
];

export interface SessionOpts {
  tzOffsetMs?: number;
}

export function sessionOf(t: number, opts: SessionOpts = {}): SessionName {
  const { tzOffsetMs = 0 } = opts;
  if (!Number.isFinite(t)) return "unknown";
  const d = new Date(t + tzOffsetMs);
  const h = d.getUTCHours();
  for (const s of SESSIONS) {
    if (s.startH <= s.endH) {
      if (h >= s.startH && h < s.endH) return s.name;
    } else {
      if (h >= s.startH || h < s.endH) return s.name;
    }
  }
  return "off-hours";
}

export function tagSessions(candles: Bar[], opts: SessionOpts = {}): SessionName[] {
  if (!Array.isArray(candles)) return [];
  return candles.map((c) => sessionOf(+c.t, opts));
}

export function sessionStats(
  candles: Bar[],
  opts: SessionOpts = {}
): Record<string, SessionStats> {
  interface Acc { count: number; sumRange: number; sumVol: number }
  const acc: Record<string, Acc> = {};
  for (const c of candles) {
    const s = sessionOf(+c.t, opts);
    if (!acc[s]) acc[s] = { count: 0, sumRange: 0, sumVol: 0 };
    acc[s]!.count++;
    acc[s]!.sumRange += +c.h - +c.l;
    acc[s]!.sumVol += +c.v;
  }
  const result: Record<string, SessionStats> = {};
  for (const [k, v] of Object.entries(acc)) {
    result[k] = {
      count: v.count,
      avgRange: v.count ? v.sumRange / v.count : 0,
      avgVol: v.count ? v.sumVol / v.count : 0,
    };
  }
  return result;
}
