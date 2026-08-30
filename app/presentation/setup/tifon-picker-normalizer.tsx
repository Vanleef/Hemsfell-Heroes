"use client";

import { useEffect } from "react";

function normalizeTifonPickers() {
  document.querySelectorAll<HTMLElement>(".deck-picker").forEach((picker) => {
    const select = picker.querySelector<HTMLSelectElement>("select");
    if (!select || select.value !== "tifon") return;

    const faction = Array.from(picker.children).find(
      (node): node is HTMLElement => node instanceof HTMLElement && node.tagName === "B",
    );
    if (!faction) return;

    if (faction.textContent !== "Neutro") faction.textContent = "Neutro";
    faction.classList.add("deck-picker-faction");
    picker.dataset.faction = "Neutro";
    picker.style.setProperty("--deck", "#777d86");
    picker.style.setProperty("--faction-color", "#777d86");
  });
}

export default function TifonPickerNormalizer() {
  useEffect(() => {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        normalizeTifonPickers();
      });
    };

    const onChange = (event: Event) => {
      if (event.target instanceof HTMLSelectElement && event.target.closest(".deck-picker")) schedule();
    };

    document.addEventListener("change", onChange, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    normalizeTifonPickers();

    return () => {
      document.removeEventListener("change", onChange, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
