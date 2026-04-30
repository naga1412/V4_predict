/**
 * IDB-backed facade over `predictions` and `validations` stores.
 */

import { withStore, put, get, del, req2promise } from "../data/idb.js";

const PSTORE = "predictions";
const VSTORE = "validations";

export type PredictionKind = "direction" | "return" | "interval" | "set";

export interface PredictionRow {
  id?: IDBValidKey;
  symbol: string;
  tf: string;
  t: number;
  closeAt: number;
  kind: PredictionKind;
  payload: Record<string, unknown>;
  version: string;
  regime: string | null;
  validated: 0 | 1;
  verdict: object | null;
  createdAt: number;
}

export interface ValidationRow {
  id?: IDBValidKey;
  predictionId: number;
  symbol: string;
  tf: string;
  t: number;
  kind: PredictionKind;
  verdict: object;
  validatedAt: number;
}

export interface PredictionFilter {
  symbol?: string;
  tf?: string;
  kind?: PredictionKind;
  version?: string;
  regime?: string | null;
  validated?: boolean | 0 | 1;
}

const VALID_KINDS = new Set<PredictionKind>(["direction", "return", "interval", "set"]);

function normalizePrediction(row: Partial<PredictionRow>): PredictionRow {
  if (!row || typeof row !== "object") throw new Error("predictionStore: row required");
  if (!row.symbol || typeof row.symbol !== "string") throw new Error("predictionStore: row.symbol required");
  if (!row.tf || typeof row.tf !== "string") throw new Error("predictionStore: row.tf required");
  if (!Number.isFinite(row.t)) throw new Error("predictionStore: row.t required");
  if (!Number.isFinite(row.closeAt)) throw new Error("predictionStore: row.closeAt required");
  const kind = (row.kind ?? "direction") as PredictionKind;
  if (!VALID_KINDS.has(kind)) throw new Error(`predictionStore: unknown kind "${kind}"`);
  if (!row.payload || typeof row.payload !== "object") throw new Error("predictionStore: row.payload required");
  return {
    symbol: row.symbol,
    tf: row.tf,
    t: row.t as number,
    closeAt: row.closeAt as number,
    kind,
    payload: row.payload,
    version: row.version ?? "unknown",
    regime: row.regime ?? null,
    validated: row.validated ? 1 : 0,
    verdict: row.verdict ?? null,
    createdAt: row.createdAt ?? Date.now(),
  };
}

export async function savePrediction(row: Partial<PredictionRow>): Promise<IDBValidKey> {
  const norm: PredictionRow = normalizePrediction(row);
  if (row.id != null) norm.id = row.id;
  return put(PSTORE, norm);
}

export async function loadPrediction(id: IDBValidKey): Promise<PredictionRow | undefined> {
  return get<PredictionRow>(PSTORE, id);
}

export async function deletePrediction(id: IDBValidKey): Promise<void> {
  return del(PSTORE, id);
}

export async function countPredictions(): Promise<number> {
  return withStore<number>(PSTORE, "readonly", (s) => req2promise<number>(s.count()));
}

export async function listAllPredictions(): Promise<PredictionRow[]> {
  return withStore<PredictionRow[]>(PSTORE, "readonly", (s) =>
    req2promise<PredictionRow[]>(s.getAll() as IDBRequest<PredictionRow[]>)
  );
}

export async function listPredictions(filter: PredictionFilter = {}): Promise<PredictionRow[]> {
  const rows = await listAllPredictions();
  return rows.filter((r) => {
    if (filter.symbol != null && r.symbol !== filter.symbol) return false;
    if (filter.tf != null && r.tf !== filter.tf) return false;
    if (filter.kind != null && r.kind !== filter.kind) return false;
    if (filter.version != null && r.version !== filter.version) return false;
    if ("regime" in filter && r.regime !== filter.regime) return false;
    if (filter.validated != null) {
      const want = filter.validated ? 1 : 0;
      if ((r.validated ? 1 : 0) !== want) return false;
    }
    return true;
  });
}

