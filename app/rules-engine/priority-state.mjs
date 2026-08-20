export const PriorityMode = Object.freeze({
  NONE: "none",
  ACTION: "action",
  RESPONSE: "response",
  RESOLVING: "resolving",
});

export const PriorityWindow = Object.freeze({
  MAINTENANCE: "maintenance-triggers",
  MAIN_ACTION: "main-action-response",
  MAIN_END: "main-end",
  COMBAT_START: "combat-start",
  AFTER_ATTACKERS: "after-attackers",
  AFTER_BLOCKERS: "after-blockers",
  COMBAT_TRIGGER: "combat-trigger",
  COMBAT_END: "combat-end",
  FINALIZATION: "finalization",
  ACTIVATED_ABILITY: "activated-ability-response",
});

/**
 * Canonical Online input states.  They deliberately describe who currently
 * owns input rather than mirroring every internal engine phase.  Clients may
 * render these values, but legality is still enforced by the server/motor.
 */
export const OnlineInteractionState = Object.freeze({
  GAME_OVER: "game-over",
  DECISION: "decision",
  REPOSITION: "reposition",
  RESPONSE_PRIORITY: "response-priority",
  MAINTENANCE_DECISION: "maintenance-decision",
  ACTION_PRIORITY: "action-priority",
  COMBAT_IDLE: "combat-idle",
  AWAITING_BLOCKER: "awaiting-blocker",
  RESOLVING_ATTACK: "resolving-attack",
  FINALIZATION_EFFECTS: "finalization-effects",
  FINALIZATION_RESPONSE: "finalization-response",
  RESOLVING: "resolving",
});

const clone = (value) => structuredClone(value);

export function phaseTransitionWindow(phase) {
  if (phase === "principal") return PriorityWindow.MAIN_END;
  if (phase === "combate") return PriorityWindow.COMBAT_END;
  if (phase === "fim") return PriorityWindow.FINALIZATION;
  return null;
}

export function inferPriorityWindow(state) {
  if (state?.priority?.window) return state.priority.window;
  if (state?.pendingAction?.__onlineWindow) return state.pendingAction.__onlineWindow;
  if (state?.combatAction?.stage === "priority") return PriorityWindow.AFTER_ATTACKERS;
  if (state?.phase === "manutencao") return PriorityWindow.MAINTENANCE;
  if (state?.phase === "principal") return PriorityWindow.MAIN_ACTION;
  if (state?.phase === "combate") return PriorityWindow.COMBAT_TRIGGER;
  if (state?.phase === "fim") return PriorityWindow.FINALIZATION;
  return null;
}

export function deriveOnlineInteractionState(state) {
  if (!state || (state.winner !== null && state.winner !== undefined)) return OnlineInteractionState.GAME_OVER;
  if (state.pendingDecision) return OnlineInteractionState.DECISION;
  if (state.pendingReposition) return OnlineInteractionState.REPOSITION;
  if (state.pendingResponse) {
    return state.phase === "fim" && state.onlineFinalization?.stage === "finalization-priority"
      ? OnlineInteractionState.FINALIZATION_RESPONSE
      : OnlineInteractionState.RESPONSE_PRIORITY;
  }
  if (state.phase === "manutencao") return OnlineInteractionState.MAINTENANCE_DECISION;
  if (state.phase === "principal") return OnlineInteractionState.ACTION_PRIORITY;
  if (state.phase === "combate") {
    if (!state.combatAction) return OnlineInteractionState.COMBAT_IDLE;
    if (state.combatAction.stage === "choosing") return OnlineInteractionState.AWAITING_BLOCKER;
    return OnlineInteractionState.RESOLVING_ATTACK;
  }
  if (state.phase === "fim") {
    if (state.onlineFinalization?.stage === "finalization-effects") return OnlineInteractionState.FINALIZATION_EFFECTS;
    return OnlineInteractionState.RESOLVING;
  }
  return OnlineInteractionState.RESOLVING;
}

