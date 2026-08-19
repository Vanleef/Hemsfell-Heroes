import { executeCommand as executeRulesCommand } from "./engine.mjs";
import { PriorityMode, PriorityWindow, openResponseWindow, syncPriorityMetadata } from "./priority-state.mjs";
import { OnlineCombatStage } from "./online-combat.mjs";

const clone = (value) => structuredClone(value);
const cardId = (card) => card?.uid || card?.id;

function attackStillPresent(state, owner, attackerId) {
  return state.players?.[owner]?.board?.some((unit) => cardId(unit) === attackerId);
}

function liveDefenderId(state, owner, defenderId) {
  if (!defenderId) return undefined;
  return state.players?.[owner]?.board?.some((unit) => cardId(unit) === defenderId) ? defenderId : undefined;
}

function openCombatEndWindow(state) {
  const combat = state.onlineCombat;
  combat.stage = OnlineCombatStage.COMBAT_END;
  openResponseWindow(state, {
    actor: combat.attackerOwner,
    responder: combat.attackerOwner,
    action: "fim da etapa de Combate",
    window: PriorityWindow.COMBAT_END,
    pendingAction: { type: "onlineCheckpoint", checkpoint: OnlineCombatStage.COMBAT_END, owner: combat.attackerOwner },
  });
  return syncPriorityMetadata(state, { window: PriorityWindow.COMBAT_END });
}

/**
 * Resolve declared combat instances in their already-canonical left-to-right
 * order. The shared rules engine remains responsible for synchronous damage,
 * Veloz, Atropelar, Robusto, Roubo de Vida, Toque da Morte and all triggered
 * card rules. A missing blocker follows the pre-existing Hemsfell combat rule:
 * the engine resolves that lane as direct damage. An attacker removed or made
 * illegal before its lane is skipped rather than resurrected by the resolver.
 */
export function continueOnlineCombatResolution(inputState) {
  let state = clone(inputState);
  const combat = state.onlineCombat;
  if (!combat || combat.stage !== OnlineCombatStage.RESOLVING) return syncPriorityMetadata(state);
  if (state.pendingDecision || state.pendingReposition || state.pendingResponse) return syncPriorityMetadata(state, { mode: PriorityMode.RESOLVING, owner: null, window: null });

  const defenderOwner = 1 - combat.attackerOwner;
  while (combat.resolutionIndex < combat.attackers.length) {
    const index = combat.resolutionIndex;
    const instance = combat.attackers[index];
    combat.resolutionIndex = index + 1;
    if (!attackStillPresent(state, combat.attackerOwner, instance.attackerId)) continue;

    const block = combat.blocks.find((entry) => entry.attackId === instance.attackId);
    const defenderId = liveDefenderId(state, defenderOwner, block?.defenderId);
    try {
      const result = executeRulesCommand(state, {
        type: "attack",
        owner: combat.attackerOwner,
        attackerId: instance.attackerId,
        ...(defenderId ? { defenderId } : {}),
        skipPriority: true,
      }, { priority: false });
      state = result.state;
      state.onlineCombat = { ...combat, resolutionIndex: index + 1 };
    } catch (error) {
      /* Responses made after declaration may legally invalidate an attacker
         under the existing engine (for example it left the battlefield). The
         declaration stays in history but that lane no longer deals damage. */
      if (!/invalid-attacker|attack-requirement-not-met|wrong-combat-priority/.test(String(error?.message || error))) throw error;
      state.onlineCombat = { ...combat, resolutionIndex: index + 1 };
    }

    if (state.pendingDecision || state.pendingReposition) {
      state.onlineCombat.stage = OnlineCombatStage.RESOLVING;
      return syncPriorityMetadata(state, { mode: PriorityMode.RESOLVING, owner: null, window: null });
    }
  }

  return openCombatEndWindow(state);
}

export function completeOnlineCombatCheckpoint(inputState) {
  const state = clone(inputState);
  if (!state.onlineCombat || state.onlineCombat.stage !== OnlineCombatStage.COMBAT_END) return syncPriorityMetadata(state);
  state.pendingAction = undefined;
  state.pendingResponse = null;
  state.priorityStack = undefined;
  state.onlineCombat.stage = OnlineCombatStage.COMPLETE;
  return syncPriorityMetadata(state, { mode: PriorityMode.ACTION, owner: state.active, window: null });
}
