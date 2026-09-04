"use client";

import { useEffect } from "react";

type IconSnapshot = {
  cardId: string;
  page: string;
  name: string;
  fragments: HTMLElement[];
};

const LIVE_FRAME_SELECTOR = ".screen-game .game-stage .card-frame[data-unit-id]";
const FLIGHT_FACE_SELECTOR = ".hh-flight-face";
const ICON_FRAGMENT_SELECTOR = ".field-negative-statuses,.field-keywords,.card-frame-activation";
const HERO_PROGRESS_LABELS: Record<string, string> = {
  "Gimble": "Dragões em campo",
  "Sr. Goblin": "Cartas neste turno",
  "Uruk": "Feitiços conjurados",
  "Tifon": "Mortes aliadas",
  "Saymon": "Perdas de vida",
  "Tessália": "Ataques do Comandante",
  "Quarion": "Criaturas aliadas únicas",
  "Rasmus": "Gatos",
  "Ngoro": "Pistas",
  "Zayan": "Constantes",
  "Campeão de Natureza": "Marcadores",
};

function cleanFlightFragment(fragment: HTMLElement) {
  fragment.removeAttribute("title");
  fragment.setAttribute("aria-hidden", "true");
  fragment.querySelectorAll<HTMLElement>("[title]").forEach((node) => node.removeAttribute("title"));
  fragment.querySelectorAll<HTMLElement>("[aria-label]").forEach((node) => node.removeAttribute("aria-label"));
  if (fragment instanceof HTMLButtonElement) {
    fragment.disabled = true;
    fragment.tabIndex = -1;
  }
  fragment.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = true;
    button.tabIndex = -1;
  });
}

function snapshotForFrame(frame: HTMLElement): IconSnapshot | null {
  const card = frame.querySelector<HTMLElement>(":scope > .original-card");
  if (!card) return null;
  const fragments = Array.from(frame.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(ICON_FRAGMENT_SELECTOR))
    .map((child) => child.cloneNode(true) as HTMLElement);
  if (!fragments.length) return null;
  fragments.forEach(cleanFlightFragment);
  return {
    cardId: card.dataset.cardId || "",
    page: card.dataset.cardPage || "",
    name: card.dataset.cardName || card.getAttribute("aria-label") || "",
    fragments,
  };
}

function semanticKey(page: string, name: string) {
  return `${page}::${name.trim().toLocaleLowerCase("pt-BR")}`;
}

/**
 * Keeps card-local status/action affordances attached to portrait-space rather
 * than the rotating/targeting card face. Live cards already render the rails as
 * siblings of `.original-card`; this runtime only mirrors those siblings into
 * presentation flights, where the legacy animation clone contains the face by
 * itself.
 */
