"use client";

import { useEffect } from "react";

const TIFON_COLOR = "#777d86";

export default function HeroFactionNormalizer() {
  useEffect(() => {
    let queued = false;
    const sync = () => {
      queued = false;
      const heading = document.querySelector<HTMLElement>(".deck-detail aside h3");
      if (heading?.textContent?.trim() === "Tifon, a Peste") {
        const aside = heading.closest<HTMLElement>("aside");
        const identity = heading.nextElementSibling as HTMLElement | null;
        aside?.style.setProperty("--deck", TIFON_COLOR);
        if (identity && identity.textContent !== "Neutro · Último Suspiro") identity.textContent = "Neutro · Último Suspiro";
      }
      for (const button of Array.from(document.querySelectorAll<HTMLElement>(".deck-rail button"))) {
        const name = button.querySelector("b")?.textContent?.trim();
        if (name === "Tifon, a Peste") button.style.setProperty("--deck", TIFON_COLOR);
      }
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(sync);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);
  return null;
}
