import { AIController } from "./controller";
import { legalPriorityResponses } from "../priority.mjs";
import { chooseAIDecision } from "../ai.mjs";
import { legacyDifficultyLabel, normalizeDifficulty } from "./config";
import type { AIAction, AIGameState, AIObservation } from "./types";

const controllers = new Map<number, AIController>();
const lastObservedState = new Map<number, AIGameState>();
const priorityInFlight = new Map<string, Promise<AIAction>>();
const recentlySettledPriority = new Map<string, number>();
const PRIORITY_HARD_TIMEOUT_MS = 850;
const PRESENTATION_IDLE_FAILSAFE_MS = 20000;
const PRESENTATION_IDLE_EVENTS = ["hemsfell:presentation-idle"] as const;
let thinkingIndicatorInstalled = false;
let debugTelemetryInstalled = false;

type PresentationWindow = Window & {
  __hemsfellPresentationBusy?: boolean;
};

const presentationBusy = () => {
  if (typeof window === "undefined") return false;
  const presentationWindow = window as PresentationWindow;
  return !!presentationWindow.__hemsfellPresentationBusy;
};

async function waitForPresentationIdle(): Promise<void> {
  if (!presentationBusy()) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const cleanup = () => {
      PRESENTATION_IDLE_EVENTS.forEach((eventName) => window.removeEventListener(eventName, onIdle));
      window.clearTimeout(failsafe);
    };
    const finish = () => {
      if (settled || presentationBusy()) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onIdle = () => finish();
    const failsafe = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, PRESENTATION_IDLE_FAILSAFE_MS);
    PRESENTATION_IDLE_EVENTS.forEach((eventName) => window.addEventListener(eventName, onIdle));
    queueMicrotask(finish);
  });
}

const cardId = (card: any) => String(card?.uid ?? card?.id ?? "");
const publicCards = (player: any) => [
  ...(player?.board || []),
  ...(player?.support || []),
  ...(player?.terrain ? [player.terrain] : []),
  ...(player?.grave || []),
  ...(player?.obscuro || []),
];

const clock = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const passPriority = (owner: number): AIAction => ({ type: "passPriority", owner, auto: true });
const prioritySignature = (state: AIGameState, owner: number) => {
  const pending = state.pendingResponse as any;
  const pendingAction = state.pendingAction as any;
  const priorityStack = Array.isArray(state.priorityStack) ? state.priorityStack : [];
  const effectStack = Array.isArray(state.effectStack) ? state.effectStack : [];
  return [
    owner,
    state.round,
    state.phase,
    state.active,
    pending?.actor ?? "-",
    pending?.responder ?? "-",
    pending?.passes ?? 0,
    pending?.action ?? "-",
    pendingAction?.type ?? "-",
    pendingAction?.cardId ?? pendingAction?.sourceId ?? pendingAction?.abilityId ?? "-",
    priorityStack.length,
    effectStack.length,
  ].join("|");
};

const prunePriorityGuards = (now = clock()) => {
  for (const [key, settledAt] of recentlySettledPriority) if (now - settledAt > 5000) recentlySettledPriority.delete(key);
};

const boundedPrioritySearch = (search: Promise<AIAction | null>, owner: number): Promise<AIAction> => new Promise((resolve) => {
  let settled = false;
  const finish = (action: AIAction | null | undefined) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(action || passPriority(owner));
  };
  const timer = setTimeout(() => finish(passPriority(owner)), PRIORITY_HARD_TIMEOUT_MS);
  void search.then(finish).catch(() => finish(passPriority(owner)));
});

function controllerFor(owner: number, difficulty: string): AIController {
  let controller = controllers.get(owner);
  if (!controller) {
    controller = new AIController(difficulty);
    controllers.set(owner, controller);
  }
  controller.setDifficulty(difficulty);
  installThinkingIndicator();
  installDebugTelemetry();
  return controller;
}

/**
 * Derive only public observations between AI decisions. The runtime may hold a
 * complete local game state, but the controller receives card identities only
 * after those cards become public. Hidden draws are represented by count only.
 */
