import { AIController } from "./controller";
import type { AIAction, AIGameState } from "./types";

const controllers = new Map<number, AIController>();
let thinkingIndicatorInstalled = false;

function controllerFor(owner: number, difficulty: string): AIController {
  let controller = controllers.get(owner);
  if (!controller) {
    controller = new AIController(difficulty);
    controllers.set(owner, controller);
  }
  controller.setDifficulty(difficulty);
  installThinkingIndicator();
  return controller;
}

function installThinkingIndicator(): void {
  if (thinkingIndicatorInstalled || typeof window === "undefined") return;
  thinkingIndicatorInstalled = true;
  const onThinking = (event: Event) => {
    const detail = (event as CustomEvent<{ thinking?: boolean; difficulty?: string; personality?: string }>).detail || {};
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
