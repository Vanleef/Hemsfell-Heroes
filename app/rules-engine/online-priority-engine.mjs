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
  assertOnlinePriorityInvariant,
  handOffFirstPass,
  inferPriorityWindow,
  openResponseWindow,
  syncPriorityMetadata,
} from "./priority-state.mjs";

const clone = (value) => structuredClone(value);
const MAIN_END_CANCELLED = "main-end-cancelled";
const LEGACY_GROUPED_CHECKPOINTS = new Set(["combat-start", "after-attackers", "after-blockers", "combat-end", "single-combat-start"]);

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
  if (!combat || combat.stage !== "choosing" || 1 - combat.attackerOwner !== command.owner) throw new RulesViolation("defender-choice-unavailable");
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

function ensureIdlePhaseAdvance(state, command) {
  if (command.owner !== state.active) throw new RulesViolation("not-your-turn");
  if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) throw new RulesViolation("interaction-pending");
}

function openMainEndTransition(state, command) {
  ensureIdlePhaseAdvance(state, command);
  /* Preflight against the authoritative engine before opening a response root.
     No invalid phase transition is ever allowed to become an immortal window. */
  executeRulesCommand(clone(state), { ...command, skipPriority: true }, { priority: false });
  const next = clone(state);
  openResponseWindow(next, {
    actor: command.owner,
    responder: 1 - command.owner,
    action: phaseAdvanceLabel(state.phase),
    window: PriorityWindow.MAIN_END,
    pendingAction: { ...command, skipPriority: true, __onlinePhaseTransition: "main-end" },
  });
  return { state: assertOnlinePriorityInvariant(next), trace: ["online-v3:main-end-open"], steps: 0 };
}

function enterFinalizationFromCombat(state, command) {
  ensureIdlePhaseAdvance(state, command);
  /* This preflight is the source of truth for Indomável and every other reason
     Combat cannot end. There is no redundant empty combat-end response window:
     EOT gets its own explicit response checkpoint in online-finalization. */
  executeRulesCommand(clone(state), { ...command, skipPriority: true }, { priority: false });
  const next = enterOnlineFinalization(state, command.owner);
  return { state: assertOnlinePriorityInvariant(next), trace: ["online-v3:combat-end", "online-finalization:entered"], steps: 0 };
}

function checkpointAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.pendingAction?.type === "onlineCheckpoint"
    ? state.pendingAction.checkpoint
    : null;
}
function mainTransitionAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.phase === "principal" && state.pendingAction?.type === "advancePhase" && state.pendingAction?.__onlinePhaseTransition === "main-end";
}
function combatResolutionAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.phase === "combate" && state.pendingAction?.type === "attack" && state.pendingAction?.__onlineCombatResolution === true;
}

function finishCancelledMainEnd(state) {
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  return assertOnlinePriorityInvariant(syncPriorityMetadata(next, { mode: PriorityMode.ACTION, owner: next.active, window: null }));
}

function finishLegacyCheckpoint(state) {
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  delete next.onlineCombat;
  return assertOnlinePriorityInvariant(syncPriorityMetadata(next, { mode: PriorityMode.ACTION, owner: next.active, window: null }));
}

