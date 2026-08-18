export type OnlineClockSettings = {
  responseSeconds: number;
  turnSeconds: number;
};

const remaining = (deadline: unknown, now: number) => Math.max(0, Number(deadline || 0) - now);

/**
 * Keep the active player's action clock independent from opponent response time.
 * The clock is paused while a response window exists and resumed with exactly
 * the stored remainder when the stack returns to action priority. A new active
 * player always receives a fresh turn clock.
 */
export function reconcileOnlineClocks(before: any, after: any, settings: OnlineClockSettings, now = Date.now()) {
  if (!after) return after;
  if (after.winner !== null && after.winner !== undefined) {
    after.turnDeadline = null;
    delete after.turnTimeRemainingMs;
    if (after.pendingResponse) delete after.pendingResponse.deadline;
    return after;
  }

  const activeChanged = Number(before?.active) !== Number(after.active);
  if (activeChanged) {
    delete after.turnTimeRemainingMs;
    after.turnDeadline = now + settings.turnSeconds * 1000;
    if (after.pendingResponse && !after.pendingResponse.deadline) after.pendingResponse.deadline = now + settings.responseSeconds * 1000;
    return after;
  }

  if (after.pendingResponse) {
    const stored = Number(before?.turnTimeRemainingMs);
    if (Number.isFinite(stored)) after.turnTimeRemainingMs = Math.max(0, stored);
    else if (before?.turnDeadline) after.turnTimeRemainingMs = remaining(before.turnDeadline, now);
    else if (!Number.isFinite(Number(after.turnTimeRemainingMs))) after.turnTimeRemainingMs = settings.turnSeconds * 1000;
    after.turnDeadline = null;
    if (!after.pendingResponse.deadline) after.pendingResponse.deadline = now + settings.responseSeconds * 1000;
    return after;
  }

  const paused = Number(before?.turnTimeRemainingMs ?? after.turnTimeRemainingMs);
  if (before?.pendingResponse && Number.isFinite(paused)) {
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
