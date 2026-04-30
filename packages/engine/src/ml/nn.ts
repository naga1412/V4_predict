/**
 * Small MLP (pure JS/TS). Backprop, mini-batch SGD/Adam, JSON-serializable.
 */

import { mulberry32, gaussianFactory, shuffledIndices } from "./rng.js";

export const NN_VERSION = 1;

export type ActName = "relu" | "sigmoid" | "tanh" | "linear";
export type LossName = "bce" | "mse";
export type OptimizerName = "sgd" | "adam";

export interface LayerConfig {
  in: number;
  out: number;
  act: ActName;
}

export interface MLPConfig {
  layers: LayerConfig[];
  loss?: LossName;
  optimizer?: OptimizerName;
  lr?: number;
  l2?: number;
  seed?: number;
}

export interface FitOpts {
  epochs?: number;
  batchSize?: number;
  valFrac?: number;
  onEpoch?: (epoch: number, loss: number, extra?: { valLoss?: number }) => void;
  onProgress?: (frac: number, extra?: { epoch: number; epochs: number; loss: number; valLoss?: number }) => void;
}

export interface FitResult {
  history: number[];
  valHistory: number[];
}

export interface SerializedMLP {
  version: number;
  layers: LayerConfig[];
  loss: LossName;
  optimizer: OptimizerName;
  lr: number;
  l2: number;
  seed: number;
  W: number[][];
  b: number[][];
  step: number;
}

interface Activation {
  fwd: (x: number) => number;
  dact: (a: number) => number;
}

const ACT: Record<ActName, Activation> = {
  relu: { fwd: (x) => (x > 0 ? x : 0), dact: (a) => (a > 0 ? 1 : 0) },
  sigmoid: { fwd: (x) => 1 / (1 + Math.exp(-x)), dact: (a) => a * (1 - a) },
  tanh: { fwd: (x) => Math.tanh(x), dact: (a) => 1 - a * a },
  linear: { fwd: (x) => x, dact: () => 1 },
};

interface LossFn {
  forward: (yHat: number, y: number) => number;
  gradOutput: (yHat: number, y: number) => number;
}

const LOSS: Record<LossName, LossFn> = {
  bce: {
    forward: (yHat, y) => {
      const eps = 1e-7;
      const p = Math.min(1 - eps, Math.max(eps, yHat));
      return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    },
    gradOutput: (yHat, y) => yHat - y,
  },
  mse: {
    forward: (yHat, y) => 0.5 * (yHat - y) ** 2,
    gradOutput: (yHat, y) => yHat - y,
  },
};

function initLayer(inDim: number, outDim: number, actName: ActName, gauss: () => number): { W: Float32Array; b: Float32Array } {
  const scale = actName === "relu"
    ? Math.sqrt(2 / Math.max(1, inDim))
    : Math.sqrt(1 / Math.max(1, inDim));
  const W = new Float32Array(inDim * outDim);
  const b = new Float32Array(outDim);
  for (let i = 0; i < W.length; i++) W[i] = gauss() * scale;
  return { W, b };
}

export class MLP {
  layers: LayerConfig[];
  loss: LossName;
  optimizer: OptimizerName;
  lr: number;
  l2: number;
  seed: number;
  W: Float32Array[] = [];
  b: Float32Array[] = [];
  private _rand: () => number;
  private _gauss: () => number;
  private _mW: Float32Array[] = [];
  private _vW: Float32Array[] = [];
  private _mB: Float32Array[] = [];
  private _vB: Float32Array[] = [];
  private _step = 0;

