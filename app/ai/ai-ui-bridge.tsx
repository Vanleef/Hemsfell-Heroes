"use client";

import { useEffect } from "react";

declare global {
  // Read synchronously by the compatibility AI facade without coupling it to React state.
  // eslint-disable-next-line no-var
  var __HEMSFELL_AI_DIFFICULTY__: string | undefined;
}

const STORAGE_KEY = "hemsfell-ai-difficulty";
const LEVELS = ["Fácil", "Normal", "Difícil", "Expert", "Master"] as const;

function activeDifficulty(): string {
  return globalThis.__HEMSFELL_AI_DIFFICULTY__ || "Normal";
}

function syncDifficultyControls(): void {
  const group = document.querySelector<HTMLElement>(".match-setup .difficulty");
  if (!group) return;
  for (const label of ["Expert", "Master"] as const) {
    if (Array.from(group.querySelectorAll("button")).some(button => button.textContent?.trim() === label)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.competitiveAiLevel = label;
    button.title = label === "Expert" ? "IS-MCTS forte, crença refinada e poucos erros." : "Máxima busca permitida no browser, crença avançada e estilo adaptativo.";
    group.append(button);
  }
  const selected = activeDifficulty();
  group.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
    const active = button.textContent?.trim() === selected;
    button.classList.toggle("ai-difficulty-selected", active);
    if (active) button.setAttribute("aria-pressed", "true"); else button.removeAttribute("aria-pressed");
  });
}

function syncThinkingIndicator(): void {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
  if (!board) return;
  const online = !!board.querySelector(".match-clock");
  const opponentTurn = /^turno de\b/i.test(board.querySelector<HTMLElement>(".turn-owner b")?.textContent?.trim() || "");
  const priorityThinking = /ia está avaliando/i.test(board.querySelector<HTMLElement>(".response-waiting")?.textContent || "");
  const shouldShow = !online && (opponentTurn || priorityThinking) && !board.querySelector(".overlay .maintenance");
  let indicator = board.querySelector<HTMLElement>(":scope > .competitive-ai-thinking");
  if (!shouldShow) { indicator?.remove(); return; }
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "competitive-ai-thinking";
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-live", "polite");
    indicator.innerHTML = "<i aria-hidden=\"true\"></i><span></span><b aria-hidden=\"true\">•••</b>";
    board.append(indicator);
  }
  const difficulty = activeDifficulty();
  indicator.dataset.difficulty = difficulty;
  const copy = indicator.querySelector<HTMLElement>("span");
  if (copy) copy.textContent = priorityThinking ? `IA ${difficulty} · avaliando resposta` : `IA ${difficulty} · pensando`;
}

export default function AIUiBridge() {
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LEVELS.includes(saved as (typeof LEVELS)[number])) globalThis.__HEMSFELL_AI_DIFFICULTY__ = saved;

    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { syncDifficultyControls(); syncThinkingIndicator(); });
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".difficulty button") : null;
      const label = target?.textContent?.trim();
      if (!label || !LEVELS.includes(label as (typeof LEVELS)[number])) return;
      globalThis.__HEMSFELL_AI_DIFFICULTY__ = label;
      localStorage.setItem(STORAGE_KEY, label);
      sync();
    };
    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", sync, { passive: true });
    sync();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return <style>{`
    .match-setup .difficulty button.ai-difficulty-selected {
      border-color: color-mix(in srgb, var(--gold, #e4b13f) 86%, white) !important;
      box-shadow: 0 0 clamp(.28rem,.72vw,.7rem) color-mix(in srgb, var(--gold, #e4b13f) 28%, transparent) !important;
      filter: brightness(1.14);
    }
    .competitive-ai-thinking {
      position: absolute;
      z-index: 740;
      top: clamp(2.4rem, 5.3cqh, 3.8rem);
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: clamp(.28rem,.5cqw,.5rem);
      width: max-content;
      max-width: min(42cqw, 26rem);
      padding: clamp(.26rem,.48cqh,.42rem) clamp(.48rem,.75cqw,.78rem);
      border: 1px solid color-mix(in srgb, var(--gold, #e4b13f) 45%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, #090d14 88%, transparent);
      backdrop-filter: blur(.45rem);
      pointer-events: none;
      font-size: clamp(.62rem,.74cqw,.82rem);
      line-height: 1;
      white-space: nowrap;
    }
    .competitive-ai-thinking > i {
      width: clamp(.38rem,.55cqw,.55rem);
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--gold, #e4b13f);
      box-shadow: 0 0 .55rem color-mix(in srgb, var(--gold, #e4b13f) 70%, transparent);
      animation: competitive-ai-pulse 1s ease-in-out infinite alternate;
    }
    .competitive-ai-thinking > b { letter-spacing: .08em; animation: competitive-ai-dots 1.15s steps(3,end) infinite; overflow: hidden; width: 2.2em; }
    @keyframes competitive-ai-pulse { to { opacity:.38; transform:scale(.72); } }
    @keyframes competitive-ai-dots { from { width:.5em; } to { width:2.2em; } }
    @container hemsfell-board (max-width: 54rem) {
      .competitive-ai-thinking { top: clamp(2.15rem, 5cqh, 3rem); max-width: 48cqw; font-size: clamp(.55rem,1.05cqw,.72rem); }
    }
  `}</style>;
}
