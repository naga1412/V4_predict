/**
 * My Next Prediction v3.0 — IndexedDB Schema
 * Single source of truth for object stores, versions, and upgrade handlers.
 * Bump DB_VERSION when a store/index changes; add an entry to MIGRATIONS.
 */

export const DB_NAME = "mnp" as const;
export const DB_VERSION = 9 as const;

interface IndexDef {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
  multiEntry?: boolean;
}

interface StoreDef {
  keyPath: string | string[];
  autoIncrement?: boolean;
  indexes?: IndexDef[];
}

export const STORES: Record<string, StoreDef> = {
  candles: {
    keyPath: ["symbol", "tf", "t"],
    indexes: [
      { name: "by_symbol_tf_t", keyPath: ["symbol", "tf", "t"], unique: true },
      { name: "by_t", keyPath: "t" },
    ],
  },
  features: {
    keyPath: ["symbol", "tf", "t"],
    indexes: [{ name: "by_version", keyPath: "version" }],
  },
  predictions: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_symbol_tf_t", keyPath: ["symbol", "tf", "t"] },
      { name: "by_validated", keyPath: "validated" },
    ],
  },
  validations: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [{ name: "by_symbol_tf_t", keyPath: ["symbol", "tf", "t"] }],
  },
  trainingPool: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_regime", keyPath: "regime" },
      { name: "by_tf", keyPath: "tf" },
      { name: "by_ts", keyPath: "ts" },
      { name: "by_version", keyPath: "version" },
    ],
  },
  regimes: {
    keyPath: ["symbol", "tf", "t"],
    indexes: [{ name: "by_regime", keyPath: "regime" }],
  },
  newsCache: {
    keyPath: "url",
    indexes: [
      { name: "by_publishedAt", keyPath: "publishedAt" },
      { name: "by_symbol", keyPath: "symbol" },
    ],
  },
  meta: {
    keyPath: "key",
  },
  models: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_regime", keyPath: "regime" },
      { name: "by_symbol_tf", keyPath: ["symbol", "tf"] },
      { name: "by_version", keyPath: "version" },
      { name: "by_createdAt", keyPath: "createdAt" },
    ],
  },
  conformalSets: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_regime", keyPath: "regime" },
      { name: "by_symbol_tf", keyPath: ["symbol", "tf"] },
      { name: "by_kind", keyPath: "kind" },
      { name: "by_version", keyPath: "version" },
      { name: "by_createdAt", keyPath: "createdAt" },
    ],
  },
  ghosts: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_symbol_tf", keyPath: ["symbol", "tf"] },
      { name: "by_anchor", keyPath: ["symbol", "tf", "anchorTime"], unique: true },
      { name: "by_resolved", keyPath: "resolved" },
      { name: "by_createdAt", keyPath: "createdAt" },
    ],
  },
  mistakes: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_t", keyPath: "t" },
      { name: "by_symbol_tf", keyPath: ["symbol", "tf"] },
      { name: "by_regime", keyPath: "context.regime" },
      { name: "by_errorType", keyPath: "errorType" },
      { name: "by_predId", keyPath: "predictionId" },
    ],
  },
  metaBrainPool: {
    keyPath: "id",
    autoIncrement: false,
    indexes: [
      { name: "by_predictionId", keyPath: "predictionId" },
      { name: "by_pending", keyPath: "pending" },
      { name: "by_t", keyPath: "t" },
      { name: "by_symbol_tf", keyPath: ["symbol", "tf"] },
    ],
  },
  antiPatterns: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      { name: "by_regime", keyPath: "regime" },
      { name: "by_hitRate", keyPath: "hitRate" },
      { name: "by_direction", keyPath: "direction" },
      { name: "by_updatedAt", keyPath: "updatedAt" },
    ],
  },
  news: {
    keyPath: "guid",
    autoIncrement: false,
    indexes: [
      { name: "by_pubDate", keyPath: "pubDate" },
      { name: "by_source", keyPath: "sourceId" },
      { name: "by_primary", keyPath: "classification.primary" },
      { name: "by_highImpact", keyPath: "classification.highImpact" },
    ],
  },
  scanResults: {
    keyPath: ["symbol", "tf"],
    autoIncrement: false,
    indexes: [
      { name: "by_scannedAt", keyPath: "scannedAt" },
      { name: "by_assetType", keyPath: "assetType" },
      { name: "by_absBias", keyPath: "absBias" },
    ],
  },
};

type MigrationFn = (db: IDBDatabase, tx?: IDBTransaction | null) => void;

function createStore(db: IDBDatabase, name: string): void {
  const def = STORES[name];
  if (!def || db.objectStoreNames.contains(name)) return;
  const store = db.createObjectStore(name, {
    keyPath: def.keyPath,
    autoIncrement: def.autoIncrement ?? false,
  });
  for (const { name: iname, keyPath, unique = false, multiEntry = false } of def.indexes ?? []) {
    store.createIndex(iname, keyPath, { unique, multiEntry });
  }
}

export const MIGRATIONS: Record<number, MigrationFn> = {
  1: (db) => {
    for (const name of Object.keys(STORES)) createStore(db, name);
  },
  2: (db) => createStore(db, "models"),
  3: (db) => createStore(db, "conformalSets"),
  4: (db) => createStore(db, "ghosts"),
  5: (db) => createStore(db, "news"),
  6: (db) => createStore(db, "mistakes"),
  7: (db) => createStore(db, "antiPatterns"),
  8: (db) => createStore(db, "metaBrainPool"),
  9: (db) => createStore(db, "scanResults"),
};
