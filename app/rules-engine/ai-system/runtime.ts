import { AIController } from "./controller";
import type { AIAction, AIGameState } from "./types";

const controllers = new Map<number, AIController>();
let thinkingIndicatorInstalled = false;
let debugTelemetryInstalled = false;

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

function installThinkingIndicator(): void {
  if (thinkingIndicatorInstalled || typeof window === "undefined") return;
  thinkingIndicatorInstalled = true;
  const onThinking = (event: Event) => {
    const detail = (event as CustomEvent<{ thinking?: boolean; difficulty?: string; personality?: string; beliefEntropy?: number }>).detail || {};
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
    node.textContent = `IA pensando · ${detail.difficulty || "Normal"}${detail.personality ? ` · ${detail.personality}` : ""}`;
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
  const result = await controllerFor(owner, difficulty).chooseAction(state, owner);
  return result.action;
}

export async function chooseAdvancedAIDecision(state: AIGameState, owner: number, difficulty: string): Promise<AIAction | null> {
  if (!state.pendingDecision) return null;
  return chooseAdvancedAIAction(state, owner, difficulty);
}

export function planAdvancedAIAttacks(state: AIGameState, owner: number, difficulty: string): string[] {
  return controllerFor(owner, difficulty).planAttacks(state, owner).map((plan) => plan.attackerId).filter(Boolean);
}

export function chooseAdvancedAIBlock(state: AIGameState, owner: number, attacker: unknown, difficulty: string): { defenderId?: string; takeDamage: boolean } {
  const plan = controllerFor(owner, difficulty).chooseBlock(state, owner, attacker);
  return { defenderId: plan.defenderId, takeDamage: plan.takeDamage };
}

/**
 * Priority is searched by the same imperfect-information controller used for
 * normal turns. While a response window is open the controller exposes only
 * legal responses plus pass, so it can compare "answer now" versus "hold"
 * without evaluating the player's real hidden hand.
 */
export async function chooseAdvancedAIResponse(state: AIGameState, owner: number, difficulty: string): Promise<AIAction> {
  const action = await chooseAdvancedAIAction(state, owner, difficulty);
  return action || { type: "passPriority", owner };
}

export function shouldKeepAdvancedMulligan(state: AIGameState, owner: number, difficulty: string): boolean {
  return controllerFor(owner, difficulty).shouldKeepMulligan(state, owner);
}

export function resetAdvancedAI(owner?: number): void {
  if (owner == null) controllers.clear();
  else controllers.delete(owner);
}
