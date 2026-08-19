import { executeCommand as executeRulesCommand } from "./engine.mjs";
import { RulesViolation } from "./effects.mjs";
import { legalPriorityResponses } from "./priority.mjs";
import {
  OnlineCombatStage,
  beginOnlineCombat,
  declareOnlineAttackers,
  declareOnlineBlockers,
  finishAfterAttackersCheckpoint,
  finishAfterBlockersCheckpoint,
  finishCombatStartCheckpoint,
} from "./online-combat.mjs";
import { completeOnlineCombatCheckpoint, continueOnlineCombatResolution } from "./online-combat-resolution.mjs";
import {
  OnlineFinalizationStage,
  completeOnlineFinalization,
  enterOnlineFinalization,
  resumeOnlineFinalizationAfterDecision,
} from "./online-finalization.mjs";
import {
  PriorityWindow,
  handOffFirstPass,
  inferPriorityWindow,
  openResponseWindow,
  phaseTransitionWindow,
  syncPriorityMetadata,
} from "./priority-state.mjs";

const clone = (value) => structuredClone(value);

const responseIdentity = (command) => {
  if (command.type === "playCard") return `playCard:${command.cardId ?? command.handIndex ?? ""}`;
  if (command.type === "activateHero") return `activateHero:${command.abilityId ?? ""}`;
  return `${command.type}:${command.sourceId ?? ""}:${command.abilityId ?? ""}`;
};

const legalResponseIdentity = (command) => {
  if (command.type === "playCard") return `playCard:${command.cardId ?? command.handIndex ?? ""}`;
  if (command.type === "activateHero") return `activateHero:${command.abilityId ?? ""}`;
  return `${command.type}:${command.sourceId ?? ""}:${command.abilityId ?? ""}`;
};

function validateOnlineResponse(state, command) {
  const pending = state.pendingResponse;
  if (!pending || pending.responder !== command.owner) throw new RulesViolation("not-your-priority");
  const legal = legalPriorityResponses(state, command.owner);
  const wanted = responseIdentity(command);
  if (!legal.some((candidate) => legalResponseIdentity(candidate) === wanted)) throw new RulesViolation("illegal-priority-response");
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
  if (state.phase === "combate" && state.onlineCombat) {
    if (state.onlineCombat.stage === OnlineCombatStage.COMPLETE) return false;
    throw new RulesViolation("grouped-combat-in-progress");
  }
  return state.phase === "principal" || state.phase === "combate";
}

function openPhaseTransition(state, command) {
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

function checkpointAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.pendingAction?.type === "onlineCheckpoint"
    ? state.pendingAction.checkpoint
    : null;
}

function combatTransitionAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1
    && state.phase === "combate"
    && state.pendingAction?.type === "advancePhase"
    && state.pendingAction?.__onlinePhaseTransition;
}

function mainTransitionAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1
    && state.phase === "principal"
    && state.pendingAction?.type === "advancePhase"
    && state.pendingAction?.__onlinePhaseTransition;
}

function resolveOnlineCheckpoint(state) {
  const checkpoint = checkpointAtRoot(state);
  if (!checkpoint) throw new RulesViolation("online-checkpoint-missing");
  let next;
  if (checkpoint === OnlineCombatStage.COMBAT_START) next = finishCombatStartCheckpoint(state);
  else if (checkpoint === OnlineCombatStage.AFTER_ATTACKERS) {
    next = finishAfterAttackersCheckpoint(state);
    if (next.onlineCombat?.stage === OnlineCombatStage.COMBAT_END) {
      next.onlineCombat.stage = OnlineCombatStage.RESOLVING;
      next = continueOnlineCombatResolution(next);
    }
  } else if (checkpoint === OnlineCombatStage.AFTER_BLOCKERS) {
    next = finishAfterBlockersCheckpoint(state);
    next = continueOnlineCombatResolution(next);
  } else if (checkpoint === OnlineCombatStage.COMBAT_END) {
    next = completeOnlineCombatCheckpoint(state);
    next = enterOnlineFinalization(next, next.active);
  } else if (checkpoint === OnlineFinalizationStage.PRIORITY) next = completeOnlineFinalization(state);
  else throw new RulesViolation("unknown-online-checkpoint");
  return { state: next, trace: [`online-priority:checkpoint:${checkpoint}`], steps: 0 };
}

function normalizeAfterResolution(before, result, command) {
  const state = result.state;
  const wasNestedStack = command.type === "passPriority" && Number(before.pendingResponse?.passes || 0) > 0 && (before.priorityStack?.length || 0) > 1;
  if (wasNestedStack && state.pendingResponse && !state.pendingDecision) state.pendingResponse = { ...state.pendingResponse, responder: state.active, passes: 0 };
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
          resolved.state = beginOnlineCombat(resolved.state);
          resolved.trace = [...(resolved.trace || []), "online-combat:combat-start-open"];
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

  if (command.type === "declareAttackers") {
    const next = declareOnlineAttackers(state, command.owner, command.attackerIds || []);
    return { state: next, trace: ["online-combat:attackers-declared"], steps: 0 };
  }

  if (command.type === "declareBlockers") {
    const next = declareOnlineBlockers(state, command.owner, command.assignments || []);
    return { state: next, trace: ["online-combat:blockers-declared"], steps: 0 };
  }

  if (command.type === "advancePhase" && state.phase === "combate" && state.onlineCombat?.stage === OnlineCombatStage.COMPLETE) {
    const next = enterOnlineFinalization(state, command.owner);
    return { state: next, trace: ["online-finalization:entered-after-grouped-combat"], steps: 0 };
  }

  if (canOpenPhaseTransition(state, command)) return openPhaseTransition(state, command);

  if (command.type === "declareAttack" && state.onlineCombat?.stage === OnlineCombatStage.DECLARE_ATTACKERS) throw new RulesViolation("grouped-attack-declaration-required");
  const result = executeRulesCommand(state, command, { ...options, priority: true });
  if (command.type === "resolveDecision" && result.state.onlineCombat?.stage === OnlineCombatStage.RESOLVING && !result.state.pendingDecision && !result.state.pendingReposition) {
    result.state = continueOnlineCombatResolution(result.state);
    result.trace = [...(result.trace || []), "online-combat:resume-after-decision"];
  }
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
    combat: snapshot.onlineCombat ? clone(snapshot.onlineCombat) : null,
    finalization: snapshot.onlineFinalization ? clone(snapshot.onlineFinalization) : null,
  };
}
