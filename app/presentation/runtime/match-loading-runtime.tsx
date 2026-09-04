"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./match-loading-runtime.module.css";

const MIN_MATCH_LOADING_MS = 1300;
const MAX_MATCH_LOADING_MS = 7000;
const NO_CARD_GRACE_MS = 450;
const CARD_SELECTOR = ".screen-game .remote-card-art[data-page]";
const MATCH_SELECTOR = ".screen-game,.game-stage";

/**
 * Covers the board immediately after a match is mounted while the existing
 * preloadMatchCardArt pipeline warms both players' hero, hand, main-deck and
 * extra-deck art. The gate is intentionally bounded: usable compact card
 * rasters are enough to enter the match, and higher-resolution upgrades keep
 * happening progressively after the overlay is gone.
 */
export default function MatchLoadingRuntime() {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);

  useEffect(() => {
    const startedAt = performance.now();
    let disposed = false;
    let mutationFrame = 0;
    let minimumTimer = 0;
    let hardTimer = 0;

    const markMatchBusy = (busy: boolean) => {
      if (busy) document.documentElement.dataset.hemsfellMatchLoading = "true";
      else delete document.documentElement.dataset.hemsfellMatchLoading;
      document.querySelectorAll<HTMLElement>(".screen-game").forEach((screen) => {
        if (busy) {
          screen.dataset.matchLoading = "true";
          screen.setAttribute("aria-busy", "true");
        } else {
          delete screen.dataset.matchLoading;
          if (!screen.dataset.presentationBusy) screen.removeAttribute("aria-busy");
        }
      });
      window.dispatchEvent(new CustomEvent(busy ? "hemsfell:match-loading-start" : "hemsfell:match-loading-end"));
    };

    const usableCardArtReady = () => {
      if (!document.querySelector(MATCH_SELECTOR)) return false;
      const elapsed = performance.now() - startedAt;
      const canvases = [...document.querySelectorAll<HTMLCanvasElement>(CARD_SELECTOR)];
      if (!canvases.length) return elapsed >= MIN_MATCH_LOADING_MS + NO_CARD_GRACE_MS;
      return canvases.every((canvas) => canvas.dataset.loaded === "true");
    };

    const finish = () => {
      if (disposed || !visibleRef.current) return;
      visibleRef.current = false;
      observer.disconnect();
      if (mutationFrame) cancelAnimationFrame(mutationFrame);
      if (minimumTimer) window.clearTimeout(minimumTimer);
      if (hardTimer) window.clearTimeout(hardTimer);
      document.removeEventListener("keydown", blockKeyboard, true);
      markMatchBusy(false);
      setVisible(false);
    };

    const tryFinish = () => {
      if (disposed || !visibleRef.current) return;
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_MATCH_LOADING_MS) return;
      if (usableCardArtReady()) finish();
    };

    const scheduleCheck = () => {
      if (mutationFrame || disposed || !visibleRef.current) return;
      mutationFrame = requestAnimationFrame(() => {
        mutationFrame = 0;
        tryFinish();
      });
    };

    const observer = new MutationObserver(scheduleCheck);
    const blockKeyboard = (event: KeyboardEvent) => {
      if (!visibleRef.current) return;
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    };

    markMatchBusy(true);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-loaded", "data-page"],
    });
    document.addEventListener("keydown", blockKeyboard, true);
    minimumTimer = window.setTimeout(tryFinish, MIN_MATCH_LOADING_MS);
    hardTimer = window.setTimeout(finish, MAX_MATCH_LOADING_MS);
    scheduleCheck();

    return () => {
      disposed = true;
      visibleRef.current = false;
      observer.disconnect();
      if (mutationFrame) cancelAnimationFrame(mutationFrame);
      if (minimumTimer) window.clearTimeout(minimumTimer);
      if (hardTimer) window.clearTimeout(hardTimer);
      document.removeEventListener("keydown", blockKeyboard, true);
      markMatchBusy(false);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.overlay} data-hemsfell-match-loading="true" role="status" aria-live="polite" aria-label="Carregando partida">
      <div className={styles.panel}>
        <div className={styles.sigil} aria-hidden="true">✦</div>
        <p className={styles.eyebrow}>HEMSFELL HEROES</p>
        <h2 className={styles.title}>Carregando partida...</h2>
        <p className={styles.subtitle}>Pré-carregando as cartas dos jogadores e preparando o campo de batalha.</p>
        <div className={styles.track} aria-hidden="true"><span className={styles.bar} /></div>
      </div>
    </div>
  );
}
