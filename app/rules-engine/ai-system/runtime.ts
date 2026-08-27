import { chooseAdvancedAIAction as chooseCoreAction } from "./runtime-core";
import type { AIAction, AIGameState } from "./types";

export {
  chooseAdvancedAIDecision,
  planAdvancedAIAttacks,
  chooseAdvancedAIBlock,
  chooseAdvancedAIResponse,
  shouldKeepAdvancedMulligan,
  observeAdvancedAI,
  resetAdvancedAI,
} from "./runtime-core";

type PresentationWindow = Window & { __hemsfellPresentationBusy?: boolean };
const PRESENTATION_IDLE_EVENT = "hemsfell:presentation-idle";
/* Eight serial PR1 flights can legitimately exceed seven seconds. This guard
 * exists only for catastrophic runtime teardown; normal pacing resolves on the
 * explicit idle event. */
const PRESENTATION_IDLE_FAILSAFE_MS = 12000;

function waitForPresentationIdle(): Promise<void> {
  if (typeof window === "undefined" || !(window as PresentationWindow).__hemsfellPresentationBusy) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(failsafe);
      window.removeEventListener(PRESENTATION_IDLE_EVENT, onIdle);
      resolve();
    };
    const onIdle = () => finish();
    const failsafe = window.setTimeout(finish, PRESENTATION_IDLE_FAILSAFE_MS);
    window.addEventListener(PRESENTATION_IDLE_EVENT, onIdle, { once: true });
    if (!(window as PresentationWindow).__hemsfellPresentationBusy) finish();
  });
}

/** Normal bot turns respect board presentation pacing. Priority responses do
 * not pass through this wrapper: runtime-core owns them and retains its hard
 * response deadline, so animation can never delay a legal response window. */
export async function chooseAdvancedAIAction(state: AIGameState, owner: number, difficulty: string): Promise<AIAction | null> {
  await waitForPresentationIdle();
  return chooseCoreAction(state, owner, difficulty);
}
