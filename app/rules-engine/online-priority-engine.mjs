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
  syncPriorityMetadata,
} from "./priority-state.mjs";

const clone = (value) => structuredClone(value);
const SINGLE_COMBAT_START = "single-combat-start";
const SINGLE_ATTACK_RESOLUTION = "single-attack-resolution";
const MAIN_END_REQUEST = "main-end-request";
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

function interactionClear(state) {
  return !state.pendingResponse && !state.pendingAction && !state.pendingDecision && !state.pendingReposition && !state.combatAction;
}

function canRequestMainEnd(state, command) {
  if (command.type !== "advancePhase" || state.phase !== "principal") return false;
  if (command.owner !== state.active) throw new RulesViolation("not-your-turn");
  if (!interactionClear(state)) throw new RulesViolation("interaction-pending");
  return true;
}

function openMainEndRequest(state, command) {
  /* Preflight against the authoritative engine before offering the opponent a
     final response. The phase itself is not committed yet. */
  executeRulesCommand(clone(state), { ...command, skipPriority: true }, { priority: false });
  const next = clone(state);
  openResponseWindow(next, {
    actor: command.owner,
    responder: 1 - command.owner,
    action: phaseAdvanceLabel(state.phase),
    window: PriorityWindow.MAIN_END,
    pendingAction: {
      type: "onlineCheckpoint",
      checkpoint: MAIN_END_REQUEST,
      owner: command.owner,
      __onlineMainEndRequest: true,
    },
  });
  /* Declaring End Main is the active player's first pass on an empty stack.
     Therefore a single pass by the opponent accepts the transition. */
  next.pendingResponse = { ...next.pendingResponse, passes: 1 };
  return { state: syncPriorityMetadata(next, { window: PriorityWindow.MAIN_END }), trace: ["online-priority:main-end-request-open"], steps: 0 };
}

function isMainEndRoot(command) {
  return command?.type === "onlineCheckpoint" && command?.checkpoint === MAIN_END_REQUEST;
}

function markMainEndInterrupted(state) {
  if (isMainEndRoot(state.pendingAction)) state.pendingAction.__onlineInterrupted = true;
  const root = state.priorityStack?.[0];
  if (root?.kind === "command" && isMainEndRoot(root.command)) root.command.__onlineInterrupted = true;
  return state;
}

function cancelInterruptedMainEndRequest(state) {
  if (!state || state.pendingDecision || state.pendingReposition) return state;
  const stack = state.priorityStack || [];
  const rootCommand = stack[0]?.kind === "command" ? stack[0].command : state.pendingAction;
  if (!isMainEndRoot(rootCommand) || !rootCommand.__onlineInterrupted || stack.length > 1) return state;
  state.pendingAction = undefined;
  state.pendingResponse = null;
  state.priorityStack = undefined;
  return syncPriorityMetadata(state, { mode: PriorityMode.ACTION, owner: state.active, window: null });
}

function finishMainEndRequest(state) {
  const owner = state.pendingAction?.owner ?? state.active;
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  const result = executeRulesCommand(next, { type: "advancePhase", owner, skipPriority: true }, { priority: false });
  if (result.state.phase !== "combate") throw new RulesViolation("main-end-transition-failed");
  /* Online v3 enters unitary COMBAT_IDLE directly. There is no redundant
     generic combat-start click cycle in the documented Hemsfell turn flow. */
  delete result.state.onlineCombat;
  syncPriorityMetadata(result.state, { mode: PriorityMode.ACTION, owner: result.state.active, window: null });
  result.trace = [...(result.trace || []), "online-priority:main-end-accepted"];
  return result;
}

function canEndCombatNow(state, command) {
  if (command.type !== "advancePhase" || state.phase !== "combate") return false;
  if (command.owner !== state.active) throw new RulesViolation("not-your-turn");
  if (!interactionClear(state)) throw new RulesViolation("interaction-pending");
  return true;
}

function checkpointAtRoot(state) {
  return (state.priorityStack?.length || 0) <= 1 && state.pendingAction?.type === "onlineCheckpoint"
    ? state.pendingAction.checkpoint
    : null;
}

function finishSingleCombatStart(state) {
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  delete next.onlineCombat;
  return syncPriorityMetadata(next, { mode: PriorityMode.ACTION, owner: next.active, window: null });
}

