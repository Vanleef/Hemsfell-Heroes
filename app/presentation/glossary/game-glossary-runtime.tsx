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
    if (element.dataset.glossaryKey === entry.key && element.dataset.tip === entry.description) continue;
    element.dataset.tip = entry.description;
    element.dataset.glossaryKey = entry.key;
    element.dataset.glossaryTone = entry.tone;
    element.removeAttribute("title");
  }
}

/**
 * This runtime is mounted only on card-bearing screens by ScreenRuntimeGate.
 * Observe the active app subtree rather than documentElement so font/runtime/
 * portal mutations outside Hemsfell never cause glossary scans.
 */
export default function GameGlossaryRuntime() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main.hh-app");
    if (!root) return;
    applyCanonicalGlossary(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof HTMLElement) applyCanonicalGlossary(record.target);
        for (const node of record.addedNodes) if (node instanceof HTMLElement) applyCanonicalGlossary(node);
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-keyword", "data-status"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