function observePublicDelta(controller: AIController, state: AIGameState, owner: number): void {
  const previous = lastObservedState.get(owner);
  if (!previous) {
    lastObservedState.set(owner, structuredClone(state));
    return;
  }
  const opponent = 1 - owner;
  const before = previous.players[opponent];
  const after = state.players[opponent];
  if (!before || !after) return;

  const previousPublicIds = new Set(publicCards(before).map(cardId).filter(Boolean));
  const previousHandIds = new Set((before.hand || []).map(cardId).filter(Boolean));
  const newlyPublic = publicCards(after).filter((card) => {
    const id = cardId(card);
    return id && !previousPublicIds.has(id);
  });
  const fromHand = newlyPublic.filter((card) => previousHandIds.has(cardId(card)));

  for (const card of fromHand) {
    controller.observe({ type: "play", player: opponent, cardId: cardId(card), card, round: state.round });
  }

  const deckDelta = Math.max(0, Number(before.deck?.length || 0) - Number(after.deck?.length || 0));
  const handDelta = Number(after.hand?.length || 0) - Number(before.hand?.length || 0);
  const inferredDraws = Math.min(deckDelta, Math.max(0, handDelta + fromHand.length));
  if (inferredDraws > 0) controller.observe({ type: "draw", player: opponent, count: inferredDraws, round: state.round });

  lastObservedState.set(owner, structuredClone(state));
}

function installThinkingIndicator(): void {
  if (thinkingIndicatorInstalled || typeof window === "undefined") return;
  thinkingIndicatorInstalled = true;
  const onThinking = (event: Event) => {
    const detail = (event as CustomEvent<{ thinking?: boolean; difficulty?: string; personality?: string; beliefEntropy?: number; context?: string }>).detail || {};
    let node = document.querySelector<HTMLElement>("[data-hemsfell-ai-thinking]");
    if (!detail.thinking) {
      node?.remove();
      return;
    }
    if (!node) {
      node = document.createElement("div");
      node.dataset.hemsfellAiThinking = "true";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      Object.assign(node.style, {
        position: "fixed",
        top: "clamp(.55rem, 1.4vh, 1rem)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "120000",
        padding: "clamp(.38rem,.75vh,.6rem) clamp(.65rem,1.2vw,1rem)",
        border: "1px solid rgba(226,177,63,.65)",
        borderRadius: "999px",
        background: "rgba(4,22,29,.94)",
        boxShadow: "0 0 1.2rem rgba(0,0,0,.45)",
        color: "#f1d78b",
        fontSize: "clamp(.68rem,.75vw,.88rem)",
        fontWeight: "700",
        letterSpacing: ".04em",
        pointerEvents: "none",
      });
      document.body.appendChild(node);
    }
    const label = detail.context === "priority" ? "IA avaliando prioridade" : "IA pensando";
    node.textContent = `${label} · ${detail.difficulty || "Normal"}${detail.personality ? ` · ${detail.personality}` : ""}`;
  };
  window.addEventListener("hemsfell:ai-thinking", onThinking);
}

function installDebugTelemetry(): void {
  if (debugTelemetryInstalled || typeof window === "undefined") return;
  debugTelemetryInstalled = true;
  const enabled = () => {
    try {
      return window.localStorage.getItem("hemsfell-ai-debug") === "1" || new URLSearchParams(window.location.search).get("aiDebug") === "1";
    } catch { return false; }
  };
  window.addEventListener("hemsfell:ai-debug", (event: Event) => {
    if (!enabled()) return;
    const detail = (event as CustomEvent<any>).detail || {};
    let node = document.querySelector<HTMLElement>("[data-hemsfell-ai-debug]");
    if (!node) {
      node = document.createElement("pre");
      node.dataset.hemsfellAiDebug = "true";
      Object.assign(node.style, {
        position: "fixed",
        right: "clamp(.5rem,1vw,1rem)",
        bottom: "clamp(.5rem,1vh,1rem)",
        zIndex: "120001",
        maxWidth: "min(34rem,46vw)",
        maxHeight: "38vh",
        overflow: "auto",
        margin: "0",
        padding: "clamp(.55rem,1vmin,.85rem)",
        border: "1px solid rgba(113,190,204,.5)",
        borderRadius: ".7rem",
        background: "rgba(3,14,20,.94)",
        color: "#bde8ee",
        fontSize: "clamp(.62rem,.66vw,.78rem)",
        lineHeight: "1.35",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
      });
      document.body.appendChild(node);
    }
    const entropy = Number(detail.belief?.entropy || 0);
    const effective = Number(detail.belief?.effectiveParticles || 0);
    const ips = Number(detail.stats?.iterationsPerSecond || 0);
    node.textContent = [
      `AI DEBUG · ${detail.difficulty || "?"} · ${detail.personality || "?"}`,
      `belief entropy: ${entropy.toFixed(3)} · effective particles: ${effective.toFixed(1)}`,
      `evaluation: ${Number(detail.evaluation || 0).toFixed(2)} · lethal margin: ${Number(detail.lethalMargin || 0).toFixed(1)}`,
      `search: ${Number(detail.stats?.iterations || 0)} it · ${ips.toFixed(0)} it/s · ${Number(detail.stats?.elapsedMs || 0).toFixed(0)} ms`,
      `opponent memory: aggro ${Number(detail.opponentMemory?.aggression || 0).toFixed(2)} · patience ${Number(detail.opponentMemory?.patience || 0).toFixed(2)} · interaction ${Number(detail.opponentMemory?.interaction || 0).toFixed(2)}`,
    ].join("\n");
  });
}

