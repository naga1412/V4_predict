/**
 * Event Calendar — proximity queries for scheduled high-impact macro events.
 */

import type { CalendarEvent } from "./types.js";

export const IMPACT = Object.freeze({ HIGH: "high" as const, MEDIUM: "medium" as const, LOW: "low" as const });

export const DEFAULT_EVENTS: readonly CalendarEvent[] = Object.freeze([
  {
    id: "fomc-2026-03-18",
    name: "FOMC rate decision",
    at: Date.UTC(2026, 2, 18, 18, 0),
    impact: "high",
    category: "macro",
    durationMs: 30 * 60 * 1000,
  },
  {
    id: "cpi-2026-04-10",
    name: "US CPI release",
    at: Date.UTC(2026, 3, 10, 12, 30),
    impact: "high",
    category: "macro",
    durationMs: 5 * 60 * 1000,
  },
  {
    id: "nfp-2026-05-01",
    name: "US Non-farm payrolls",
    at: Date.UTC(2026, 4, 1, 12, 30),
    impact: "high",
    category: "macro",
    durationMs: 5 * 60 * 1000,
  },
]);

function impactWeight(imp: string | undefined): number {
  if (imp === "high") return 3;
  if (imp === "medium") return 2;
  if (imp === "low") return 1;
  return 0;
}

export interface NearbyEvent {
  event: CalendarEvent;
  deltaMs: number;
  phase: "before" | "during" | "after";
}

export interface NearFilter {
  impact?: "high" | "medium" | "low";
  symbol?: string;
}

export interface WindowOpts {
  preMs?: number;
  postMs?: number;
  impact?: "high" | "medium" | "low";
}

export interface EventWindow {
  active: boolean;
  event: CalendarEvent | null;
  phase: "pre" | "during" | "post" | null;
}

export interface SeriesTags {
  flags: Uint8Array;
  weights: Int8Array;
}

export class EventCalendar {
  private _events: CalendarEvent[] = [];

  constructor(events: CalendarEvent[] = []) {
    this.replace(events);
  }

  replace(events: CalendarEvent[]): this {
    this._events = (Array.isArray(events) ? events : [])
      .filter((e) => e && Number.isFinite(e.at))
      .map((e) => ({ ...e }))
      .sort((a, b) => a.at - b.at);
    return this;
  }

  upsert(ev: CalendarEvent): this {
    if (!ev || !Number.isFinite(ev.at)) return this;
    const i = this._events.findIndex((e) => e.id === ev.id);
    if (i >= 0) this._events[i] = { ...this._events[i]!, ...ev };
    else this._events.push({ ...ev });
    this._events.sort((a, b) => a.at - b.at);
    return this;
  }

  remove(id: string): this {
    this._events = this._events.filter((e) => e.id !== id);
    return this;
  }

  all(): CalendarEvent[] {
    return this._events.slice();
  }

  count(): number {
    return this._events.length;
  }

  eventsNear(t: number, windowMs: number, filter: NearFilter = {}): NearbyEvent[] {
    const minW = impactWeight(filter.impact ?? "low");
    const out: NearbyEvent[] = [];
    for (const e of this._events) {
      if (Math.abs(e.at - t) > windowMs) continue;
      if (impactWeight(e.impact) < minW) continue;
      if (filter.symbol && Array.isArray(e.symbols) && !e.symbols.includes(filter.symbol)) continue;
      const deltaMs = e.at - t;
      const dur = e.durationMs ?? 0;
      let phase: NearbyEvent["phase"] = "before";
      if (t > e.at + dur) phase = "after";
      else if (t >= e.at) phase = "during";
      out.push({ event: e, deltaMs, phase });
    }
    return out.sort((a, b) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs));
  }

  isInEventWindow(t: number, opts: WindowOpts = {}): EventWindow {
    const { preMs = 5 * 60_000, postMs = 30 * 60_000, impact = "low" } = opts;
    const minW = impactWeight(impact);
    for (const e of this._events) {
      if (impactWeight(e.impact) < minW) continue;
      const dur = e.durationMs ?? 0;
      const start = e.at - preMs;
      const end = e.at + dur + postMs;
      if (t >= start && t <= end) {
        let phase: EventWindow["phase"] = "pre";
        if (t >= e.at + dur) phase = "post";
        else if (t >= e.at) phase = "during";
        return { active: true, event: e, phase };
      }
    }
    return { active: false, event: null, phase: null };
  }

  tagSeries(tArr: ArrayLike<number>, opts: WindowOpts = {}): SeriesTags {
    const n = tArr.length;
    const flags = new Uint8Array(n);
    const weights = new Int8Array(n);
    let p = 0;
    for (let i = 0; i < n; i++) {
      const t = +tArr[i]!;
      while (p < this._events.length) {
        const e = this._events[p]!;
        const end = e.at + (e.durationMs ?? 0) + (opts.postMs ?? 30 * 60_000);
        if (end < t) {
          p++;
          continue;
        }
        break;
      }
      let active: CalendarEvent | null = null;
      for (let q = p; q < this._events.length; q++) {
        const e = this._events[q]!;
        const start = e.at - (opts.preMs ?? 5 * 60_000);
        if (start > t) break;
        const end = e.at + (e.durationMs ?? 0) + (opts.postMs ?? 30 * 60_000);
        if (t >= start && t <= end) {
          active = e;
          break;
        }
      }
      if (active) {
        flags[i] = 1;
        weights[i] = impactWeight(active.impact);
      }
    }
    return { flags, weights };
  }

  export(): CalendarEvent[] {
    return this._events.slice();
  }

  static fromJSON(arr: CalendarEvent[]): EventCalendar {
    return new EventCalendar(arr);
  }
}

export function defaultCalendar(extra: CalendarEvent[] = []): EventCalendar {
  return new EventCalendar([...DEFAULT_EVENTS, ...extra]);
}
