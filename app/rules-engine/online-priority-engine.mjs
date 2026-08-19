import { executeCommand as executeRulesCommand } from "./engine.mjs";
import { combatIdleView, listLegalBlockers } from "./combat.mjs";
import { RulesViolation } from "./effects.mjs";
import { legalPriorityResponses } from "./priority.mjs";
import {
  OnlineFinalizationStage,
  completeOnlineFinalization,
  enterOnlineFinalization,
  resumeOnlineFinalizationAfterDecision,
} from "./online-finalization.mjs";
import {
  PriorityMode,
  PriorityWindow,
  handOffFirstPass,
  inferPriorityWindow,
  openResponseWindow,
  phaseTransitionWindow,
  syncPriorityMetadata,
} from "./priority-state.mjs";

const clone = (value) => structuredClone(value);
const SINGLE_COMBAT_START = "single-combat-start";
const LEGACY_GROUPED_CHECKPOINTS = new Set(["combat-start", "after-attackers", "after-blockers", "combat-end"]);

const responseIdentity = (command) => {
  if (command.type === "playCard") return `playCard:${command.cardId ?? command.handIndex ?? ""}`;
  if (command.type === "activateHero") return `activateHero:${command.abilityId ?? ""}`;
  return `${command.type}:${command.sourceId ?? ""}:${command.abilityId ?? ""}`;
};
const legalResponseIdentity = responseIdentity;

function validateOnlineResponse(state, command) {
  const pending = state.pendingResponse;
  if (!pending || pending.responder !== command.owner) throw new RulesViolation("not-your-priority");
  const wanted = responseIdentity(command);
  if (!legalPriorityResponses(state, command.owner).some((candidate) => legalResponseIdentity(candidate) === wanted)) throw new RulesViolation("illegal-priority-response");
}

function validateSingleBlockerChoice(state, command) {
  if (command.type !== "selectDefender") return;
  const combat = state.combatAction;
  if (!combat || combat.stage !== "choosing" || 1 - combat.attackerOwner !== command.owner) return;
  if (command.attackerId != null && command.attackerId !== combat.attackerUid) throw new RulesViolation("combat-state-mismatch");
  if (command.targetHero) return;
  const defenderId = command.defenderId;
  const legal = listLegalBlockers(state, command.owner, combat.attackerUid).some((unit) => (unit.uid || unit.id) === defenderId);
  if (!legal) throw new RulesViolation("invalid-defender");
}

function phaseAdvanceLabel(phase) {
  if (phase === "principal") return "encerrar etapa Principal";
  if (phase === "combate") return "encerrar etapa de Combate";
  if (phase === "fim") return "encerrar turno";
  return "avançar etapa";
}

function canOpenPhaseTransition(state, command) {
  if (command.type !== "advancePhase") return false;
  if (command.owner !== state.active) throw new RulesViolation("not-your-turn");
  if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) throw new RulesViolation("interaction-pending");
  return state.phase === "principal" || state.phase === "combate";
}

function openPhaseTransition(state, command) {
  /* The engine preflight is the single authority for Indomável and every other
     reason combat may not legally end. */
  executeRulesCommand(clone(state), { ...command, skipPriority: true }, { priority: false });
  const next = clone(state);
  const window = phaseTransitionWindow(state.phase);
  openResponseWindow(next, {
    actor: command.owner,
    responder: 1 - command.owner,
    action: phaseAdvanceLabel(state.phase),
    window,
    pendingAction: { ...command, skipPriority: true, __onlinePhaseTransition: true },
  });
  return { state: next, trace: ["online-priority:phase-transition-open"], steps: 0 };
}

function openCombatStartWindow(inputState) {
  const state = clone(inputState);
  openResponseWindow(state, {
    actor: state.active,
    responder: state.active,
    action: "início da etapa de Combate",
    window: PriorityWindow.COMBAT_START,
    pendingAction: { type: "onlineCheckpoint", checkpoint: SINGLE_COMBAT_START, owner: state.active },
  });
  return syncPriorityMetadata(state, { window: PriorityWindow.COMBAT_START });
}

function checkpointAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.pendingAction?.type === "onlineCheckpoint"
    ? state.pendingAction.checkpoint
    : null;
}
function combatTransitionAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.phase === "combate" && state.pendingAction?.type === "advancePhase" && state.pendingAction?.__onlinePhaseTransition;
}
function mainTransitionAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.phase === "principal" && state.pendingAction?.type === "advancePhase" && state.pendingAction?.__onlinePhaseTransition;
}

function finishSingleCombatStart(state) {
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  delete next.onlineCombat;
  return syncPriorityMetadata(next, { mode: PriorityMode.ACTION, owner: next.active, window: null });
}

function resolveOnlineCheckpoint(state) {
  const checkpoint = checkpointAtRoot(state);
  if (!checkpoint) throw new RulesViolation("online-checkpoint-missing");
  let next;
  if (checkpoint === SINGLE_COMBAT_START) next = finishSingleCombatStart(state);
  else if (checkpoint === OnlineFinalizationStage.PRIORITY) next = completeOnlineFinalization(state);
  else if (LEGACY_GROUPED_CHECKPOINTS.has(checkpoint)) next = finishSingleCombatStart(state);
  else throw new RulesViolation("unknown-online-checkpoint");
  return { state: next, trace: [`online-priority:checkpoint:${checkpoint}`], steps: 0 };
}

function interactiveDecisionHolder(state) {
  return state?.pendingDecision || state?.pendingReposition || null;
}

