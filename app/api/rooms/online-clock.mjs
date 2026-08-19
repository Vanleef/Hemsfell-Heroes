const remaining = (deadline, now) => Math.max(0, Number(deadline || 0) - now);
const choosingBlocker = (game) => game?.combatAction?.stage === "choosing";
const choosingDecision = (game) => !!game?.pendingDecision || !!game?.pendingReposition;
const setPriorityDeadline = (game, deadline) => { if (game?.priority) game.priority.deadline = deadline ?? null; };
const shiftDeadline = (target, key, milliseconds) => {
  if (target && Number.isFinite(Number(target[key]))) target[key] = Number(target[key]) + milliseconds;
};

/** Shift every absolute Online interaction deadline by a reconnect pause. */
export function shiftOnlineDeadlines(game, milliseconds) {
  if (!game || !Number.isFinite(Number(milliseconds)) || milliseconds <= 0) return game;
  shiftDeadline(game, "turnDeadline", milliseconds);
  shiftDeadline(game.pendingResponse, "deadline", milliseconds);
  shiftDeadline(game.priority, "deadline", milliseconds);
  shiftDeadline(game.combatAction, "deadline", milliseconds);
  shiftDeadline(game.pendingReposition, "deadline", milliseconds);
  shiftDeadline(game.pendingDecision, "deadline", milliseconds);
  return game;
}

/**
 * Keep the active player's action clock independent from interaction time.
 * The action clock pauses while a response window, defender-only blocker choice,
 * target/effect decision or reposition decision owns input. It resumes with
 * exactly the stored remainder when normal action priority returns.
 */
export function reconcileOnlineClocks(before, after, settings, now = Date.now()) {
  if (!after) return after;
  if (after.winner !== null && after.winner !== undefined) {
    after.turnDeadline = null;
    delete after.turnTimeRemainingMs;
    if (after.pendingResponse) delete after.pendingResponse.deadline;
    if (after.combatAction) delete after.combatAction.deadline;
    setPriorityDeadline(after, null);
    return after;
  }

  const activeChanged = Number(before?.active) !== Number(after.active);
  const blockerChoice = choosingBlocker(after);
  const decisionChoice = choosingDecision(after);
  if (after.combatAction && !blockerChoice) delete after.combatAction.deadline;

  if (activeChanged) {
    if (after.pendingResponse) {
      after.turnTimeRemainingMs = settings.turnSeconds * 1000;
      after.turnDeadline = null;
      after.pendingResponse.deadline = now + settings.responseSeconds * 1000;
      setPriorityDeadline(after, after.pendingResponse.deadline);
    } else if (blockerChoice) {
      after.turnTimeRemainingMs = settings.turnSeconds * 1000;
      after.turnDeadline = null;
      after.combatAction.deadline = now + settings.responseSeconds * 1000;
      setPriorityDeadline(after, after.combatAction.deadline);
    } else if (decisionChoice) {
      after.turnTimeRemainingMs = settings.turnSeconds * 1000;
      after.turnDeadline = null;
      setPriorityDeadline(after, null);
    } else {
      delete after.turnTimeRemainingMs;
      after.turnDeadline = now + settings.turnSeconds * 1000;
      setPriorityDeadline(after, null);
    }
    return after;
  }

  if (blockerChoice) {
    const stored = Number(before?.turnTimeRemainingMs);
    if (Number.isFinite(stored)) after.turnTimeRemainingMs = Math.max(0, stored);
    else if (before?.turnDeadline) after.turnTimeRemainingMs = remaining(before.turnDeadline, now);
    else if (!Number.isFinite(Number(after.turnTimeRemainingMs))) after.turnTimeRemainingMs = settings.turnSeconds * 1000;
    after.turnDeadline = null;
    const wasBlockerChoice = choosingBlocker(before);
    if (!wasBlockerChoice || !after.combatAction.deadline) after.combatAction.deadline = now + settings.responseSeconds * 1000;
    setPriorityDeadline(after, after.combatAction.deadline);
    return after;
  }

  if (after.pendingResponse) {
    const stored = Number(before?.turnTimeRemainingMs);
    if (Number.isFinite(stored)) after.turnTimeRemainingMs = Math.max(0, stored);
    else if (before?.turnDeadline) after.turnTimeRemainingMs = remaining(before.turnDeadline, now);
    else if (!Number.isFinite(Number(after.turnTimeRemainingMs))) after.turnTimeRemainingMs = settings.turnSeconds * 1000;
    after.turnDeadline = null;
    const responderChanged = Number(before?.pendingResponse?.responder) !== Number(after.pendingResponse.responder);
    if (responderChanged || !after.pendingResponse.deadline) after.pendingResponse.deadline = now + settings.responseSeconds * 1000;
    setPriorityDeadline(after, after.pendingResponse.deadline);
    return after;
  }

  if (decisionChoice) {
    const stored = Number(before?.turnTimeRemainingMs);
    if (Number.isFinite(stored)) after.turnTimeRemainingMs = Math.max(0, stored);
    else if (before?.turnDeadline) after.turnTimeRemainingMs = remaining(before.turnDeadline, now);
    else if (!Number.isFinite(Number(after.turnTimeRemainingMs))) after.turnTimeRemainingMs = settings.turnSeconds * 1000;
    after.turnDeadline = null;
    setPriorityDeadline(after, null);
    return after;
  }

  setPriorityDeadline(after, null);
  const paused = Number(before?.turnTimeRemainingMs ?? after.turnTimeRemainingMs);
  if ((before?.pendingResponse || choosingBlocker(before) || choosingDecision(before)) && Number.isFinite(paused)) {
    after.turnDeadline = now + Math.max(0, paused);
    delete after.turnTimeRemainingMs;
    return after;
  }

  /* Ordinary actions do not refill the turn timer. Preserve its original
     deadline unless no clock existed yet (e.g. a recovered legacy room). */
  after.turnDeadline = before?.turnDeadline || after.turnDeadline || now + settings.turnSeconds * 1000;
  delete after.turnTimeRemainingMs;
  return after;
}
