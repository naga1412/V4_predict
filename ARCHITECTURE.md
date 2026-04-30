# V.4 Architecture

## Overview

V.4 is a three-tier hybrid of SMC Pro's frontend and My Next Prediction v3's ML engine.
The key structural decision is that the hot path — prediction, learning loop, and IndexedDB
storage — lives entirely in the browser.

## Three tiers

```
apps/web/          Vite + React 18 + TypeScript — the only user-facing surface
packages/engine/   V3 engine ported to TypeScript — framework-free, browser-runnable
services/api/      FastAPI control plane — optional sync target (Phase 5+)
```

## Four decisions that are settled and not to be re-debated

### 1. Hot path stays client-side

The closed learning loop (mistake → ledger → k-means → meta-veto → ghost candle) runs
in the browser with IndexedDB as its database. `packages/engine` is framework-free and
has no Node.js dependency — it runs in a browser tab and in Vitest (via fake-indexeddb).

Moving this to a server would add network latency to every prediction and rebuild working,
tested code for no improvement in prediction quality.

### 2. The server is a sync target, not the source of truth

Each browser instance is the source of truth for its own predictions. The FastAPI service
(Phase 5) periodically receives labeled outcomes for cross-user retraining and audit logs.
It never sits in the prediction critical path.

### 3. SMC Pro frontend is rebuilt, not migrated

The SMC Pro `index.html` is 1,850 lines of mixed UI/state/networking/charting code. We
use its visual design as reference and rebuild in Vite + TypeScript. Incremental migration
of the monolithic file would cost more than a clean rewrite.

### 4. Label the model honestly

SMC Pro labels deterministic projection as "prediction." V.4 uses V3's framing:
"Meta-Brain forecast, conformal interval, X% calibrated probability." This matters
for legal compliance as well as technical accuracy.

## IndexedDB schema

Database name: `mnp`, version: `9`
Sixteen stores with migration history intact from V3 (versions 1–9).
The schema in `packages/engine/src/data/schema.ts` is the single source of truth.
Do not fork it for dev/prod environments.

## Worker pattern

All Web Workers use ES module format:
```ts
new Worker(new URL("./taWorker.ts", import.meta.url), { type: "module" })
```
Vite detects this pattern and bundles the worker separately. `worker.format: "es"` is
set in `apps/web/vite.config.ts`.

## Dependency direction

```
apps/web  →  packages/engine  (one-way, no circular deps)
services/api                  (independent, async sync only)
```

`packages/engine` has zero React/Vite dependencies and zero Node.js-only APIs.
It can run in a browser, in Vitest with fake-indexeddb, and (future) in Pyodide.
