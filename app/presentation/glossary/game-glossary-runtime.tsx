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

function minimalDirtyRoots(roots: Set<HTMLElement>) {
  const connected = [...roots].filter((root) => root.isConnected);
  return connected.filter((root, index) => !connected.some((other, otherIndex) => otherIndex !== index && other.contains(root)));
}

/**
 * Mounted only on card-bearing screens by ScreenRuntimeGate. Mutation bursts
 * are coalesced into one animation-frame pass and nested dirty roots collapse
 * to their highest ancestor, avoiding repeated subtree scans during React
 * commits that insert many cards/keyword badges at once.
 */
export default function GameGlossaryRuntime() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main.hh-app");
    if (!root) return;
    applyCanonicalGlossary(root);

    const dirtyRoots = new Set<HTMLElement>();
    let frame = 0;
    const flush = () => {
      frame = 0;
      const batch = minimalDirtyRoots(dirtyRoots);
      dirtyRoots.clear();
      batch.forEach(applyCanonicalGlossary);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof HTMLElement) dirtyRoots.add(record.target);
        for (const node of record.addedNodes) if (node instanceof HTMLElement) dirtyRoots.add(node);
      }
      if (dirtyRoots.size) schedule();
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-keyword", "data-status"],
    });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      dirtyRoots.clear();
    };
  }, []);

  return null;
}
