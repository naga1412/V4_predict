import { describe, it, expect } from "vitest";
import { VERSION } from "./index.js";

describe("engine smoke tests", () => {
  it("VERSION is defined", () => {
    expect(VERSION).toBe("0.0.0");
  });

  it("fake-indexeddb is installed globally", () => {
    expect(typeof indexedDB).toBe("object");
  });

  it("can open an IDB database", async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("smoke-test", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("test", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(db).toBeDefined();
    db.close();
  });
});
