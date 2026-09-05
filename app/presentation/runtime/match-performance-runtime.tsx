"use client";

import { useEffect } from "react";

type PerfSample = {
  at: number;
  kind: "longtask" | "event" | "frame-gap" | "memory";
  duration?: number;
  name?: string;
  heapMb?: number;
  canvases?: number;
};

type PerfSnapshot = {
  enabled: true;
  startedAt: number;
  samples: PerfSample[];
  summary: () => {
    longTasks: number;
    worstLongTaskMs: number;
    eventP95Ms: number;
    frameGaps: number;
    heapMb: number | null;
    canvases: number;
  };
  clear: () => void;
};

declare global {
  interface Window {
    __HEMSFELL_PERF__?: PerfSnapshot;
  }
}

const SAMPLE_LIMIT = 240;
const MEMORY_SAMPLE_MS = 5_000;
const FRAME_GAP_MS = 50;

function enabled() {
  try {
    return new URLSearchParams(window.location.search).get("perf") === "1"
      || window.localStorage.getItem("hemsfell:perf") === "1";
  } catch {
    return false;
  }
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] || 0;
}

export default function MatchPerformanceRuntime() {
  useEffect(() => {
    if (!enabled()) return;

    const samples: PerfSample[] = [];
    const push = (sample: PerfSample) => {
      samples.push(sample);
      if (samples.length > SAMPLE_LIMIT) samples.splice(0, samples.length - SAMPLE_LIMIT);
    };

    const snapshot: PerfSnapshot = {
      enabled: true,
      startedAt: performance.now(),
      samples,
      summary: () => {
        const longTasks = samples.filter((sample) => sample.kind === "longtask");
        const eventDurations = samples.filter((sample) => sample.kind === "event").map((sample) => sample.duration || 0);
        const latestMemory = [...samples].reverse().find((sample) => sample.kind === "memory");
        return {
          longTasks: longTasks.length,
          worstLongTaskMs: Math.max(0, ...longTasks.map((sample) => sample.duration || 0)),
          eventP95Ms: percentile(eventDurations, 0.95),
          frameGaps: samples.filter((sample) => sample.kind === "frame-gap").length,
          heapMb: latestMemory?.heapMb ?? null,
          canvases: latestMemory?.canvases ?? document.querySelectorAll("canvas").length,
        };
      },
      clear: () => samples.splice(0, samples.length),
    };
    window.__HEMSFELL_PERF__ = snapshot;

    const observers: PerformanceObserver[] = [];
    const supported = PerformanceObserver.supportedEntryTypes || [];
    if (supported.includes("longtask")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) push({ at: entry.startTime, kind: "longtask", duration: entry.duration, name: entry.name });
      });
      observer.observe({ entryTypes: ["longtask"] });
      observers.push(observer);
    }
    if (supported.includes("event")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 16) continue;
          push({ at: entry.startTime, kind: "event", duration: entry.duration, name: entry.name });
        }
      });
      try {
        observer.observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
        observers.push(observer);
      } catch {
        observer.disconnect();
      }
    }

    let animationFrame = 0;
    let previousFrame = performance.now();
    const frame = (now: number) => {
      const gap = now - previousFrame;
      previousFrame = now;
      if (gap >= FRAME_GAP_MS) push({ at: now, kind: "frame-gap", duration: gap });
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);

    const sampleMemory = () => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
      const used = Number(memory?.usedJSHeapSize || 0);
      push({
        at: performance.now(),
        kind: "memory",
        heapMb: used > 0 ? Math.round((used / 1024 / 1024) * 10) / 10 : undefined,
        canvases: document.querySelectorAll("canvas").length,
      });
    };
    sampleMemory();
    const memoryTimer = window.setInterval(sampleMemory, MEMORY_SAMPLE_MS);

    return () => {
      observers.forEach((observer) => observer.disconnect());
      cancelAnimationFrame(animationFrame);
      window.clearInterval(memoryTimer);
      if (window.__HEMSFELL_PERF__ === snapshot) delete window.__HEMSFELL_PERF__;
    };
  }, []);

  return null;
}
