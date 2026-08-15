"use client";

import { useEffect } from "react";

const PANEL_SELECTOR = [
  ".hero-command-bar .hero-ability-chip",
  ".hero-abilities .ability",
  ".hero-evolution",
  ".hero-level",
  ".level-button",
  ".field-energy",
  ".game-bar",
  ".phase-orb",
  ".priority-stack-indicator",
  ".priority-status",
  ".response-waiting",
  ".response-dialog",
  ".response-hero-abilities > button",
  ".maintenance-dialog",
  ".engine-decision-panel",
  ".target-banner",
  ".visual-effect",
  ".combat-cinematic",
  ".defense-decision",
  ".pile-zone",
  ".card-tooltip",
  ".hero-status-cues span",
  ".modal",
  ".panel",
].join(",");

const TEXT_SELECTOR = "p,small,span,b,strong,em,label,h1,h2,h3,h4,h5,h6,button";
const originalInlineFont = new WeakMap<HTMLElement, string>();

function hasDirectText(el: HTMLElement) {
  return Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
}

function textNodesFor(panel: HTMLElement) {
  const nodes = Array.from(panel.querySelectorAll<HTMLElement>(TEXT_SELECTOR)).filter(
    (el) => Boolean(el.textContent?.trim()) && !el.matches(".remote-card-art,canvas,svg,img"),
  );
  if (hasDirectText(panel)) nodes.unshift(panel);
  return [...new Set(nodes)];
}

function rememberAndRestore(nodes: HTMLElement[]) {
  for (const node of nodes) {
    if (!originalInlineFont.has(node)) originalInlineFont.set(node, node.style.fontSize);
    node.style.fontSize = originalInlineFont.get(node) ?? "";
  }
}

function isTextOutsidePanel(panel: HTMLElement, nodes: HTMLElement[]) {
  const panelRect = panel.getBoundingClientRect();
  if (panelRect.width <= 0 || panelRect.height <= 0) return false;
  const style = getComputedStyle(panel);
  const left = panelRect.left + (parseFloat(style.paddingLeft) || 0);
  const right = panelRect.right - (parseFloat(style.paddingRight) || 0);
  const top = panelRect.top + (parseFloat(style.paddingTop) || 0);
  const bottom = panelRect.bottom - (parseFloat(style.paddingBottom) || 0);
  const tolerance = 1;

  return nodes.some((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const ownOverflow =
      node.scrollWidth > node.clientWidth + tolerance ||
      node.scrollHeight > node.clientHeight + tolerance;
    return (
      ownOverflow ||
      rect.left < left - tolerance ||
      rect.right > right + tolerance ||
      rect.top < top - tolerance ||
      rect.bottom > bottom + tolerance
    );
  });
}

function fitPanel(panel: HTMLElement) {
  const nodes = textNodesFor(panel);
  if (!nodes.length) return;

  rememberAndRestore(nodes);
  const baseSizes = nodes.map((node) => parseFloat(getComputedStyle(node).fontSize) || 10);
  if (!isTextOutsidePanel(panel, nodes)) {
    panel.dataset.textFit = "native";
    return;
  }

  let low = 0.62;
  let high = 1;
  let best = low;

  const applyScale = (scale: number) => {
    nodes.forEach((node, index) => {
      node.style.fontSize = `${Math.max(6, baseSizes[index] * scale)}px`;
    });
  };

  applyScale(low);
  if (isTextOutsidePanel(panel, nodes)) {
    panel.dataset.textFit = "minimum";
    return;
  }

  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) / 2;
    applyScale(mid);
    if (isTextOutsidePanel(panel, nodes)) high = mid;
    else {
      best = mid;
      low = mid;
    }
  }

  applyScale(best);
  panel.dataset.textFit = "scaled";
}

export default function PanelTextAutoFit() {
  useEffect(() => {
    let frame = 0;
    const observed = new Set<HTMLElement>();
    const resizeObserver = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const entry of entries) fitPanel(entry.target as HTMLElement);
      });
    });

    const scan = () => {
      document.querySelectorAll<HTMLElement>(`.screen-game ${PANEL_SELECTOR}`).forEach((panel) => {
        if (!observed.has(panel)) {
          observed.add(panel);
          resizeObserver.observe(panel);
        }
        fitPanel(panel);
      });
    };

    const queueScan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };

    const mutationObserver = new MutationObserver(queueScan);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("resize", queueScan, { passive: true });
    if (document.fonts?.ready) void document.fonts.ready.then(queueScan);
    queueScan();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", queueScan);
    };
  }, []);

  return null;
}