export async function chooseAdvancedAIAction(state: AIGameState, owner: number, difficulty: string): Promise<AIAction | null> {
  await waitForPresentationIdle();
  const controller = controllerFor(owner, difficulty);
  observePublicDelta(controller, state, owner);
  const result = await controller.chooseAction(state, owner);
  lastObservedState.set(owner, structuredClone(state));
  return result.action;
}

export async function chooseAdvancedAIDecision(state: AIGameState, owner: number, difficulty: string): Promise<AIAction | null> {
  if (!state.pendingDecision) return null;
  await waitForPresentationIdle();
  /* Mandatory engine decisions are already validated and bounded. Resolve
     them deterministically instead of sending them through MCTS: a generated
     Image attachment (such as Tranqueira -> Trambuco) must never stall the
     turn because a strategic search yielded no action. */
  const decision = chooseAIDecision(state, owner, legacyDifficultyLabel(normalizeDifficulty(difficulty))) as AIAction | null;
  return decision ?? chooseAdvancedAIAction(state, owner, difficulty);
}

export function planAdvancedAIAttacks(state: AIGameState, owner: number, difficulty: string): string[] {
  return controllerFor(owner, difficulty).planAttacks(state, owner).map((plan) => plan.attackerId).filter(Boolean);
}

export function chooseAdvancedAIBlock(state: AIGameState, owner: number, attacker: unknown, difficulty: string): { defenderId?: string; takeDamage: boolean } {
  const plan = controllerFor(owner, difficulty).chooseBlock(state, owner, attacker);
  return { defenderId: plan.defenderId, takeDamage: plan.takeDamage };
}

/**
 * Priority uses the same imperfect-information controller. Presentation pacing
 * is awaited before the response search starts; the existing 850 ms hard
 * deadline still bounds the actual response computation once the board is idle.
 */
export async function chooseAdvancedAIResponse(state: AIGameState, owner: number, difficulty: string): Promise<AIAction> {
  await waitForPresentationIdle();
  const pending = state.pendingResponse as any;
  if (!pending || pending.responder !== owner) return passPriority(owner);
  if (pending.actor === owner && Number(pending.passes || 0) > 0) return passPriority(owner);
  if (legalPriorityResponses(state, owner).length === 0) return passPriority(owner);

  prunePriorityGuards();
  const signature = prioritySignature(state, owner);
  const existing = priorityInFlight.get(signature);
  if (existing) return existing;
  const settledAt = recentlySettledPriority.get(signature);
  if (settledAt != null && clock() - settledAt < 2500) return passPriority(owner);

  const task = boundedPrioritySearch(chooseAdvancedAIAction(state, owner, difficulty), owner)
    .finally(() => {
      priorityInFlight.delete(signature);
      recentlySettledPriority.set(signature, clock());
      prunePriorityGuards();
    });
  priorityInFlight.set(signature, task);
  return task;
}

export function shouldKeepAdvancedMulligan(state: AIGameState, owner: number, difficulty: string): boolean {
  return controllerFor(owner, difficulty).shouldKeepMulligan(state, owner);
}

/** Optional explicit observation hook for server/online integrations. */
export function observeAdvancedAI(owner: number, difficulty: string, observation: AIObservation): void {
  controllerFor(owner, difficulty).observe(observation);
}

export function resetAdvancedAI(owner?: number): void {
  if (owner == null) {
    controllers.clear();
    lastObservedState.clear();
    priorityInFlight.clear();
    recentlySettledPriority.clear();
  } else {
    controllers.delete(owner);
    lastObservedState.delete(owner);
    for (const key of priorityInFlight.keys()) if (key.startsWith(`${owner}|`)) priorityInFlight.delete(key);
    for (const key of recentlySettledPriority.keys()) if (key.startsWith(`${owner}|`)) recentlySettledPriority.delete(key);
  }
}
