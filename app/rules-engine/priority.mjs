import * as legacy from "./priority-legacy.mjs";
import { effectiveAIDifficulty, rankPriorityResponses } from "./competitive-ai-runtime.mjs";

export const PriorityState = legacy.PriorityState;
export const isAccelerated = legacy.isAccelerated;
export const legalPriorityResponses = legacy.legalPriorityResponses;
export const shouldAutoPass = legacy.shouldAutoPass;
export const priorityView = legacy.priorityView;

/** Competitive response selection with reserve conservation and believable errors. */
export function chooseAIResponse(state, owner, random = Math.random) {
  const pending = state?.pendingResponse;
  if (pending?.responder === owner && pending?.actor === owner && (pending.passes || 0) > 0)
    return { type: "passPriority", owner, auto: true };
  const legal = legacy.legalPriorityResponses(state, owner);
  return rankPriorityResponses(state, owner, legal, effectiveAIDifficulty("Normal"), random);
}