export async function duePredictions(opts: { now?: number; symbol?: string; tf?: string } = {}): Promise<PredictionRow[]> {
  const { now = Date.now(), symbol, tf } = opts;
  const rows = await listAllPredictions();
  return rows.filter((r) => {
    if (r.validated) return false;
    if (symbol != null && r.symbol !== symbol) return false;
    if (tf != null && r.tf !== tf) return false;
    return Number.isFinite(r.closeAt) && r.closeAt <= now;
  });
}

export async function markValidated(id: number, verdict: object): Promise<PredictionRow | null> {
  if (!Number.isFinite(id)) throw new Error("markValidated: id required");
  if (!verdict || typeof verdict !== "object") throw new Error("markValidated: verdict required");
  const row = await loadPrediction(id);
  if (!row) return null;
  row.validated = 1;
  row.verdict = verdict;
  await put(PSTORE, row);
  return row;
}

export async function clearPredictions(): Promise<void> {
  return withStore<void>(PSTORE, "readwrite", async (s) => {
    await req2promise(s.clear());
  });
}

function normalizeValidation(row: Partial<ValidationRow>): ValidationRow {
  if (!row || typeof row !== "object") throw new Error("predictionStore: validation row required");
  if (!Number.isFinite(row.predictionId)) throw new Error("predictionStore: validation.predictionId required");
  if (!row.symbol || !row.tf) throw new Error("predictionStore: validation.symbol & tf required");
  if (!Number.isFinite(row.t)) throw new Error("predictionStore: validation.t required");
  if (!row.verdict || typeof row.verdict !== "object") throw new Error("predictionStore: validation.verdict required");
  return {
    predictionId: row.predictionId as number,
    symbol: row.symbol as string,
    tf: row.tf as string,
    t: row.t as number,
    kind: (row.kind ?? "direction") as PredictionKind,
    verdict: row.verdict,
    validatedAt: row.validatedAt ?? Date.now(),
  };
}

export async function saveValidation(row: Partial<ValidationRow>): Promise<IDBValidKey> {
  const norm: ValidationRow = normalizeValidation(row);
  if (row.id != null) norm.id = row.id;
  return put(VSTORE, norm);
}

export async function loadValidation(id: IDBValidKey): Promise<ValidationRow | undefined> {
  return get<ValidationRow>(VSTORE, id);
}

export async function countValidations(): Promise<number> {
  return withStore<number>(VSTORE, "readonly", (s) => req2promise<number>(s.count()));
}

export async function listAllValidations(): Promise<ValidationRow[]> {
  return withStore<ValidationRow[]>(VSTORE, "readonly", (s) =>
    req2promise<ValidationRow[]>(s.getAll() as IDBRequest<ValidationRow[]>)
  );
}

export interface ValidationFilter {
  symbol?: string;
  tf?: string;
  kind?: PredictionKind;
  predictionId?: number;
  sinceT?: number;
  untilT?: number;
}

export async function listValidations(filter: ValidationFilter = {}): Promise<ValidationRow[]> {
  const rows = await listAllValidations();
  return rows.filter((r) => {
    if (filter.symbol != null && r.symbol !== filter.symbol) return false;
    if (filter.tf != null && r.tf !== filter.tf) return false;
    if (filter.kind != null && r.kind !== filter.kind) return false;
    if (filter.predictionId != null && r.predictionId !== filter.predictionId) return false;
    if (filter.sinceT != null && r.t < filter.sinceT) return false;
    if (filter.untilT != null && r.t > filter.untilT) return false;
    return true;
  });
}

export async function recentValidations(opts: { symbol?: string; tf?: string; limit?: number } = {}): Promise<ValidationRow[]> {
  const { limit = 100 } = opts;
  const all = await listValidations({ ...(opts.symbol ? { symbol: opts.symbol } : {}), ...(opts.tf ? { tf: opts.tf } : {}) });
  all.sort((a, b) => (b.validatedAt ?? 0) - (a.validatedAt ?? 0));
  return all.slice(0, Math.max(0, limit | 0));
}

export async function clearValidations(): Promise<void> {
  return withStore<void>(VSTORE, "readwrite", async (s) => {
    await req2promise(s.clear());
  });
}

export async function clearAll(): Promise<void> {
  await clearPredictions();
  await clearValidations();
}
