"use client";

import { useEffect, useState } from "react";

/** Give the presentation bridge time to enqueue entry animations before opening
 * priority. The authoritative busy/idle events own animation completion. */
export function useResponsePresentationReady(key: string | null, blocked: boolean) {
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    let disposed = false;
    const busy = () => !!(window as Window & { __hemsfellPresentationBusy?: boolean }).__hemsfellPresentationBusy;
    const pause = () => { cancelAnimationFrame(frame); setReadyKey(null); };
    const settle = () => {
      pause();
      if (!key || blocked || busy()) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (!disposed && !busy()) setReadyKey(key);
        });
      });
    };
    window.addEventListener("hemsfell:presentation-busy", pause);
    window.addEventListener("hemsfell:presentation-idle", settle);
    settle();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("hemsfell:presentation-busy", pause);
      window.removeEventListener("hemsfell:presentation-idle", settle);
    };
  }, [key, blocked]);
  return !!key && key === readyKey && !blocked;
}