function resolveSingleAttack(state) {
  const checkpoint = state.pendingAction;
  const combat = state.combatAction;
  if (!checkpoint || checkpoint.checkpoint !== SINGLE_ATTACK_RESOLUTION || !combat || combat.stage !== "priority") throw new RulesViolation("combat-checkpoint-mismatch");
  const next = clone(state);
  next.pendingAction = undefined;
  next.pendingResponse = null;
  next.priorityStack = undefined;
  next.combatAction = { ...combat, stage: "charging" };
  const command = {
    type: "attack",
    owner: combat.attackerOwner,
    attackerId: combat.attackerUid,
    ...(combat.targetHero ? {} : { defenderId: combat.defenderUid }),
    skipPriority: true,
  };
  const result = executeRulesCommand(next, command, { priority: false });
  syncPriorityMetadata(result.state, { mode: PriorityMode.ACTION, owner: result.state.active, window: null });
  result.trace = [...(result.trace || []), "online-combat:single-attack-resolved"];
  return result;
}

function resolveOnlineCheckpoint(state) {
  const checkpoint = checkpointAtRoot(state);
  if (!checkpoint) throw new RulesViolation("online-checkpoint-missing");
  if (checkpoint === MAIN_END_REQUEST) return finishMainEndRequest(state);
  if (checkpoint === SINGLE_ATTACK_RESOLUTION) return resolveSingleAttack(state);
  let next;
  if (checkpoint === SINGLE_COMBAT_START) next = finishSingleCombatStart(state);
  else if (checkpoint === OnlineFinalizationStage.PRIORITY) next = completeOnlineFinalization(state);
  else if (LEGACY_GROUPED_CHECKPOINTS.has(checkpoint)) next = finishSingleCombatStart(state);
  else throw new RulesViolation("unknown-online-checkpoint");
  return { state: next, trace: [`online-priority:checkpoint:${checkpoint}`], steps: 0 };
}

function normalizeDeclaredAttack(state) {
  const combat = state.combatAction;
  if (!combat || combat.stage !== "priority") throw new RulesViolation("combat-declaration-failed");
  /* Hemsfell unitary combat asks the defender for its blocker first. The single
     generic response checkpoint comes after that blocker/no-block decision and
     before damage, matching AWAITING_BLOCKER -> RESPONSE -> RESOLVE_ATTACK. */
  state.pendingResponse = null;
  state.pendingAction = undefined;
  state.priorityStack = undefined;
  const defenderOwner = 1 - combat.attackerOwner;
  const blockers = listLegalBlockers(state, defenderOwner, combat.attackerUid);
  if (!blockers.length) {
    /* Do not leave an attack waiting in a blocker-choice state when there is
       literally no legal blocker. This was the main source of silent combat
       locks: the attacker saw an inert attack while the defender had no useful
       choice to make. Go straight to the post-block response checkpoint. */
    state.combatAction = {
      ...combat,
      targetHero: true,
      defenderUid: undefined,
      defenderCard: undefined,
      stage: "charging",
    };
    return openSingleAttackResponse(state);
  }
  state.combatAction = { ...combat, stage: "choosing" };
  return syncPriorityMetadata(state, { mode: PriorityMode.ACTION, owner: defenderOwner, window: null });
}

function openSingleAttackResponse(state) {
  const combat = state.combatAction;
  if (!combat || combat.stage !== "charging") throw new RulesViolation("combat-checkpoint-mismatch");
  /* Keep the persisted combat stage in `priority` while the post-block response
     is open. The legacy board animation driver already treats that stage as a
     hard pause, so it cannot race the server by sending an `attack` command.
     Damage remains an internal server continuation after the response closes. */
  state.combatAction = { ...combat, stage: "priority" };
  openResponseWindow(state, {
    actor: 1 - combat.attackerOwner,
    responder: combat.attackerOwner,
    action: `resolução do ataque de ${combat.attackerCard?.name || combat.attackerUid || "criatura"}`,
    window: PriorityWindow.AFTER_BLOCKERS,
    pendingAction: {
      type: "onlineCheckpoint",
      checkpoint: SINGLE_ATTACK_RESOLUTION,
      owner: combat.attackerOwner,
      attackerId: combat.attackerUid,
      defenderId: combat.defenderUid,
      targetHero: !!combat.targetHero,
    },
  });
  return syncPriorityMetadata(state, { window: PriorityWindow.AFTER_BLOCKERS });
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
  /* Café do Tempo placement is a real authoritative action window. The
     controller of Café owns input until a legal slot is chosen, even during
     the opponent's turn. No phase/combat/activation command may bypass it. */
  if (decision.kind === "image-placement") {
    if (command.type !== "resolveDecision") throw new RulesViolation("image-placement-priority");
    if (Number(decision.owner) !== Number(command.owner)) throw new RulesViolation("decision-not-owned");
  }
}

