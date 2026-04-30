/**
 * My Next Prediction v3.0 — Tiny EventBus
 * Zero-dep pub/sub for cross-module coordination within a single tab.
 */

type Listener<T = unknown> = (data: T) => void;
type UnsubFn = () => void;

class Bus {
  private map = new Map<string, Set<Listener>>();

  on<T = unknown>(topic: string, fn: Listener<T>): UnsubFn {
    if (!this.map.has(topic)) this.map.set(topic, new Set());
    this.map.get(topic)!.add(fn as Listener);
    return () => this.off(topic, fn as Listener);
  }

  off(topic: string, fn: Listener): void {
    this.map.get(topic)?.delete(fn);
  }

  once<T = unknown>(topic: string, fn: Listener<T>): UnsubFn {
    const off = this.on<T>(topic, (data) => {
      off();
      fn(data);
    });
    return off;
  }

  emit<T = unknown>(topic: string, data?: T): void {
    const subs = this.map.get(topic);
    if (!subs || !subs.size) return;
    for (const fn of subs) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[bus:${topic}]`, err);
      }
    }
  }

  onMany(topics: string[], fn: (topic: string, data: unknown) => void): UnsubFn {
    const offs = topics.map((t) => this.on(t, (d) => fn(t, d)));
    return () => offs.forEach((o) => o());
  }
}

export const EventBus = new Bus();
