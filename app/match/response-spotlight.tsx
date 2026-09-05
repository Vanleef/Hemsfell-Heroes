"use client";

import { useEffect, useState } from "react";

/** A hole in the dimmer illuminates the original card without cloning,
 * reparenting or changing battlefield stacking/interaction. */
export function ResponseSpotlight({ sourceId }: { sourceId?: string }) {
  const [spotlight, setSpotlight] = useState<{ sourceId?: string; clipPath?: string }>({});
  useEffect(() => {
    if (!sourceId) return;
    const setClipPath = (clipPath?: string) => setSpotlight({ sourceId, clipPath });
    let frame = 0;
    const candidates = document.querySelectorAll<HTMLElement>(".screen-game .game-stage [data-unit-id],.screen-game .game-stage [data-card-id]");
    const source = Array.from(candidates).find(node => node.dataset.unitId === sourceId)
      ?? Array.from(candidates).find(node => node.dataset.cardId === sourceId && !!node.closest(".paired-field,.terrain-slot"));
    const measure = () => {
      frame = 0;
      if (!source?.isConnected) { setClipPath(undefined); return; }
      const r = source.getBoundingClientRect();
      if (!r.width || !r.height) { setClipPath(undefined); return; }
      const l = Math.max(0, r.left - 4), t = Math.max(0, r.top - 4);
      const right = Math.min(innerWidth, r.right + 4), bottom = Math.min(innerHeight, r.bottom + 4);
      setClipPath(`polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${l}px ${t}px,${right}px ${t}px,${right}px ${bottom}px,${l}px ${bottom}px,${l}px ${t}px)`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    if (source) observer.observe(source);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [sourceId]);
  return <div className="response-dimmer" style={{ clipPath: spotlight.sourceId === sourceId ? spotlight.clipPath : undefined }} aria-hidden="true" />;
}
