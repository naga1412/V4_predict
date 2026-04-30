/**
 * My Next Prediction v3.0 — IndexedDB wrapper
 * Zero-dep promise-based IDB helper. Detects corruption on open (#47)
 * and surfaces quota errors (#46) via EventBus.
 */

import { DB_NAME, DB_VERSION, MIGRATIONS } from "./schema.js";
import { EventBus } from "../core/bus.js";
import { degrade } from "../core/resilience.js";

let _dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return reject(err);
    }

    req.onupgradeneeded = (e) => {
      const db = req.result;
      const fromV = e.oldVersion;
      const toV = e.newVersion ?? DB_VERSION;
      for (let v = fromV + 1; v <= toV; v++) {
        const fn = MIGRATIONS[v];
        if (typeof fn === "function") fn(db, req.transaction);
      }
    };

    req.onblocked = () => {
      EventBus.emit("idb:blocked");
      console.warn("[MNP] IDB upgrade blocked — close other tabs on older version");
    };

    req.onerror = () => {
      degrade("idb-open", req.error?.message ?? "unknown");
      reject(req.error);
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        console.warn("[MNP] IDB version change detected; closing DB in this tab");
        db.close();
        _dbPromise = null;
        EventBus.emit("idb:versionchange");
      };
      resolve(db);
    };
  });
  return _dbPromise;
}

export async function resetDB(): Promise<void> {
  try {
    const db = await openDB();
    db.close();
  } catch {
    // ignore
  }
  _dbPromise = null;
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => EventBus.emit("idb:delete-blocked");
  });
}

/* ───────── Core txn helpers ───────── */

export async function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    let result: T | undefined;
    Promise.resolve(fn(store, tx))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
  });
}

export function req2promise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ───────── Typed helpers ───────── */

export async function put<T>(store: string, value: T): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(store, "readwrite", (s) => req2promise(s.put(value)));
}

export async function putMany<T>(store: string, values: T[]): Promise<number> {
  if (!values?.length) return 0;
  return withStore<number>(store, "readwrite", (s) => {
    for (const v of values) s.put(v);
    return Promise.resolve(values.length);
  });
}

export async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(store, "readonly", (s) =>
    req2promise<T | undefined>(s.get(key) as IDBRequest<T | undefined>)
  );
}

export async function del(store: string, key: IDBValidKey): Promise<void> {
  return withStore<void>(store, "readwrite", (s) => req2promise(s.delete(key)));
}

export async function count(store: string): Promise<number> {
  return withStore<number>(store, "readonly", (s) => req2promise(s.count()));
}

export async function rangeByKey<T>(
  store: string,
  range: IDBKeyRange,
  {
    limit = Infinity,
    direction = "next" as IDBCursorDirection,
  } = {}
): Promise<T[]> {
  return withStore<T[]>(store, "readonly", (s) =>
    new Promise<T[]>((resolve, reject) => {
      const results: T[] = [];
      const req = s.openCursor(range, direction);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || results.length >= limit) return resolve(results);
        results.push(cur.value as T);
        cur.continue();
      };
    })
  );
}

export async function latestInRange<T>(store: string, range: IDBKeyRange): Promise<T | null> {
  return withStore<T | null>(store, "readonly", (s) =>
    new Promise<T | null>((resolve, reject) => {
      const req = s.openCursor(range, "prev");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result ? (req.result.value as T) : null);
    })
  );
}

/* ───────── Meta helpers ───────── */

export async function metaGet<T>(key: string, fallback: T): Promise<T> {
  const row = await get<{ key: string; value: T }>("meta", key);
  return row ? row.value : fallback;
}

export async function metaSet(key: string, value: unknown): Promise<IDBValidKey> {
  return put("meta", { key, value, ts: Date.now() });
}

/* ───────── Quota error catcher ───────── */

export function handleQuotaError(err: unknown): void {
  if ((err as DOMException)?.name === "QuotaExceededError") {
    EventBus.emit("quota:exceeded", { err: (err as Error).message });
    degrade("quota-exceeded", "Browser storage full; oldest candles will be evicted");
  }
}
