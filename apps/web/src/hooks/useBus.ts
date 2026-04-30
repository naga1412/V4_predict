import { useEffect } from "react";
import { EventBus } from "@v4/engine";

export function useBusEvent<T = unknown>(
  topic: string,
  handler: (data: T) => void,
  deps: unknown[] = []
): void {
  useEffect(() => {
    const off = EventBus.on<T>(topic, handler);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, ...deps]);
}
