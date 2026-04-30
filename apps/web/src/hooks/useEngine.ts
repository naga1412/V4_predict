/**
 * useEngine — one-time bootstrap of the @v4/engine in this tab.
 * Opens the IDB connection and subscribes mistake-ledger summary updates
 * into the Zustand store. Call once from App root.
 */
import { useEffect } from "react";
import { openDB, EventBus } from "@v4/engine";
import { mistakeSummary } from "@v4/engine";
import { useAppStore } from "../store/appStore.js";

export function useEngine(): void {
  const setMistakeSummary = useAppStore((s) => s.setMistakeSummary);
  const setRegime = useAppStore((s) => s.setRegime);
  const setMetaBrain = useAppStore((s) => s.setMetaBrain);

  useEffect(() => {
    // Open IDB (idempotent) — warms the connection before first query
    void openDB().catch((err: unknown) => {
      console.error("[engine] IDB open failed", err);
    });

    // Refresh mistake summary whenever a new mistake is recorded
    const offMistake = EventBus.on("mistake:recorded", () => {
      void mistakeSummary().then(setMistakeSummary).catch(() => null);
    });

    // Sync regime from engine events
    const offRegime = EventBus.on<{ label?: string }>("regime:updated", (e) => {
      if (e?.label) setRegime(e.label);
    });

    // Sync meta-brain decision
    const offMB = EventBus.on<{
      direction?: string;
      probability?: number;
      intervalLo?: number;
      intervalHi?: number;
      vetoed?: false | "full" | "softened";
      vetoReason?: string | null;
    }>("metabrain:decision", (e) => {
      if (!e) return;
      setMetaBrain({
        direction: (e.direction as "long" | "short" | "neutral") ?? "neutral",
        probability: e.probability ?? 0.5,
        intervalLo: e.intervalLo ?? 0,
        intervalHi: e.intervalHi ?? 0,
        vetoed: e.vetoed ?? false,
        vetoReason: e.vetoReason ?? null,
        champion: null,
        retrained: null,
      });
    });

    // Load initial mistake summary
    void mistakeSummary().then(setMistakeSummary).catch(() => null);

    return () => {
      offMistake();
      offRegime();
      offMB();
    };
  }, [setMistakeSummary, setRegime, setMetaBrain]);
}
