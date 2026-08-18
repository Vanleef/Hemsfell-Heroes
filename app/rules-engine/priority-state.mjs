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
  const existing = state.priority || {};
  const stack = canonicalStack(state);
  const hasWinner = state.winner !== null && state.winner !== undefined;
  const mode = hasWinner
    ? PriorityMode.NONE
    : pending
      ? PriorityMode.RESPONSE
      : overrides.mode || PriorityMode.ACTION;
  const owner = hasWinner
    ? null
    : pending
      ? pending.responder
      : overrides.owner ?? state.active ?? null;
  state.priority = {
    mode,
    owner,
    window: overrides.window ?? (pending ? inferPriorityWindow(state) : null),
    consecutivePasses: pending ? Number(pending.passes || 0) : 0,
    deadline: pending?.deadline ?? null,
    stackDepth: stack.length,
  };
  state.stack = stack;
  return state;
}

export function openResponseWindow(state, { actor, responder = 1 - actor, action, window, deadline = null, pendingAction }) {
  if (!state) return state;
  if (pendingAction) state.pendingAction = { ...clone(pendingAction), __onlineWindow: window };
  state.pendingResponse = {
    responder,
    actor,
    action,
    passes: 0,
    ...(deadline ? { deadline } : {}),
  };
  return syncPriorityMetadata(state, { window });
}

export function handOffFirstPass(state, owner) {
  const pending = state?.pendingResponse;
  if (!pending || pending.responder !== owner) throw new Error("not-your-priority");
  if (Number(pending.passes || 0) !== 0) return null;
  const next = clone(state);
  next.pendingResponse = { ...next.pendingResponse, responder: 1 - owner, passes: 1 };
  return syncPriorityMetadata(next, { window: inferPriorityWindow(state) });
}

export function prioritySignature(state) {
  const pending = state?.pendingResponse;
  const stack = canonicalStack(state);
  return [
    state?.round ?? 0,
    state?.phase ?? "",
    state?.events ?? 0,
    pending?.responder ?? "-",
    pending?.passes ?? 0,
    inferPriorityWindow(state) ?? "-",
    stack.map((frame) => `${frame.kind}:${frame.controller}:${frame.label}`).join(">"),
  ].join("|");
}
