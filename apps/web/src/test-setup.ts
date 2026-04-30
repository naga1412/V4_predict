/**
 * Vitest setup — runs once before test files are loaded.
 * happy-dom provides window/document/HTMLElement; we add a minimal IDB shim
 * because some engine code touches openDB() during module init.
 */
import "fake-indexeddb/auto";

// Silence noisy console during tests
const origWarn = console.warn;
console.warn = (...args: unknown[]): void => {
  const msg = args.join(" ");
  if (msg.includes("[engine]") || msg.includes("[TAEngineProxy]")) return;
  origWarn(...args);
};