  constructor(cfg: MLPConfig) {
    if (!cfg || !Array.isArray(cfg.layers) || cfg.layers.length === 0) {
      throw new Error("MLP: cfg.layers required");
    }
    this.layers = cfg.layers.map((l) => ({ in: l.in, out: l.out, act: l.act ?? "relu" }));
    this.loss = cfg.loss ?? "bce";
    this.optimizer = cfg.optimizer ?? "adam";
    this.lr = Number.isFinite(cfg.lr) ? (cfg.lr as number) : 0.01;
    this.l2 = Number.isFinite(cfg.l2) ? (cfg.l2 as number) : 0;
    this.seed = ((cfg.seed ?? 0) >>> 0) || 1;
    this._rand = mulberry32(this.seed);
    this._gauss = gaussianFactory(this._rand);

    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li]!;
      if (!(L.in > 0) || !(L.out > 0)) throw new Error(`MLP: layer ${li} invalid dims`);
      if (li > 0 && this.layers[li - 1]!.out !== L.in) {
        throw new Error(`MLP: layer ${li} in=${L.in} mismatches prev out=${this.layers[li - 1]!.out}`);
      }
      if (!ACT[L.act]) throw new Error(`MLP: unknown activation "${L.act}"`);
    }
    for (const L of this.layers) {
      const { W, b } = initLayer(L.in, L.out, L.act, this._gauss);
      this.W.push(W);
      this.b.push(b);
      this._mW.push(new Float32Array(W.length));
      this._vW.push(new Float32Array(W.length));
      this._mB.push(new Float32Array(b.length));
      this._vB.push(new Float32Array(b.length));
    }
  }

  private _forwardStore(x: Float32Array): Float32Array[] {
    const activations: Float32Array[] = [x];
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li]!;
      const W = this.W[li]!;
      const b = this.b[li]!;
      const prev = activations[li]!;
      const a = new Float32Array(L.out);
      const actFn = ACT[L.act].fwd;
      for (let j = 0; j < L.out; j++) {
        let z = b[j]!;
        for (let i = 0; i < L.in; i++) z += prev[i]! * W[i * L.out + j]!;
        a[j] = actFn(z);
      }
      activations.push(a);
    }
    return activations;
  }

  predict(x: Float32Array | ArrayLike<number>): Float32Array {
    const arr = x instanceof Float32Array ? x : Float32Array.from(x);
    const acts = this._forwardStore(arr);
    return acts[acts.length - 1]!;
  }

  predictScalar(x: Float32Array | ArrayLike<number>): number {
    return this.predict(x)[0]!;
  }

  predictBatch(X: Float32Array, n: number): Float32Array {
    const d = this.layers[0]!.in;
    const outDim = this.layers[this.layers.length - 1]!.out;
    const out = new Float32Array(n * outDim);
    const row = new Float32Array(d);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < d; k++) row[k] = X[i * d + k]!;
      const y = this.predict(row);
      for (let k = 0; k < outDim; k++) out[i * outDim + k] = y[k]!;
    }
    return out;
  }

  private _backward(acts: Float32Array[], y: ArrayLike<number>): { gradW: Float32Array[]; gradB: Float32Array[] } {
    const L = this.layers.length;
    const outAct = acts[L]!;
    const outDim = outAct.length;

    const gradW = this.layers.map((l) => new Float32Array(l.in * l.out));
    const gradB = this.layers.map((l) => new Float32Array(l.out));

    let delta = new Float32Array(outDim);
    for (let j = 0; j < outDim; j++) {
      delta[j] = LOSS[this.loss].gradOutput(outAct[j]!, y[j] ?? 0);
    }

    for (let li = L - 1; li >= 0; li--) {
      const layer = this.layers[li]!;
      const prev = acts[li]!;
      const curr = acts[li + 1]!;
      const W = this.W[li]!;
      const isOutput = li === L - 1;
      const absorb =
        (isOutput && this.loss === "bce" && layer.act === "sigmoid") ||
        (isOutput && this.loss === "mse" && layer.act === "linear");
      if (!absorb) {
        const dact = ACT[layer.act].dact;
        for (let j = 0; j < layer.out; j++) delta[j] = delta[j]! * dact(curr[j]!);
      }
      const gW = gradW[li]!;
      const gB = gradB[li]!;
      for (let j = 0; j < layer.out; j++) gB[j] = gB[j]! + delta[j]!;
      for (let i = 0; i < layer.in; i++) {
        const pi = prev[i]!;
        const rowBase = i * layer.out;
        for (let j = 0; j < layer.out; j++) gW[rowBase + j] = gW[rowBase + j]! + pi * delta[j]!;
      }
      if (li > 0) {
        const nextDelta = new Float32Array(layer.in);
        for (let i = 0; i < layer.in; i++) {
          let s = 0;
          const rowBase = i * layer.out;
          for (let j = 0; j < layer.out; j++) s += W[rowBase + j]! * delta[j]!;
          nextDelta[i] = s;
        }
        delta = nextDelta;
      }
    }
    return { gradW, gradB };
  }

  private _applyUpdates(gradW: Float32Array[], gradB: Float32Array[], batchSize: number): void {
    const invB = 1 / Math.max(1, batchSize);
    if (this.optimizer === "adam") {
      this._step++;
      const b1 = 0.9;
      const b2 = 0.999;
      const eps = 1e-8;
      const bc1 = 1 - Math.pow(b1, this._step);
      const bc2 = 1 - Math.pow(b2, this._step);
      for (let li = 0; li < this.layers.length; li++) {
        const W = this.W[li]!;
        const b = this.b[li]!;
        const gW = gradW[li]!;
        const gB = gradB[li]!;
        const mW = this._mW[li]!;
        const vW = this._vW[li]!;
        const mB = this._mB[li]!;
        const vB = this._vB[li]!;
        for (let k = 0; k < W.length; k++) {
          const g = gW[k]! * invB + this.l2 * W[k]!;
          mW[k] = b1 * mW[k]! + (1 - b1) * g;
          vW[k] = b2 * vW[k]! + (1 - b2) * g * g;
          const mHat = mW[k]! / bc1;
          const vHat = vW[k]! / bc2;
          W[k] = W[k]! - (this.lr * mHat) / (Math.sqrt(vHat) + eps);
        }
        for (let k = 0; k < b.length; k++) {
          const g = gB[k]! * invB;
          mB[k] = b1 * mB[k]! + (1 - b1) * g;
          vB[k] = b2 * vB[k]! + (1 - b2) * g * g;
          const mHat = mB[k]! / bc1;
          const vHat = vB[k]! / bc2;
          b[k] = b[k]! - (this.lr * mHat) / (Math.sqrt(vHat) + eps);
        }
      }
    } else {
      for (let li = 0; li < this.layers.length; li++) {
        const W = this.W[li]!;
        const b = this.b[li]!;
        const gW = gradW[li]!;
        const gB = gradB[li]!;
        for (let k = 0; k < W.length; k++) {
          W[k] = W[k]! - this.lr * (gW[k]! * invB + this.l2 * W[k]!);
        }
        for (let k = 0; k < b.length; k++) {
          b[k] = b[k]! - this.lr * gB[k]! * invB;
        }
      }
    }
  }

  fit(
    X: Float32Array | ArrayLike<number>,
    Y: Float32Array | ArrayLike<number>,
    opts: FitOpts = {}
  ): FitResult {
    const epochs = opts.epochs ?? 20;
    const batchSize = Math.max(1, opts.batchSize ?? 32);
    const d = this.layers[0]!.in;
    const outDim = this.layers[this.layers.length - 1]!.out;
    const n = Math.floor(X.length / d);
    if (n === 0) return { history: [], valHistory: [] };
    const valFrac = Math.max(0, Math.min(0.9, opts.valFrac ?? 0));
    const nVal = Math.floor(n * valFrac);
    const nTrain = n - nVal;
    const history: number[] = [];
    const valHistory: number[] = [];

    const Xa = X instanceof Float32Array ? X : Float32Array.from(X);
    const Ya = Y instanceof Float32Array ? Y : Float32Array.from(Y);

    const rowX = new Float32Array(d);
    const rowY = new Float32Array(outDim);

    for (let ep = 0; ep < epochs; ep++) {
      const idx = shuffledIndices(nTrain, this._rand);
      let epochLoss = 0;
      let seen = 0;
      for (let off = 0; off < nTrain; off += batchSize) {
        const bEnd = Math.min(off + batchSize, nTrain);
        const gradW = this.layers.map((l) => new Float32Array(l.in * l.out));
        const gradB = this.layers.map((l) => new Float32Array(l.out));
        let batchLoss = 0;
        for (let k = off; k < bEnd; k++) {
          const i = idx[k]!;
          for (let c = 0; c < d; c++) rowX[c] = Xa[i * d + c]!;
          for (let c = 0; c < outDim; c++) rowY[c] = Ya[i * outDim + c]!;
          const acts = this._forwardStore(rowX);
          const outAct = acts[acts.length - 1]!;
          let sl = 0;
          for (let c = 0; c < outDim; c++) sl += LOSS[this.loss].forward(outAct[c]!, rowY[c]!);
          batchLoss += sl;
          const g = this._backward(acts, rowY);
          for (let li = 0; li < this.layers.length; li++) {
            const gw = gradW[li]!;
            const gb = gradB[li]!;
            const gw2 = g.gradW[li]!;
            const gb2 = g.gradB[li]!;
            for (let m = 0; m < gw.length; m++) gw[m] = gw[m]! + gw2[m]!;
            for (let m = 0; m < gb.length; m++) gb[m] = gb[m]! + gb2[m]!;
          }
        }
        const bn = bEnd - off;
        this._applyUpdates(gradW, gradB, bn);
        epochLoss += batchLoss;
        seen += bn;
      }
      const avgLoss = seen > 0 ? epochLoss / seen : NaN;
      history.push(avgLoss);
      let valLoss = NaN;
      if (nVal > 0) {
        let s = 0;
        for (let i = nTrain; i < n; i++) {
          for (let c = 0; c < d; c++) rowX[c] = Xa[i * d + c]!;
          const yHat = this.predict(rowX);
          for (let c = 0; c < outDim; c++) s += LOSS[this.loss].forward(yHat[c]!, Ya[i * outDim + c]!);
        }
        valLoss = s / Math.max(1, nVal);
        valHistory.push(valLoss);
      }
      const extra = Number.isFinite(valLoss) ? { valLoss } : {};
      opts.onEpoch?.(ep + 1, avgLoss, extra);
      opts.onProgress?.((ep + 1) / epochs, { epoch: ep + 1, epochs, loss: avgLoss, ...extra });
    }
    return { history, valHistory };
  }

  serialize(): SerializedMLP {
    return {
      version: NN_VERSION,
      layers: this.layers.map((l) => ({ ...l })),
      loss: this.loss,
      optimizer: this.optimizer,
      lr: this.lr,
      l2: this.l2,
      seed: this.seed,
      W: this.W.map((w) => Array.from(w)),
      b: this.b.map((bb) => Array.from(bb)),
      step: this._step,
    };
  }

  static deserialize(obj: SerializedMLP): MLP {
    if (!obj || obj.version !== NN_VERSION) throw new Error(`MLP: unsupported version ${obj?.version}`);
    const m = new MLP({
      layers: obj.layers,
      loss: obj.loss,
      optimizer: obj.optimizer,
      lr: obj.lr,
      l2: obj.l2,
      seed: obj.seed,
    });
    for (let li = 0; li < obj.W.length; li++) {
      m.W[li] = Float32Array.from(obj.W[li]!);
      m.b[li] = Float32Array.from(obj.b[li]!);
    }
    m._step = obj.step ?? 0;
    return m;
  }
}

export function paramCount(mlp: MLP): number {
  let n = 0;
  for (let li = 0; li < mlp.layers.length; li++) {
    n += mlp.W[li]!.length + mlp.b[li]!.length;
  }
  return n;
}
