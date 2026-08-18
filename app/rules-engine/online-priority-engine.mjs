import { executeCommand as executeRulesCommand } from "./engine.mjs";
import { RulesViolation } from "./effects.mjs";
import { legalPriorityResponses } from "./priority.mjs";
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
  return state.phase === "principal" || state.phase === "combate";
}

function openPhaseTransition(state, command) {
  /* Run the authoritative transition on a discarded clone as a preflight. This
     preserves every existing legality check (notably Indomável) without
     changing the live state before the opponent has received priority. */
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

function normalizeAfterResolution(before, result, command) {
  const state = result.state;
  const wasNestedStack = command.type === "passPriority" && Number(before.pendingResponse?.passes || 0) > 0 && (before.priorityStack?.length || 0) > 1;
  if (wasNestedStack && state.pendingResponse && !state.pendingDecision) {
    /* Two passes resolve one stack item. A new response cycle then starts with
       the active player, regardless of who controlled the newly exposed item. */
    state.pendingResponse = { ...state.pendingResponse, responder: state.active, passes: 0 };
  }
  return syncPriorityMetadata(state, { window: inferPriorityWindow(state) });
}

/**
 * Server-oriented command entry point for Online mode.
 *
 * The legacy engine remains the deterministic rules resolver. This wrapper owns
 * only Online timing semantics: one priority owner, explicit phase-transition
 * windows, legal Acelerado/hero responses, consecutive passes and fresh
 * priority after resolving one stack item.
 */
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

  if (canOpenPhaseTransition(state, command)) return openPhaseTransition(state, command);

  const result = executeRulesCommand(state, command, { ...options, priority: true });
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
  };
}