export default function MatchRequestedUiRuntime() {
  useEffect(() => {
    const byCardId = new Map<string, IconSnapshot>();
    const bySemantic = new Map<string, IconSnapshot>();
    const pendingFlights = new WeakSet<HTMLElement>();
    let frame = 0;

    const captureAll = () => {
      document.querySelectorAll<HTMLElement>(LIVE_FRAME_SELECTOR).forEach((cardFrame) => {
        if (cardFrame.closest(".hh-presentation-layer")) return;
        const snapshot = snapshotForFrame(cardFrame);
        if (!snapshot) return;
        if (snapshot.cardId) byCardId.set(snapshot.cardId, snapshot);
        if (snapshot.page || snapshot.name) bySemantic.set(semanticKey(snapshot.page, snapshot.name), snapshot);
      });
    };

    const snapshotForFlight = (face: HTMLElement) => {
      const card = face.querySelector<HTMLElement>(":scope > .original-card, .original-card");
      if (!card) return null;
      const cardId = card.dataset.cardId || "";
      if (cardId && byCardId.has(cardId)) return byCardId.get(cardId) || null;
      return bySemantic.get(semanticKey(card.dataset.cardPage || "", card.dataset.cardName || card.getAttribute("aria-label") || "")) || null;
    };

    const decorateFlight = (face: HTMLElement, allowRetry = true) => {
      if (!face.isConnected || face.querySelector(":scope > .hh-flight-status-shell")) return;
      const snapshot = snapshotForFlight(face);
      if (!snapshot) {
        if (!allowRetry || pendingFlights.has(face)) return;
        pendingFlights.add(face);
        requestAnimationFrame(() => {
          pendingFlights.delete(face);
          captureAll();
          decorateFlight(face, false);
        });
        return;
      }

      const shell = document.createElement("span");
      shell.className = "hh-flight-status-shell";
      shell.setAttribute("aria-hidden", "true");
      snapshot.fragments.forEach((fragment) => {
        const copy = fragment.cloneNode(true) as HTMLElement;
        cleanFlightFragment(copy);
        shell.append(copy);
      });
      if (shell.childElementCount) face.append(shell);
    };

    const syncEvolutionCopy = () => {
      document.querySelectorAll<HTMLElement>(".hh-hero-level-up b").forEach((label) => {
        const current = label.textContent || "";
        const next = current.replace(/ASCENSÃO/gi, (value) => value === value.toLowerCase() ? "evolução" : "EVOLUÇÃO");
        if (current !== next) label.textContent = next;
      });
    };

    const syncHeroProgressCopy = () => {
      document.querySelectorAll<HTMLElement>(".screen-game .hero-panel-stack.canonical-hero-panel").forEach((panel) => {
        const heroName = panel.querySelector<HTMLElement>(".hero-short-name")?.textContent?.trim() || "";
        const label = HERO_PROGRESS_LABELS[heroName];
        const copy = panel.querySelector<HTMLElement>(".hero-evolution-copy");
        const small = copy?.querySelector<HTMLElement>(":scope > small") || null;
        const strong = copy?.querySelector<HTMLElement>(":scope > strong") || null;
        if (!label || !copy || !small || !strong) return;

        const counter = (strong.textContent || "").trim();
        const completed = counter === "3/3" || small.textContent?.trim() === "EVOLUÇÃO CONCLUÍDA";
        const next = completed ? "EVOLUÇÃO CONCLUÍDA" : `${counter} ${label}`.trim();
        if (small.textContent !== next) small.textContent = next;
        if (!strong.hidden) strong.hidden = true;
        if (copy.dataset.hhShortProgress !== "true") copy.dataset.hhShortProgress = "true";
        if (copy.getAttribute("aria-label") !== next) copy.setAttribute("aria-label", next);
      });
    };

    const syncPriorityPair = () => {
      const ai = document.querySelector<HTMLElement>("[data-hemsfell-ai-thinking]");
      const stack = document.querySelector<HTMLElement>(".screen-game .priority-stack-indicator");
      if (!ai || !stack || !stack.isConnected || stack.getClientRects().length === 0) {
        if (ai) {
          delete ai.dataset.hhPriorityPaired;
          ai.style.removeProperty("--hh-ai-paired-left");
          ai.style.removeProperty("--hh-ai-paired-top");
        }
        return;
      }

      const stackRect = stack.getBoundingClientRect();
      const aiRect = ai.getBoundingClientRect();
      if (stackRect.width <= 0 || stackRect.height <= 0 || aiRect.width <= 0 || aiRect.height <= 0) return;
      const gap = Math.max(8, Math.min(14, window.innerWidth * 0.008));
      const rightCandidate = stackRect.right + gap;
      const leftCandidate = stackRect.left - gap - aiRect.width;
      const left = rightCandidate + aiRect.width <= window.innerWidth - 8
        ? rightCandidate
        : Math.max(8, leftCandidate);
      const top = Math.max(8, Math.min(window.innerHeight - aiRect.height - 8, stackRect.top + (stackRect.height - aiRect.height) / 2));
      ai.style.setProperty("--hh-ai-paired-left", `${left}px`);
      ai.style.setProperty("--hh-ai-paired-top", `${top}px`);
      ai.dataset.hhPriorityPaired = "true";
    };

    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        captureAll();
        document.querySelectorAll<HTMLElement>(FLIGHT_FACE_SELECTOR).forEach((face) => decorateFlight(face));
        syncEvolutionCopy();
        syncHeroProgressCopy();
        syncPriorityPair();
      });
    };

    captureAll();
    syncEvolutionCopy();
    syncHeroProgressCopy();
    syncPriorityPair();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const onPresentationAction = () => captureAll();
    const onResize = () => syncPriorityPair();
    window.addEventListener("hemsfell:presentation-action", onPresentationAction, true);
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("hemsfell:presentation-action", onPresentationAction, true);
      window.removeEventListener("resize", onResize);
      const ai = document.querySelector<HTMLElement>("[data-hemsfell-ai-thinking]");
      if (ai) {
        delete ai.dataset.hhPriorityPaired;
        ai.style.removeProperty("--hh-ai-paired-left");
        ai.style.removeProperty("--hh-ai-paired-top");
      }
    };
  }, []);

  return null;
}
