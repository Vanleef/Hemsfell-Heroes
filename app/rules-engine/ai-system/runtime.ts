import { completeAIPlayCommand } from "../ai.mjs";
import { executeCommand } from "../engine.mjs";
import { legalPriorityResponses } from "../priority.mjs";
import { AIController } from "./controller";
import { Evaluator } from "./evaluator";
import { normalizeDifficulty } from "./config";
import { personalityForHero } from "./personality";
import type { AIAction, AIGameState } from "./types";

const controllers = new Map<number, AIController>();
const evaluator = new Evaluator();
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
  const controller = controllerFor(owner, difficulty);
  return controller.planAttacks(state, owner).map((plan) => plan.attackerId).filter(Boolean);
}

export function chooseAdvancedAIBlock(state: AIGameState, owner: number, attacker: unknown, difficulty: string): { defenderId?: string; takeDamage: boolean } {
  const controller = controllerFor(owner, difficulty);
  const plan = controller.chooseBlock(state, owner, attacker);
  return { defenderId: plan.defenderId, takeDamage: plan.takeDamage };
}

/**
 * Priority windows are intentionally evaluated outside the normal MCTS root:
 * the legacy candidate generator suppresses main-phase actions while priority
 * is open. We still use the same evaluator/personality and validate every
 * response through the authoritative engine before ranking it against pass.
 */
export async function chooseAdvancedAIResponse(state: AIGameState, owner: number, difficulty: string): Promise<AIAction> {
  const profile = personalityForHero(state.players[owner]?.heroId);
  const level = normalizeDifficulty(difficulty);
  const commands = legalPriorityResponses(state, owner) as AIAction[];
  const legal: Array<{ action: AIAction; score: number }> = [];

  for (const raw of commands) {
    let command: AIAction | null = raw;
    if (raw.type === "playCard") {
      const card = state.players[owner]?.hand?.find((candidate: any) => candidate.id === raw.cardId);
      command = card ? completeAIPlayCommand(state, owner, card, difficulty, { hasPriority: true }) as AIAction | null : null;
    }
    if (!command) continue;
    try {
      const next = executeCommand(structuredClone(state), command, { priority: true }).state as AIGameState;
      let score = evaluator.evaluate(next, owner, profile, level === "Easy" ? .12 : level === "Normal" ? .05 : .01);
      if (command.type === "activateHero") score += profile.interaction * 1.5;
      if (command.type === "playCard") score += profile.interaction * 2;
      legal.push({ action: command, score });
    } catch {
      // Invalid candidates are ignored rather than leaking into the UI driver.
    }
  }

  const pass: AIAction = { type: "passPriority", owner };
  if (!legal.length) return pass;
  legal.sort((a, b) => b.score - a.score);

  // Human-like response discipline: control/combo profiles are more willing to
  // keep interaction hidden when the current window is not sufficiently valuable.
  const holdThreshold = profile.holdResponses * 2.2 + profile.riskTolerance * .6;
  const currentScore = evaluator.evaluate(state, owner, profile, 0);
  if (legal[0].score < currentScore + holdThreshold) return pass;

  if (level === "Easy" && legal.length > 1 && Math.random() < .25) return legal[Math.min(1, legal.length - 1)].action;
  if (level === "Normal" && legal.length > 1 && Math.random() < .08) return legal[Math.min(1, legal.length - 1)].action;
  return legal[0].action;
}

export function shouldKeepAdvancedMulligan(state: AIGameState, owner: number, difficulty: string): boolean {
  return controllerFor(owner, difficulty).shouldKeepMulligan(state, owner);
}

export function resetAdvancedAI(owner?: number): void {
  if (owner == null) controllers.clear();
  else controllers.delete(owner);
}
