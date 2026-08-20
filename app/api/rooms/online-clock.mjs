import {
  createPriorityClock,
  normalizePriorityClock,
  serverNowMs,
} from "./time.mjs";
import {
  OnlineInteractionState,
  deriveOnlineInteractionState,
} from "../../rules-engine/priority-state.mjs";

const remaining = (deadline, now) => Math.max(0, Number(deadline || 0) - now);
const responseDuration = (settings) => Number(settings?.responseSeconds || 30) * 1000;
const interactionState = (game) => game?.priority?.interactionState || deriveOnlineInteractionState(game);
const responseOwnsInput = (game) => [OnlineInteractionState.RESPONSE_PRIORITY, OnlineInteractionState.FINALIZATION_RESPONSE].includes(interactionState(game));
const blockerOwnsInput = (game) => interactionState(game) === OnlineInteractionState.AWAITING_BLOCKER;
const decisionOwnsInput = (game) => [OnlineInteractionState.DECISION, OnlineInteractionState.REPOSITION].includes(interactionState(game));
const actionClockRuns = (game) => [OnlineInteractionState.MAINTENANCE_DECISION, OnlineInteractionState.ACTION_PRIORITY, OnlineInteractionState.COMBAT_IDLE].includes(interactionState(game));

const clearPriorityClock = (game) => {
  if (!game?.priority) return;
  game.priority.deadline = null;
  game.priority.openedAt = null;
  game.priority.responder = null;
  game.priority.timerMode = null;
  game.priority.wallDeadline = null;
  game.priority.driftLevel = null;
};

const mirrorPriorityClock = (game, pending) => {
  if (!game?.priority) return;
  if (!pending) return clearPriorityClock(game);
  game.priority.deadline = pending.deadline ?? null;
  game.priority.openedAt = pending.openedAt ?? null;
  game.priority.responder = Number.isInteger(pending.responder) ? pending.responder : null;
  game.priority.timerMode = pending.timerMode || (pending.deadline ? "normal" : "action_only");
  game.priority.wallDeadline = pending.wallDeadline ?? null;
  game.priority.driftLevel = pending.driftLevel || "ok";
};

const openResponseClock = (game, settings, now) => {
  if (!game?.pendingResponse) return null;
  Object.assign(game.pendingResponse, createPriorityClock(responseDuration(settings), now));
  mirrorPriorityClock(game, game.pendingResponse);
  return game.pendingResponse;
};

const shiftDeadline = (target, key, milliseconds) => {
  if (target && Number.isFinite(Number(target[key])) && Number(target[key]) > 0) target[key] = Number(target[key]) + milliseconds;
};

/** Shift every absolute Online interaction deadline by a reconnect pause. */
export function shiftOnlineDeadlines(game, milliseconds) {
  if (!game || !Number.isFinite(Number(milliseconds)) || milliseconds <= 0) return game;
  shiftDeadline(game, "turnDeadline", milliseconds);
  for (const target of [game.pendingResponse, game.priority, game.combatAction, game.pendingReposition, game.pendingDecision]) {
    shiftDeadline(target, "openedAt", milliseconds);
    shiftDeadline(target, "deadline", milliseconds);
    shiftDeadline(target, "wallDeadline", milliseconds);
  }
  return game;
}

/**
 * Validate/recover the active response clock. This is used on every server
 * timeout pass, including after a serverless cold start. Invalid/zero clocks are
 * regenerated, valid elapsed clocks stay expired, backwards drift receives a
 * bounded margin, and critical drift enters action_only until its wall ceiling.
 */
export function ensureResponseClock(game, settings, now = serverNowMs()) {
  if (!game?.pendingResponse || !responseOwnsInput(game)) {
    clearPriorityClock(game);
    return { changed: false, expired: false, wallExpired: false, timerMode: "none", driftLevel: "ok" };
  }
  const result = normalizePriorityClock(game.pendingResponse, responseDuration(settings), now);
  mirrorPriorityClock(game, game.pendingResponse);
  return result;
}

function preserveActionRemainder(before, after, settings, now) {
  const stored = Number(before?.turnTimeRemainingMs);
  if (Number.isFinite(stored)) after.turnTimeRemainingMs = Math.max(0, stored);
  else if (before?.turnDeadline) after.turnTimeRemainingMs = remaining(before.turnDeadline, now);
  else if (!Number.isFinite(Number(after.turnTimeRemainingMs))) after.turnTimeRemainingMs = settings.turnSeconds * 1000;
  after.turnDeadline = null;
}