function resolveOnlineCheckpoint(state) {
  const checkpoint = checkpointAtRoot(state);
  if (!checkpoint) throw new RulesViolation("online-checkpoint-missing");
  let next;
  if (checkpoint === MAIN_END_CANCELLED) next = finishCancelledMainEnd(state);
  else if (checkpoint === OnlineFinalizationStage.PRIORITY) next = completeOnlineFinalization(state);
  else if (LEGACY_GROUPED_CHECKPOINTS.has(checkpoint)) next = finishLegacyCheckpoint(state);
  else throw new RulesViolation("unknown-online-checkpoint");
  return { state: assertOnlinePriorityInvariant(syncPriorityMetadata(next)), trace: [`online-priority:checkpoint:${checkpoint}`], steps: 0 };
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

function validateDecisionPriority(state, command) {
  const decision = state?.pendingDecision;
  if (!decision) return;
  if (decision.kind === "image-placement") {
    if (command.type !== "resolveDecision") throw new RulesViolation("image-placement-priority");
    if (Number(decision.owner) !== Number(command.owner)) throw new RulesViolation("decision-not-owned");
  }
}

function normalizeAfterResolution(before, result, command) {
  const state = result.state;
  const wasNestedStack = command.type === "passPriority" && Number(before.pendingResponse?.passes || 0) > 0 && (before.priorityStack?.length || 0) > 1;
  if (wasNestedStack && state.pendingResponse && !state.pendingDecision && !state.pendingReposition) state.pendingResponse = { ...state.pendingResponse, responder: state.active, passes: 0 };
  suspendPriorityWhileChoosing(state);
  return assertOnlinePriorityInvariant(syncPriorityMetadata(state, { window: state.pendingResponse ? inferPriorityWindow(state) : null }));
}

/** Once the opponent answers a request to end Main, that request is consumed.
 * The response chain still resolves normally, but its root becomes a no-op
 * checkpoint so the active player returns to Main and must ask to end it again. */
function cancelMainEndRootOnResponse(inputState) {
  if (!mainTransitionAtRoot(inputState)) return inputState;
  const state = clone(inputState);
  state.pendingAction = {
    type: "onlineCheckpoint",
    checkpoint: MAIN_END_CANCELLED,
    owner: state.active,
    __onlineWindow: PriorityWindow.MAIN_END,
  };
  return state;
}

function normalizeDeclaredAttack(result) {
  const state = result.state;
  const combat = state.combatAction;
  if (!combat || combat.stage !== "priority") throw new RulesViolation("combat-declaration-failed");
  /* The base engine's historical attack-declaration window is intentionally
     removed in Online v3. Declaration freezes one attacker and immediately
     gives the defender the exclusive blocker decision. */
  state.pendingResponse = null;
  state.pendingAction = undefined;
  state.priorityStack = undefined;
  state.combatAction = { ...combat, stage: "choosing" };
  syncPriorityMetadata(state, { mode: PriorityMode.BLOCKER, owner: 1 - combat.attackerOwner, window: null });
  assertOnlinePriorityInvariant(state);
  return result;
}

function openPostBlockResponse(result) {
  const state = result.state;
  const combat = state.combatAction;
  if (!combat || combat.stage !== "charging") throw new RulesViolation("combat-blocker-commit-failed");
  delete combat.deadline;
  const attackCommand = {
    type: "attack",
    owner: combat.attackerOwner,
    attackerId: combat.attackerUid,
    ...(combat.targetHero ? {} : { defenderId: combat.defenderUid }),
    skipPriority: true,
    __onlineCombatResolution: true,
  };
  /* Blocking is the defender's committed action. Priority then hands to the
     attacker first; a pass hands it back to the defender. Two consecutive
     passes resolve exactly this one combat instance. */
  openResponseWindow(state, {
    actor: 1 - combat.attackerOwner,
    responder: combat.attackerOwner,
    action: `resolução do ataque de ${combat.attackerCard?.name || combat.attackerUid}`,
    window: PriorityWindow.AFTER_BLOCKERS,
    pendingAction: attackCommand,
  });
  assertOnlinePriorityInvariant(state);
  return result;
}

function resolveCombatRoot(state) {
  const attack = clone(state.pendingAction);
  const combat = clone(state.combatAction);
  const prepared = clone(state);
  prepared.pendingAction = undefined;
  prepared.pendingResponse = null;
  prepared.priorityStack = undefined;

  const attacker = prepared.players?.[attack.owner]?.board?.find((unit) => (unit.uid || unit.id) === attack.attackerId);
  if (!attacker) {
    prepared.combatAction = null;
    return {
      state: assertOnlinePriorityInvariant(syncPriorityMetadata(prepared, { mode: PriorityMode.ACTION, owner: prepared.active, window: null })),
      trace: ["online-v3:combat-cancelled-attacker-left-field"],
      steps: 0,
    };
  }

  try {
    const resolved = executeRulesCommand(prepared, attack, { priority: false });
    resolved.state.pendingAction = undefined;
    resolved.state.pendingResponse = null;
    resolved.state.priorityStack = undefined;
    syncPriorityMetadata(resolved.state, { mode: PriorityMode.ACTION, owner: resolved.state.active, window: null });
    assertOnlinePriorityInvariant(resolved.state);
    resolved.trace = [...(resolved.trace || []), "online-v3:combat-resolved"];
    return resolved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["invalid-attacker", "attack-requirement-not-met"].includes(message)) {
      prepared.combatAction = null;
      return {
        state: assertOnlinePriorityInvariant(syncPriorityMetadata(prepared, { mode: PriorityMode.ACTION, owner: prepared.active, window: null })),
        trace: [`online-v3:combat-cancelled:${message}`],
        steps: 0,
      };
    }
    /* If a response made the chosen blocker illegal, resolve the same attack as
       unblocked instead of leaving the serialized room in a charging deadlock. */
    if (attack.defenderId && ["invalid-defender", "unblockable-attacker", "flying-blocker-required"].includes(message)) {
      const retryState = clone(prepared);
      retryState.combatAction = combat ? { ...combat, targetHero: true, defenderUid: undefined, defenderCard: undefined, stage: "charging" } : null;
      const resolved = executeRulesCommand(retryState, { ...attack, defenderId: undefined }, { priority: false });
      syncPriorityMetadata(resolved.state, { mode: PriorityMode.ACTION, owner: resolved.state.active, window: null });
      assertOnlinePriorityInvariant(resolved.state);
      resolved.trace = [...(resolved.trace || []), `online-v3:block-invalidated:${message}`, "online-v3:combat-resolved"];
      return resolved;
    }
    throw error;
  }
}

