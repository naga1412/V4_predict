/**
 * IDB-backed model persistence (MLP + ensemble).
 */

import { withStore, put, get, del, req2promise } from "../data/idb.js";

const STORE = "models";

export type ModelKind = "mlp" | "ensemble";

export interface ModelRow {
  id?: IDBValidKey;
  kind: ModelKind;
  regime: string | null;
  symbol: string | null;
  tf: string | null;
  version: string;
  weights: object;
  meta: Record<string, unknown>;
  createdAt: number;
}

export interface ModelFilter {
  symbol?: string;
  tf?: string;
  version?: string;
  regime?: string | null;
  kind?: ModelKind;
}

function normalize(row: Partial<ModelRow>): ModelRow {
  if (!row || typeof row !== "object") throw new Error("modelStore: row required");
  if (!row.weights || typeof row.weights !== "object") {
    throw new Error("modelStore: weights required (object from .serialize())");
  }
  const kind = row.kind ?? "mlp";
  if (kind !== "mlp" && kind !== "ensemble") throw new Error(`modelStore: unknown kind "${kind}"`);
  return {
    kind,
    regime: row.regime ?? null,
    symbol: row.symbol ?? null,
    tf: row.tf ?? null,
    version: row.version ?? "unknown",
    weights: row.weights,
    meta: row.meta ?? {},
    createdAt: row.createdAt ?? Date.now(),
  };
}

export async function saveModel(row: Partial<ModelRow>): Promise<IDBValidKey> {
  const norm: ModelRow = normalize(row);
  if (row.id != null) norm.id = row.id;
  return put(STORE, norm);
}

export async function loadModel(id: IDBValidKey): Promise<ModelRow | undefined> {
  return get<ModelRow>(STORE, id);
}

export async function deleteModel(id: IDBValidKey): Promise<void> {
  return del(STORE, id);
}

export async function countModels(): Promise<number> {
  return withStore<number>(STORE, "readonly", (s) => req2promise<number>(s.count()));
}

export async function listAll(): Promise<ModelRow[]> {
  return withStore<ModelRow[]>(STORE, "readonly", (s) => req2promise<ModelRow[]>(s.getAll() as IDBRequest<ModelRow[]>));
}

export async function listModels(filter: ModelFilter = {}): Promise<ModelRow[]> {
  const rows = await listAll();
  return rows.filter((r) => {
    if (filter.symbol != null && r.symbol !== filter.symbol) return false;
    if (filter.tf != null && r.tf !== filter.tf) return false;
    if (filter.version != null && r.version !== filter.version) return false;
    if (filter.kind != null && r.kind !== filter.kind) return false;
    if ("regime" in filter && r.regime !== filter.regime) return false;
    return true;
  });
}

export async function latestModel(filter: ModelFilter = {}): Promise<ModelRow | null> {
  const rows = await listModels(filter);
  if (!rows.length) return null;
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows[0]!;
}

export async function loadByRegime(regime: string, filter: ModelFilter = {}): Promise<ModelRow | null> {
  return latestModel({ ...filter, regime });
}

export async function clearAll(): Promise<void> {
  return withStore<void>(STORE, "readwrite", (s) => req2promise<undefined>(s.clear() as IDBRequest<undefined>).then(() => undefined));
}
