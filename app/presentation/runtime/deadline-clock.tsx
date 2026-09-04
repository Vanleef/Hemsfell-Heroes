"use client";

import { useEffect, useState } from "react";

const secondsUntil = (deadline?: number | null) => deadline
  ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  : 0;

/** Keep deadline ticks local so the complete match tree does not render each second. */
export function useDeadlineSeconds(deadline?: number | null) {
  const [seconds, setSeconds] = useState(() => secondsUntil(deadline));

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      const remainingMs = deadline ? Math.max(0, deadline - Date.now()) : 0;
      const next = deadline ? Math.ceil(remainingMs / 1000) : 0;
      setSeconds((current) => current === next ? current : next);
      if (remainingMs > 0) {
        const untilNextSecond = remainingMs - Math.max(0, next - 1) * 1000;
        timer = window.setTimeout(tick, Math.max(50, untilNextSecond + 20));
      }
    };

    tick();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [deadline]);

  return seconds;
}

export function DeadlineText({
  deadline,
  clock = false,
  suffix = "",
}: {
  deadline?: number | null;
  clock?: boolean;
  suffix?: string;
}) {
  const seconds = useDeadlineSeconds(deadline);
  if (!clock) return <>{seconds}{suffix}</>;
  return <>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</>;
}

export function MatchTurnClock({ deadline }: { deadline?: number | null }) {
  const seconds = useDeadlineSeconds(deadline);
  return <div className={`match-clock ${seconds <= 15 ? "urgent" : ""}`}><span>TURNO</span><b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</b></div>;
}
