import { executeCommand as executeRulesCommand } from "./engine.mjs";
import { RulesViolation } from "./effects.mjs";
import { PriorityMode, PriorityWindow, openResponseWindow, syncPriorityMetadata } from "./priority-state.mjs";

const clone = (value) => structuredClone(value);

export const OnlineFinalizationStage = Object.freeze({
  EFFECTS: "finalization-effects",
  PRIORITY: "finalization-priority",
  COMPLETE: "finalization-complete",
});

function bankRemainingEnergy(state, owner) {
  const entry = state.players?.[owner];
  if (!entry) throw new RulesViolation("invalid-owner");
  const remaining = Math.max(0, Number(entry.energy) || 0);
  if (!entry.noReserveStorageThisTurn) entry.reserve = Math.min(3, Math.max(0, Number(entry.reserve) || 0) + remaining);
  entry.energy = 0;
}

function openFinalizationPriority(state) {
  const owner = state.onlineFinalization?.owner ?? state.active;
  state.onlineFinalization = { owner, stage: OnlineFinalizationStage.PRIORITY };
  openResponseWindow(state, {
    actor: owner,
    responder: owner,
    action: "efeitos de fim de turno",
    window: PriorityWindow.FINALIZATION,
    pendingAction: { type: "onlineCheckpoint", checkpoint: OnlineFinalizationStage.PRIORITY, owner },
  });
  return syncPriorityMetadata(state, { window: PriorityWindow.FINALIZATION });
}

/**
 * Enter Finalization in the order required by the manual:
 * 1) bank remaining Energy into Reserve (max 3),
 * 2) enter the engine Finalization phase and resolve its existing end-turn
 *    trigger machinery,
 * 3) expose the explicit Online response checkpoint before cleanup/turn pass.
 */
export function enterOnlineFinalization(inputState, owner = inputState.active) {
  if (inputState.phase !== "combate" || inputState.active !== owner) throw new RulesViolation("wrong-finalization-priority");
  const prepared = clone(inputState);
  prepared.pendingAction = undefined;
  prepared.pendingResponse = null;
  prepared.priorityStack = undefined;
  bankRemainingEnergy(prepared, owner);
  prepared.onlineFinalization = { owner, stage: OnlineFinalizationStage.EFFECTS };

  const result = executeRulesCommand(prepared, { type: "advancePhase", owner, skipPriority: true }, { priority: false });
  const state = result.state;
  state.onlineCombat = undefined;
  state.onlineFinalization = { owner, stage: OnlineFinalizationStage.EFFECTS };
  if (state.phase !== "fim") throw new RulesViolation("finalization-transition-failed");
  if (state.pendingDecision || state.pendingReposition) return syncPriorityMetadata(state, { mode: PriorityMode.RESOLVING, owner: null, window: null });
  return openFinalizationPriority(state);
}

export function resumeOnlineFinalizationAfterDecision(inputState) {
  const state = clone(inputState);
  if (state.onlineFinalization?.stage !== OnlineFinalizationStage.EFFECTS || state.phase !== "fim") return syncPriorityMetadata(state);
  if (state.pendingDecision || state.pendingReposition) return syncPriorityMetadata(state, { mode: PriorityMode.RESOLVING, owner: null, window: null });
  return openFinalizationPriority(state);
}

/** Finish the response checkpoint and let the existing engine perform cleanup,
 * hand-limit handling and the authoritative handoff to the next Maintenance. */
export function completeOnlineFinalization(inputState) {
  const state = clone(inputState);
  const finalization = state.onlineFinalization;
  if (!finalization || finalization.stage !== OnlineFinalizationStage.PRIORITY || state.phase !== "fim") throw new RulesViolation("finalization-checkpoint-mismatch");
  state.pendingAction = undefined;
  state.pendingResponse = null;
  state.priorityStack = undefined;
  finalization.stage = OnlineFinalizationStage.COMPLETE;
  const result = executeRulesCommand(state, { type: "advancePhase", owner: finalization.owner, skipPriority: true }, { priority: false });
  if (result.state.phase === "manutencao") result.state.onlineFinalization = undefined;
  return syncPriorityMetadata(result.state, {
    mode: result.state.pendingDecision || result.state.pendingReposition ? PriorityMode.RESOLVING : PriorityMode.ACTION,
    owner: result.state.pendingDecision?.owner ?? result.state.pendingReposition?.activeOwner ?? result.state.active,
    window: null,
  });
}