/**
 * Coarse command surface for UI/diagnostics.  It is intentionally narrower
 * than the complete rules engine and never replaces per-card legality checks.
 */
export function commandTypesForOnlineState(state) {
  switch (deriveOnlineInteractionState(state)) {
    case OnlineInteractionState.DECISION:
      return ["resolveDecision"];
    case OnlineInteractionState.REPOSITION:
      return ["reposition", "confirmReposition"];
    case OnlineInteractionState.RESPONSE_PRIORITY:
    case OnlineInteractionState.FINALIZATION_RESPONSE:
      return ["playCard", "activate", "activateHero", "passPriority"];
    case OnlineInteractionState.MAINTENANCE_DECISION:
      return ["maintenanceChoice"];
    case OnlineInteractionState.ACTION_PRIORITY:
      return ["playCard", "activate", "activateHero", "advancePhase"];
    case OnlineInteractionState.COMBAT_IDLE:
      return ["declareAttack", "advancePhase"];
    case OnlineInteractionState.AWAITING_BLOCKER:
      return ["selectDefender"];
    case OnlineInteractionState.RESOLVING_ATTACK:
      return state?.combatAction?.stage === "charging" ? ["attack"] : [];
    default:
      return [];
  }
}

export function inputOwnerForOnlineState(state) {
  const interaction = deriveOnlineInteractionState(state);
  if (interaction === OnlineInteractionState.GAME_OVER || interaction === OnlineInteractionState.RESOLVING || interaction === OnlineInteractionState.FINALIZATION_EFFECTS) return null;
  if (interaction === OnlineInteractionState.DECISION) return Number.isInteger(state.pendingDecision?.owner) ? state.pendingDecision.owner : null;
  if (interaction === OnlineInteractionState.REPOSITION) return Number.isInteger(state.pendingReposition?.activeOwner) ? state.pendingReposition.activeOwner : null;
  if (interaction === OnlineInteractionState.RESPONSE_PRIORITY || interaction === OnlineInteractionState.FINALIZATION_RESPONSE) return state.pendingResponse?.responder ?? null;
  if (interaction === OnlineInteractionState.AWAITING_BLOCKER) return Number.isInteger(state.combatAction?.attackerOwner) ? 1 - state.combatAction.attackerOwner : null;
  if (interaction === OnlineInteractionState.RESOLVING_ATTACK && state.combatAction?.stage === "charging") return state.combatAction.attackerOwner ?? null;
  return state.active ?? null;
}

/** Detect impossible/racy snapshots before they are persisted to a room. */
export function assertOnlineInteractionInvariant(state) {
  if (!state) throw new Error("online-state-missing");
  if (state.pendingDecision && state.pendingReposition) throw new Error("multiple-interactive-decisions");
  if ((state.pendingDecision || state.pendingReposition) && state.pendingResponse) throw new Error("decision-and-response-overlap");
  if (state.pendingResponse) {
    if (![0, 1].includes(state.pendingResponse.responder)) throw new Error("invalid-response-responder");
    if (![0, 1].includes(state.pendingResponse.actor)) throw new Error("invalid-response-actor");
  }
  if (state.combatAction?.stage === "choosing" && state.pendingResponse) throw new Error("blocker-and-response-overlap");
  return true;
}

export function canonicalStack(state) {
  if (state?.priorityStack?.length) {
    return state.priorityStack.map((frame, index) => ({
      id: frame.id || `priority-${index}`,
      kind: frame.kind || "command",
      controller: frame.actor ?? frame.command?.owner ?? null,
      label: frame.label || frame.command?.action || frame.command?.cardId || frame.command?.type || "ação",
      command: frame.command ? clone(frame.command) : undefined,
    }));
  }
  if (state?.pendingAction) {
    return [{
      id: "root-action",
      kind: "command",
      controller: state.pendingAction.owner ?? null,
      label: state.pendingResponse?.action || state.pendingAction.action || state.pendingAction.cardId || state.pendingAction.type || "ação",
      command: clone(state.pendingAction),
    }];
  }
  if (state?.combatAction?.stage === "priority") {
    return [{
      id: "combat-root",
      kind: "combat",
      controller: state.combatAction.attackerOwner ?? null,
      label: state.pendingResponse?.action || state.combatAction.attackerCard?.name || "combate",
    }];
  }
  return [];
}