function suspendPriorityWhileChoosing(state) {
  const holder = interactiveDecisionHolder(state);
  if (!holder || !state.pendingResponse) return state;
  holder.onlinePriorityResume = {
    pendingResponse: clone(state.pendingResponse),
    pendingAction: state.pendingAction ? clone(state.pendingAction) : undefined,
    priorityStack: state.priorityStack ? clone(state.priorityStack) : undefined,
  };
  state.pendingResponse = null;
  state.pendingAction = undefined;
  state.priorityStack = undefined;
  return state;
}

function resumePriorityAfterChoice(before, state) {
  const resume = interactiveDecisionHolder(before)?.onlinePriorityResume;
  if (!resume) return state;
  const nextHolder = interactiveDecisionHolder(state);
  if (nextHolder) {
    nextHolder.onlinePriorityResume ||= clone(resume);
    return state;
  }
  if (!state.pendingResponse) state.pendingResponse = clone(resume.pendingResponse);
  if (!state.pendingAction && resume.pendingAction) state.pendingAction = clone(resume.pendingAction);
  if (!state.priorityStack && resume.priorityStack) state.priorityStack = clone(resume.priorityStack);
  return state;
}

function normalizeAfterResolution(before, result, command) {
  const state = result.state;
  const wasNestedStack = command.type === "passPriority" && Number(before.pendingResponse?.passes || 0) > 0 && (before.priorityStack?.length || 0) > 1;
  if (wasNestedStack && state.pendingResponse && !state.pendingDecision && !state.pendingReposition) state.pendingResponse = { ...state.pendingResponse, responder: state.active, passes: 0 };
  suspendPriorityWhileChoosing(state);
  return syncPriorityMetadata(state, { window: inferPriorityWindow(state) });
}

export function executeOnlineCommand(inputState, rawCommand, options = {}) {
  const state = syncPriorityMetadata(clone(inputState));
  const command = { ...rawCommand };
  if (!Number.isInteger(command.owner) || ![0, 1].includes(command.owner)) throw new RulesViolation("invalid-owner");

  if (state.pendingResponse) {
    if (command.type === "passPriority") {
      if (state.pendingResponse.responder !== command.owner) throw new RulesViolation("not-your-priority");
      if (Number(state.pendingResponse.passes || 0) === 0) {
        const passed = handOffFirstPass(state, command.owner);
        return { state: passed, trace: ["online-priority:first-pass"], steps: 0 };
      }
      if (checkpointAtRoot(state)) return resolveOnlineCheckpoint(state);
      if (combatTransitionAtRoot(state)) {
        const next = enterOnlineFinalization(state, state.active);
        return { state: next, trace: ["online-finalization:entered-after-combat-passes"], steps: 0 };
      }
      if (mainTransitionAtRoot(state)) {
        const resolved = executeRulesCommand(state, command, { ...options, priority: true });
        normalizeAfterResolution(state, resolved, command);
        if (resolved.state.phase === "combate" && !resolved.state.pendingDecision && !resolved.state.pendingReposition) {
          resolved.state = openCombatStartWindow(resolved.state);
          resolved.trace = [...(resolved.trace || []), "online-combat:single-combat-start-open"];
        }
        return resolved;
      }
      const result = executeRulesCommand(state, command, { ...options, priority: true });
      normalizeAfterResolution(state, result, command);
      result.trace = [...(result.trace || []), "online-priority:resolve-after-two-passes"];
      return result;
    }

    validateOnlineResponse(state, command);
    const result = executeRulesCommand(state, { ...command, hasPriority: true }, { ...options, priority: true });
    syncPriorityMetadata(result.state, { window: inferPriorityWindow(state) });
    result.trace = [...(result.trace || []), "online-priority:response-added"];
    return result;
  }

  if (command.type === "passPriority") throw new RulesViolation("no-priority-window");
  if (command.type === "declareAttackers" || command.type === "declareBlockers") throw new RulesViolation("grouped-combat-removed");

  /* Retired grouped-combat metadata from recovered rooms never owns legality. */
  if (state.onlineCombat && !state.pendingDecision && !state.pendingReposition && !state.combatAction) delete state.onlineCombat;

  validateSingleBlockerChoice(state, command);
  if (canOpenPhaseTransition(state, command)) return openPhaseTransition(state, command);

  const result = executeRulesCommand(state, command, { ...options, priority: true });
  resumePriorityAfterChoice(state, result.state);
  if (command.type === "resolveDecision" && result.state.onlineFinalization?.stage === OnlineFinalizationStage.EFFECTS && !result.state.pendingDecision && !result.state.pendingReposition) {
    result.state = resumeOnlineFinalizationAfterDecision(result.state);
    result.trace = [...(result.trace || []), "online-finalization:resume-after-decision"];
  }
  if (result.state.phase === "manutencao" && result.state.onlineFinalization) result.state.onlineFinalization = undefined;
  syncPriorityMetadata(result.state, {
    window: result.state.pendingResponse
      ? command.type === "declareAttack"
        ? PriorityWindow.AFTER_ATTACKERS
        : command.type === "activate" || command.type === "activateHero"
          ? PriorityWindow.ACTIVATED_ABILITY
          : inferPriorityWindow(result.state)
      : null,
  });
  return result;
}

export function onlinePriorityView(state) {
  const snapshot = syncPriorityMetadata(clone(state));
  return {
    ...snapshot.priority,
    stack: snapshot.stack,
    combat: snapshot.combatAction ? clone(snapshot.combatAction) : null,
    combatIdle: snapshot.phase === "combate" && !snapshot.combatAction && !snapshot.pendingResponse ? combatIdleView(snapshot, snapshot.active) : null,
    finalization: snapshot.onlineFinalization ? clone(snapshot.onlineFinalization) : null,
  };
}
