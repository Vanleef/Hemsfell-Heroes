export const PRIORITY_CONTROL_ASSISTED = "assisted";
export const PRIORITY_CONTROL_FULL = "full-control";

export function nextPriorityControlMode(mode) {
  return mode === PRIORITY_CONTROL_ASSISTED ? PRIORITY_CONTROL_FULL : PRIORITY_CONTROL_ASSISTED;
}

export function priorityWindowKey(pending) {
  if (!pending) return null;
  return `${pending.actor}:${pending.responder}:${pending.passes ?? 0}:${pending.action}:${pending.deadline ?? 0}`;
}

export function requestPriorityControlChange({ mode, queuedMode = null, interactionActive }) {
  const requestedMode = nextPriorityControlMode(queuedMode ?? mode);
  if (!interactionActive) return { mode: requestedMode, queuedMode: null };
  return requestedMode === mode
    ? { mode, queuedMode: null }
    : { mode, queuedMode: requestedMode };
}

export function flushQueuedPriorityControl({ mode, queuedMode = null, interactionActive }) {
  if (interactionActive || !queuedMode) return { mode, queuedMode };
  return { mode: queuedMode, queuedMode: null };
}

export function shouldShowPriorityWindow({ pending, owner = 0, mode, hasUsableResponse }) {
  return pending?.responder === owner
    && (mode === PRIORITY_CONTROL_FULL || hasUsableResponse);
}

export function shouldAutoPassPriorityWindow({ pending, owner = 0, mode, hasUsableResponse }) {
  return pending?.responder === owner
    && mode === PRIORITY_CONTROL_ASSISTED
    && !hasUsableResponse;
}