export function syncPriorityMetadata(state, overrides = {}) {
  if (!state) return state;
  const pending = state.pendingResponse;
  const stack = canonicalStack(state);
  const hasWinner = state.winner !== null && state.winner !== undefined;
  const interactionState = deriveOnlineInteractionState(state);
  const derivedOwner = inputOwnerForOnlineState(state);
  const mode = hasWinner
    ? PriorityMode.NONE
    : pending
      ? PriorityMode.RESPONSE
      : interactionState === OnlineInteractionState.RESOLVING || interactionState === OnlineInteractionState.FINALIZATION_EFFECTS || interactionState === OnlineInteractionState.RESOLVING_ATTACK
        ? PriorityMode.RESOLVING
        : overrides.mode || PriorityMode.ACTION;
  const owner = hasWinner ? null : pending ? pending.responder : overrides.owner ?? derivedOwner;
  state.priority = {
    model: "online-v3",
    mode,
    owner,
    responder: pending?.responder ?? null,
    window: overrides.window ?? (pending ? inferPriorityWindow(state) : null),
    interactionState,
    commandTypes: commandTypesForOnlineState(state),
    consecutivePasses: pending ? Number(pending.passes || 0) : 0,
    openedAt: pending?.openedAt ?? state.pendingDecision?.openedAt ?? state.pendingReposition?.openedAt ?? null,
    deadline: pending?.deadline ?? state.pendingDecision?.deadline ?? state.pendingReposition?.deadline ?? state.combatAction?.deadline ?? null,
    timerMode: pending?.timerMode ?? null,
    wallDeadline: pending?.wallDeadline ?? null,
    driftLevel: pending?.driftLevel ?? null,
    stackDepth: stack.length,
  };
  state.stack = stack;
  return state;
}

export function openResponseWindow(state, { actor, responder = 1 - actor, action, window, deadline = null, pendingAction }) {
  if (!state) return state;
  if (![0, 1].includes(actor) || ![0, 1].includes(responder)) throw new Error("invalid-response-owner");
  if (state.pendingDecision || state.pendingReposition) throw new Error("decision-owns-input");
  if (pendingAction) state.pendingAction = { ...clone(pendingAction), __onlineWindow: window };
  state.pendingResponse = {
    responder,
    actor,
    action,
    passes: 0,
    ...(deadline ? { deadline } : {}),
  };
  assertOnlineInteractionInvariant(state);
  return syncPriorityMetadata(state, { window });
}

export function handOffFirstPass(state, owner) {
  const pending = state?.pendingResponse;
  if (!pending || pending.responder !== owner) throw new Error("not-your-priority");
  if (Number(pending.passes || 0) !== 0) return null;
  const next = clone(state);
  next.pendingResponse = {
    ...next.pendingResponse,
    responder: 1 - owner,
    passes: 1,
    openedAt: null,
    deadline: null,
    wallDeadline: null,
    timerMode: null,
    driftLevel: null,
  };
  assertOnlineInteractionInvariant(next);
  return syncPriorityMetadata(next, { window: inferPriorityWindow(state) });
}

export function prioritySignature(state) {
  const pending = state?.pendingResponse;
  const stack = canonicalStack(state);
  return [
    state?.round ?? 0,
    state?.phase ?? "",
    state?.events ?? 0,
    deriveOnlineInteractionState(state),
    pending?.responder ?? "-",
    pending?.passes ?? 0,
    inferPriorityWindow(state) ?? "-",
    stack.map((frame) => `${frame.kind}:${frame.controller}:${frame.label}`).join(">"),
  ].join("|");
}
