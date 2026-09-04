"use client";

import { useEffect } from "react";

const MARKER_SELECTOR = ".screen-game .card-frame[data-unit-id] > .card-frame-marker";

function normalizeMarker(node: Element) {
  if (!(node instanceof HTMLElement) || !node.matches(MARKER_SELECTOR)) return;
  const raw = node.textContent?.trim() || "";
  const count = Number(raw.replace(/[^0-9-]/g, ""));
  if (!Number.isFinite(count) || count <= 0) return;
  const value = String(Math.trunc(count));
  if (node.textContent !== value) node.textContent = value;
  node.dataset.markerCount = value;
  node.setAttribute("aria-label", `${value} marcador${value === "1" ? "" : "es"}`);
}

function normalizeTree(root: ParentNode) {
  if (root instanceof Element) normalizeMarker(root);
  root.querySelectorAll?.(MARKER_SELECTOR).forEach(normalizeMarker);
}

/** Presentation-only normalization: rules keep owning marker amounts. */
export default function CardMarkerCounterRuntime() {
  useEffect(() => {
    normalizeTree(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          const parent = record.target.parentElement;
          if (parent) normalizeMarker(parent);
          continue;
        }
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) normalizeTree(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
