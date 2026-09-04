"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./match-loading-runtime.module.css";

const MIN_MATCH_LOADING_MS = 1300;
const HAND_RECHECK_MS = 350;
const PLAYER_HAND_SELECTOR = ".screen-game .player-hand";
const OPPONENT_HAND_SELECTOR = ".screen-game .opponent-hand";
const HAND_CARD_SELECTOR = ".card-frame,.opponent-card-back,.official-card-back";
const REMOTE_ART_SELECTOR = "canvas.remote-card-art[data-page]";
const MATCH_CARD_BACK_URL = "/cards/card-back-hemsfell.webp";

/**
 * Covers the board immediately after a match is mounted while match art warms.
 * The gate has one non-negotiable visual contract: it cannot disappear until
 * both opening hands have mounted and every visible/revealed hand raster is
 * usable. Hidden opponent cards are gated by the shared card-back image.
 * Higher-resolution upgrades and the rest of the match universe may continue
 * progressively after the overlay is gone.
 */
export default function MatchLoadingRuntime() {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);

  useEffect(() => {
    const startedAt = performance.now();
    let disposed = false;
    let mutationFrame = 0;
    let minimumTimer = 0;
    let recheckTimer = 0;
    let cardBackReady = false;

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

    const handReady = (selector: string, opponent = false) => {
      const hand = document.querySelector<HTMLElement>(selector);
      if (!hand) return false;
      const cards = [...hand.querySelectorAll<HTMLElement>(`:scope > ${HAND_CARD_SELECTOR.split(",").join(",:scope > ")}`)];
      if (!cards.length) return false;

      if (opponent && hand.querySelector(".opponent-card-back,.official-card-back") && !cardBackReady) return false;

      return cards.every((card) => {
        const art = card.querySelector<HTMLCanvasElement>(REMOTE_ART_SELECTOR);
        return !art || art.dataset.loaded === "true";
      });
    };

    const bothOpeningHandsReady = () => handReady(PLAYER_HAND_SELECTOR) && handReady(OPPONENT_HAND_SELECTOR, true);

    const finish = () => {
      if (disposed || !visibleRef.current) return;
      visibleRef.current = false;
      observer.disconnect();
      if (mutationFrame) cancelAnimationFrame(mutationFrame);
      if (minimumTimer) window.clearTimeout(minimumTimer);
      if (recheckTimer) window.clearTimeout(recheckTimer);
      document.removeEventListener("keydown", blockKeyboard, true);
      markMatchBusy(false);
      setVisible(false);
    };

    const tryFinish = () => {
      if (disposed || !visibleRef.current) return;
      const elapsed = performance.now() - startedAt;
      if (elapsed >= MIN_MATCH_LOADING_MS && bothOpeningHandsReady()) {
        finish();
        return;
      }
      if (!recheckTimer) {
        recheckTimer = window.setTimeout(() => {
          recheckTimer = 0;
          tryFinish();
        }, HAND_RECHECK_MS);
      }
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

    const cardBack = new Image();
    cardBack.decoding = "async";
    cardBack.onload = () => {
      cardBackReady = true;
      scheduleCheck();
    };
    cardBack.onerror = () => {
      // Do not falsely unlock the gate. The next retry remains behind loading
      // until the browser can provide the shared hidden-card visual.
      cardBackReady = false;
    };
    cardBack.src = MATCH_CARD_BACK_URL;
    if (cardBack.complete && cardBack.naturalWidth > 0) cardBackReady = true;

    markMatchBusy(true);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-loaded", "data-page"],
    });
    document.addEventListener("keydown", blockKeyboard, true);
    minimumTimer = window.setTimeout(tryFinish, MIN_MATCH_LOADING_MS);
    scheduleCheck();

    return () => {
      disposed = true;
      visibleRef.current = false;
      observer.disconnect();
      cardBack.onload = null;
      cardBack.onerror = null;
      if (mutationFrame) cancelAnimationFrame(mutationFrame);
      if (minimumTimer) window.clearTimeout(minimumTimer);
      if (recheckTimer) window.clearTimeout(recheckTimer);
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
        <p className={styles.subtitle}>Preparando as mãos dos dois jogadores e os assets essenciais da partida.</p>
        <div className={styles.track} aria-hidden="true"><span className={styles.bar} /></div>
      </div>
    </div>
  );
}
