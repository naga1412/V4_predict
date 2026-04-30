/**
 * Training worker — runs MLP.fit off the main thread.
 */

/// <reference lib="webworker" />

import { MLP, type MLPConfig } from "../ml/nn.js";

interface TrainMessage {
  id: number;
  type: "train";
  arch: MLPConfig["layers"];
  loss?: MLPConfig["loss"];
  optimizer?: MLPConfig["optimizer"];
  lr?: number;
  l2?: number;
  seed?: number;
  X: Float32Array | number[];
  Y: Float32Array | number[];
  d: number;
  n: number;
  outDim: number;
  epochs?: number;
  batchSize?: number;
  valFrac?: number;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (ev: MessageEvent<TrainMessage>) => {
  const req = ev.data;
  if (!req || req.type !== "train") return;
  const { id } = req;
  try {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const cfg: MLPConfig = { layers: req.arch };
    if (req.loss !== undefined) cfg.loss = req.loss;
    if (req.optimizer !== undefined) cfg.optimizer = req.optimizer;
    if (req.lr !== undefined) cfg.lr = req.lr;
    if (req.l2 !== undefined) cfg.l2 = req.l2;
    if (req.seed !== undefined) cfg.seed = req.seed;
    const mlp = new MLP(cfg);
    const Xa = req.X instanceof Float32Array ? req.X : Float32Array.from(req.X ?? []);
    const Ya = req.Y instanceof Float32Array ? req.Y : Float32Array.from(req.Y ?? []);
    const { history, valHistory } = mlp.fit(Xa, Ya, {
      epochs: req.epochs ?? 20,
      batchSize: req.batchSize ?? 32,
      valFrac: req.valFrac ?? 0,
      onProgress: (frac, extra) => {
        try {
          ctx.postMessage({ id, type: "progress", frac, ...extra });
        } catch {
          // best-effort
        }
      },
    });
    const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    ctx.postMessage({
      id, type: "result",
      weights: mlp.serialize(),
      history, valHistory, ms,
    });
  } catch (err) {
    const e = err as Error;
    ctx.postMessage({ id, type: "error", message: e?.message ?? String(err), stack: e?.stack });
  }
});

ctx.postMessage({ id: 0, type: "ready" });
