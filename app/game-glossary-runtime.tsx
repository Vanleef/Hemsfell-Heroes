"use client";

import { useEffect } from "react";
import { gameGlossaryEntry } from "./game-glossary";

const GLOSSARY_SELECTOR = ".keyword-term,.keyword-badge,[data-keyword],[data-status]";

const glossaryLabel = (element: HTMLElement) =>
  element.dataset.keyword || element.dataset.status || element.textContent?.trim() || "";

function applyCanonicalGlossary(root: ParentNode) {
  const candidates: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(GLOSSARY_SELECTOR)) candidates.push(root);
  root.querySelectorAll<HTMLElement>(GLOSSARY_SELECTOR).forEach((element) => candidates.push(element));
  for (const element of candidates) {
    const entry = gameGlossaryEntry(glossaryLabel(element));
    if (!entry) continue;
    element.dataset.tip = entry.description;
    element.dataset.glossaryKey = entry.key;
    element.dataset.glossaryTone = entry.tone;
    /* Native titles compete with the interactive Floating UI tooltip. */
    element.removeAttribute("title");
  }
}

/**
 * Keeps legacy semantic spans compatible while `game-glossary.ts` remains the
 * single source of truth for rule-copy descriptions. It intentionally does not
 * create visual tooltips; CardPreviewRuntime owns the interactive surfaces.
 */
export default function GameGlossaryRuntime() {
  useEffect(() => {
    applyCanonicalGlossary(document.documentElement);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof HTMLElement) applyCanonicalGlossary(record.target);
        for (const node of record.addedNodes) if (node instanceof HTMLElement) applyCanonicalGlossary(node);
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-keyword", "data-status", "class"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