function normalizeAfterResolution(before, result, command) {
  const state = result.state;
  /* The core priority engine already reconstructs actor/responder after the top
     stack item resolves. Overwriting responder with state.active here could
     make responder === actor, forcing the same player to pass twice and leaving
     the opponent without a usable response window. Preserve the authoritative
     handoff exactly as rebuilt by engine.mjs. */
  suspendPriorityWhileChoosing(state);
  cancelInterruptedMainEndRequest(state);
  return syncPriorityMetadata(state, { window: state.pendingResponse ? inferPriorityWindow(state) : null });
}

/* Once one player has passed, returning priority to a player with literally no
   legal response is deterministic. Do that second empty pass on the server
   instead of depending on a browser-side assisted-mode effect. This removes a
   deadlock where both clients could display "waiting for opponent" while the
   player who technically owned priority had no modal/action to perform. */
function resolveEmptySecondPass(state, options = {}) {
  const pending = state?.pendingResponse;
  if (!pending || Number(pending.passes || 0) < 1) return null;
  const owner = pending.responder;
  if (legalPriorityResponses(state, owner).length > 0) return null;
  if (checkpointAtRoot(state)) {
    const resolved = resolveOnlineCheckpoint(state);
    resolved.trace = [...(resolved.trace || []), "online-priority:auto-pass-empty-second-window"];
    return resolved;
  }
  const result = executeRulesCommand(state, { type: "passPriority", owner, auto: true }, { ...options, priority: true });
  normalizeAfterResolution(state, result, { type: "passPriority", owner, auto: true });
  result.trace = [...(result.trace || []), "online-priority:auto-pass-empty-second-window"];
  return result;
}

export function executeOnlineCommand(inputState, rawCommand, options = {}) {
  const state = syncPriorityMetadata(clone(inputState));
  /* Recover long-lived room snapshots that already contain both a target/choice
     decision and a response window from the pre-fix flow. A player must finish
     the interactive choice first; priority resumes only after that choice. */
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
        const autoResolved = resolveEmptySecondPass(passed, options);
        if (autoResolved) return autoResolved;
        return { state: passed, trace: ["online-priority:first-pass"], steps: 0 };
      }
      if (checkpointAtRoot(state)) return resolveOnlineCheckpoint(state);
      const result = executeRulesCommand(state, command, { ...options, priority: true });
      normalizeAfterResolution(state, result, command);
      const autoResolved = resolveEmptySecondPass(result.state, options);
      if (autoResolved) {
        autoResolved.trace = [...(result.trace || []), ...(autoResolved.trace || []), "online-priority:resolve-after-two-passes"];
        return autoResolved;
      }
      result.trace = [...(result.trace || []), "online-priority:resolve-after-two-passes"];
      return result;
    }

    validateOnlineResponse(state, command);
    markMainEndInterrupted(state);
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
  if (canRequestMainEnd(state, command)) return openMainEndRequest(state, command);
  if (canEndCombatNow(state, command)) {
    const next = enterOnlineFinalization(state, command.owner);
    return { state: next, trace: ["online-finalization:entered-from-combat-idle"], steps: 0 };
  }

  const result = executeRulesCommand(state, command, { ...options, priority: true });
  if (command.type === "declareAttack") {
    result.state = normalizeDeclaredAttack(result.state);
    result.trace = [...(result.trace || []), "online-combat:awaiting-blocker"];
    return result;
  }
  if (command.type === "selectDefender" && result.state.combatAction?.stage === "charging") {
    result.state = openSingleAttackResponse(result.state);
    result.trace = [...(result.trace || []), "online-combat:post-block-response-open"];
    return result;
  }
  resumePriorityAfterChoice(state, result.state);
  cancelInterruptedMainEndRequest(result.state);
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
