/**
 * Module Registry — imports all 15 analysis modules.
 */

import * as trendFollow from "./trendFollow.js";
import * as meanReversion from "./meanReversion.js";
import * as momentum from "./momentum.js";
import * as breakout from "./breakout.js";
import * as supportResistance from "./supportResistance.js";
import * as volatilityRegime from "./volatilityRegime.js";
import * as volumeProfile from "./volumeProfile.js";
import * as candlePatterns from "./candlePatterns.js";
import * as orderBlocks from "./orderBlocks.js";
import * as liquidity from "./liquidity.js";
import * as premiumDiscount from "./premiumDiscount.js";
import * as sessionCalendar from "./sessionCalendar.js";
import * as cisd from "./cisd.js";
import * as trendline from "./trendline.js";
import * as chartPatterns from "./chartPatterns.js";
import type { Module, ModuleMeta } from "./baseModule.js";

export const MODULES: readonly Module[] = Object.freeze([
  trendFollow,
  meanReversion,
  momentum,
  breakout,
  supportResistance,
  volatilityRegime,
  volumeProfile,
  candlePatterns,
  orderBlocks,
  liquidity,
  premiumDiscount,
  sessionCalendar,
  cisd,
  trendline,
  chartPatterns,
] as Module[]);

export const MODULES_BY_ID: Readonly<Record<string, Module>> = Object.freeze(
  Object.fromEntries(MODULES.map((m) => [m.meta.id, m]))
);

export function listModules(): ModuleMeta[] {
  return MODULES.map((m) => ({ ...m.meta }));
}

export function getModule(id: string): Module | null {
  return MODULES_BY_ID[id] ?? null;
}