export function executeOnlineCommand(inputState, rawCommand, options = {}) {
  const state = syncPriorityMetadata(clone(inputState));
  suspendPriorityWhileChoosing(state);
  syncPriorityMetadata(state, { window: state.pendingResponse ? inferPriorityWindow(state) : null });
  const command = { ...rawCommand };
  if (!Number.isInteger(command.owner) || ![0, 1].includes(command.owner)) throw new RulesViolation("invalid-owner");
  validateDecisionPriority(state, command);

  if (state.pendingResponse) {
    if (command.type === "passPriority") {
      if (state.pendingResponse.responder !== command.owner) throw new RulesViolation("not-your-priority");
      if (Number(state.pendingResponse.passes || 0) === 0) {
        const passed = handOffFirstPass(state, command.owner);
        assertOnlinePriorityInvariant(passed);
        return { state: passed, trace: ["online-priority:first-pass"], steps: 0 };
      }
      if (checkpointAtRoot(state)) return resolveOnlineCheckpoint(state);
      if (combatResolutionAtRoot(state)) return resolveCombatRoot(state);
      if (mainTransitionAtRoot(state)) {
        const resolved = executeRulesCommand(state, command, { ...options, priority: true });
        normalizeAfterResolution(state, resolved, command);
        /* A clean two-pass Main-end request enters unitary COMBAT_IDLE directly.
           There is no empty combat-start response window in Online v3. */
        syncPriorityMetadata(resolved.state, { mode: PriorityMode.ACTION, owner: resolved.state.active, window: null });
        assertOnlinePriorityInvariant(resolved.state);
        resolved.trace = [...(resolved.trace || []), "online-v3:main-end-resolved"];
        return resolved;
      }
      const result = executeRulesCommand(state, command, { ...options, priority: true });
      normalizeAfterResolution(state, result, command);
      result.trace = [...(result.trace || []), "online-priority:resolve-after-two-passes"];
      return result;
    }

    validateOnlineResponse(state, command);
    const responseState = cancelMainEndRootOnResponse(state);
    const result = executeRulesCommand(responseState, { ...command, hasPriority: true }, { ...options, priority: true });
    syncPriorityMetadata(result.state, { window: inferPriorityWindow(responseState) });
    assertOnlinePriorityInvariant(result.state);
    result.trace = [...(result.trace || []), mainTransitionAtRoot(state) ? "online-v3:main-end-cancelled-by-response" : "online-priority:response-added"];
    return result;
  }

  if (command.type === "passPriority") throw new RulesViolation("no-priority-window");
  if (command.type === "declareAttackers" || command.type === "declareBlockers") throw new RulesViolation("grouped-combat-removed");
  if (command.type === "attack") throw new RulesViolation("server-resolves-combat");

  /* Retired grouped-combat metadata from recovered rooms never owns legality. */
  if (state.onlineCombat && !state.pendingDecision && !state.pendingReposition && !state.combatAction) delete state.onlineCombat;

  validateSingleBlockerChoice(state, command);
  if (command.type === "advancePhase" && state.phase === "principal") return openMainEndTransition(state, command);
  if (command.type === "advancePhase" && state.phase === "combate") return enterFinalizationFromCombat(state, command);

  const result = executeRulesCommand(state, command, { ...options, priority: true });
  if (command.type === "declareAttack") normalizeDeclaredAttack(result);
  else if (command.type === "selectDefender") openPostBlockResponse(result);
  else {
    resumePriorityAfterChoice(state, result.state);
    if (command.type === "resolveDecision" && result.state.onlineFinalization?.stage === OnlineFinalizationStage.EFFECTS && !result.state.pendingDecision && !result.state.pendingReposition) {
      result.state = resumeOnlineFinalizationAfterDecision(result.state);
      result.trace = [...(result.trace || []), "online-finalization:resume-after-decision"];
    }
    if (result.state.phase === "manutencao" && result.state.onlineFinalization) result.state.onlineFinalization = undefined;
    syncPriorityMetadata(result.state, {
      window: result.state.pendingResponse
        ? command.type === "activate" || command.type === "activateHero"
          ? PriorityWindow.ACTIVATED_ABILITY
          : inferPriorityWindow(result.state)
        : null,
    });
    assertOnlinePriorityInvariant(result.state);
  }
  return result;
}

export function onlinePriorityView(state) {
  const snapshot = syncPriorityMetadata(clone(state));
  assertOnlinePriorityInvariant(snapshot);
  return {
    ...snapshot.priority,
    stack: snapshot.stack,
    combat: snapshot.combatAction ? clone(snapshot.combatAction) : null,
    combatIdle: snapshot.phase === "combate" && !snapshot.combatAction && !snapshot.pendingResponse ? combatIdleView(snapshot, snapshot.active) : null,
    finalization: snapshot.onlineFinalization ? clone(snapshot.onlineFinalization) : null,
  };
}