/**
 * One clock policy follows the canonical Online interaction state:
 * - Maintenance decision / normal Action Priority / COMBAT_IDLE consume the
 *   active player's turn clock.
 * - Response Priority gets a server response deadline and pauses turn time.
 * - AWAITING_BLOCKER gets a defender deadline and pauses turn time.
 * - mandatory decisions/reposition and deterministic resolving states pause the
 *   turn clock instead of allowing a hidden phase timeout underneath them.
 */
export function reconcileOnlineClocks(before, after, settings, now = serverNowMs()) {
  if (!after) return after;
  const afterInteraction = interactionState(after);
  if (afterInteraction === OnlineInteractionState.GAME_OVER || (after.winner !== null && after.winner !== undefined)) {
    after.turnDeadline = null;
    delete after.turnTimeRemainingMs;
    if (after.pendingResponse) {
      delete after.pendingResponse.deadline;
      delete after.pendingResponse.openedAt;
      delete after.pendingResponse.wallDeadline;
      delete after.pendingResponse.timerMode;
      delete after.pendingResponse.driftLevel;
    }
    if (after.combatAction) delete after.combatAction.deadline;
    clearPriorityClock(after);
    return after;
  }

  const activeChanged = Number(before?.active) !== Number(after.active);
  const wasPaused = before && !actionClockRuns(before);
  const blockerChoice = blockerOwnsInput(after);
  const responseChoice = responseOwnsInput(after);
  const decisionChoice = decisionOwnsInput(after);

  if (after.combatAction && !blockerChoice) delete after.combatAction.deadline;

  if (activeChanged) {
    if (responseChoice) {
      after.turnTimeRemainingMs = settings.turnSeconds * 1000;
      after.turnDeadline = null;
      openResponseClock(after, settings, now);
    } else if (blockerChoice) {
      after.turnTimeRemainingMs = settings.turnSeconds * 1000;
      after.turnDeadline = null;
      after.combatAction.deadline = now + settings.responseSeconds * 1000;
      if (after.priority) after.priority.deadline = after.combatAction.deadline;
    } else if (!actionClockRuns(after)) {
      after.turnTimeRemainingMs = settings.turnSeconds * 1000;
      after.turnDeadline = null;
      clearPriorityClock(after);
    } else {
      delete after.turnTimeRemainingMs;
      after.turnDeadline = now + settings.turnSeconds * 1000;
      clearPriorityClock(after);
    }
    return after;
  }

  if (blockerChoice) {
    preserveActionRemainder(before, after, settings, now);
    const wasBlockerChoice = blockerOwnsInput(before);
    if (!wasBlockerChoice || !Number.isFinite(Number(after.combatAction.deadline)) || Number(after.combatAction.deadline) <= 0) after.combatAction.deadline = now + settings.responseSeconds * 1000;
    if (after.priority) after.priority.deadline = after.combatAction.deadline;
    return after;
  }

  if (responseChoice) {
    preserveActionRemainder(before, after, settings, now);
    const responderChanged = Number(before?.pendingResponse?.responder) !== Number(after.pendingResponse?.responder);
    const newlyOpened = !responseOwnsInput(before) || !before?.pendingResponse;
    if (newlyOpened || responderChanged) openResponseClock(after, settings, now);
    else ensureResponseClock(after, settings, now);
    return after;
  }

  if (decisionChoice || !actionClockRuns(after)) {
    preserveActionRemainder(before, after, settings, now);
    clearPriorityClock(after);
    return after;
  }

  clearPriorityClock(after);
  const paused = Number(before?.turnTimeRemainingMs ?? after.turnTimeRemainingMs);
  if (wasPaused && Number.isFinite(paused)) {
    after.turnDeadline = now + Math.max(0, paused);
    delete after.turnTimeRemainingMs;
    return after;
  }

  /* Ordinary actions do not refill the turn timer. Preserve its original
     deadline unless no usable clock existed yet (e.g. a recovered legacy room). */
  const previousDeadline = Number(before?.turnDeadline);
  const currentDeadline = Number(after.turnDeadline);
  if (Number.isFinite(previousDeadline) && previousDeadline > 0) after.turnDeadline = previousDeadline;
  else if (Number.isFinite(currentDeadline) && currentDeadline > 0) after.turnDeadline = currentDeadline;
  else after.turnDeadline = now + settings.turnSeconds * 1000;
  delete after.turnTimeRemainingMs;
  return after;
}
