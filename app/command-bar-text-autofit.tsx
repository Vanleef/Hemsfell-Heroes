"use client";

import { useEffect } from "react";

const CHIP_SELECTOR = ".screen-game .hero-command-bar .hero-ability-chip";
const originalInlineFont = new WeakMap<HTMLElement, string>();

function restore(node: HTMLElement) {
  if (!originalInlineFont.has(node)) originalInlineFont.set(node, node.style.fontSize);
  node.style.fontSize = originalInlineFont.get(node) ?? "";
}

function fits(chip: HTMLElement, content: HTMLElement) {
  const tolerance = 0.5;
  const chipRect = chip.getBoundingClientRect();
  const style = getComputedStyle(chip);
  const innerTop = chipRect.top + (parseFloat(style.paddingTop) || 0);
  const innerBottom = chipRect.bottom - (parseFloat(style.paddingBottom) || 0);
  const innerLeft = chipRect.left + (parseFloat(style.paddingLeft) || 0);
  const innerRight = chipRect.right - (parseFloat(style.paddingRight) || 0);
  const contentRect = content.getBoundingClientRect();

  return (
    content.scrollHeight <= content.clientHeight + tolerance &&
    content.scrollWidth <= content.clientWidth + tolerance &&
    contentRect.top >= innerTop - tolerance &&
    contentRect.bottom <= innerBottom + tolerance &&
    contentRect.left >= innerLeft - tolerance &&
    contentRect.right <= innerRight + tolerance
  );
}

function fitChip(chip: HTMLElement) {
  const content = chip.querySelector<HTMLElement>(":scope > span");
  if (!content || chip.clientWidth <= 0 || chip.clientHeight <= 0) return;

  const title = content.querySelector<HTMLElement>(":scope > b");
  const description = content.querySelector<HTMLElement>("p");
  const nodes = [title, description].filter(Boolean) as HTMLElement[];
  if (!nodes.length) return;

  nodes.forEach(restore);
  chip.dataset.commandTextFit = "native";

  const baseSizes = nodes.map((node) => parseFloat(getComputedStyle(node).fontSize) || 4);
  if (fits(chip, content)) return;

  // Command-bar copy is deliberately tiny at compact board sizes. Do not use a
  // fixed 6px floor here: that can make an already-small label larger and force
  // the clipping this fitter is meant to prevent.
  const minimumScale = 0.32;
  const applyScale = (scale: number) => {
    nodes.forEach((node, index) => {
      const minimum = Math.min(baseSizes[index], 2.15);
      node.style.fontSize = `${Math.max(minimum, baseSizes[index] * scale)}px`;
    });
  };

  applyScale(minimumScale);
  if (!fits(chip, content)) {
    chip.dataset.commandTextFit = "minimum";
    return;
  }

  let low = minimumScale;
  let high = 1;
  let best = minimumScale;
  for (let i = 0; i < 10; i += 1) {
    const mid = (low + high) / 2;
    applyScale(mid);
    if (fits(chip, content)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  applyScale(best);
  chip.dataset.commandTextFit = "scaled";
}

export default function CommandBarTextAutoFit() {
  useEffect(() => {
    let frame = 0;
    const observed = new Set<HTMLElement>();
    const resizeObserver = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        entries.forEach((entry) => fitChip(entry.target as HTMLElement));
      });
    });

    const scan = () => {
      document.querySelectorAll<HTMLElement>(CHIP_SELECTOR).forEach((chip) => {
        if (!observed.has(chip)) {
          observed.add(chip);
          resizeObserver.observe(chip);
        }
        fitChip(chip);
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
