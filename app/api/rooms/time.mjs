export const PRIORITY_CLOCK = Object.freeze({
  MIN_MS: 1_000,
  MAX_MS: 120_000,
  WARN_SKEW_MS: 2_000,
  HARD_SKEW_MS: 5_000,
  CRITICAL_SKEW_MS: 15_000,
  DRIFT_MARGIN_MS: 2_000,
  HARD_DRIFT_MARGIN_MS: 5_000,
  SAFETY_GRACE_MS: 250,
  MAX_PRIORITY_WALL_MS: 5 * 60_000,
});

let testNowProvider = null;

const safeOffsetMs = () => {
  const parsed = Number(process.env.HEMSFELL_TIME_OFFSET_MS || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Authoritative wall clock for multiplayer deadlines.
 * Vercel/the host OS is responsible for NTP. The app only consumes epoch ms.
 * HEMSFELL_TIME_OFFSET_MS exists as an emergency operational escape hatch and
 * must never be supplied by a client.
 */
export function serverNowMs() {
  const raw = testNowProvider ? Number(testNowProvider()) : Date.now();
  const value = raw + safeOffsetMs();
  if (!Number.isFinite(value) || value <= 0) return Date.now();
  return Math.trunc(value);
}

export function setServerNowProviderForTests(provider = null) {
  testNowProvider = typeof provider === "function" ? provider : null;
}

export function clampPriorityDurationMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30_000;
  return Math.min(PRIORITY_CLOCK.MAX_MS, Math.max(PRIORITY_CLOCK.MIN_MS, Math.round(parsed)));
}

export function isFinitePositiveTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function createPriorityClock(durationMs, now = serverNowMs()) {
  const openedAt = Number(now);
  const duration = clampPriorityDurationMs(durationMs);
  if (!isFinitePositiveTimestamp(openedAt)) {
    return { openedAt: null, deadline: null, wallDeadline: null, timerMode: "action_only", driftLevel: "critical" };
  }
  return {
    openedAt,
    deadline: openedAt + duration,
    wallDeadline: openedAt + PRIORITY_CLOCK.MAX_PRIORITY_WALL_MS,
    timerMode: "normal",
    driftLevel: "ok",
  };
}

/**
 * Repairs malformed/legacy clocks and protects against a server wall clock that
 * moved backwards. A valid already-expired deadline is never regenerated here:
 * that is a real timeout and must be consumed by the authoritative autopass.
 */
export function normalizePriorityClock(pending, durationMs, now = serverNowMs()) {
  if (!pending) return { changed: false, expired: false, wallExpired: false, timerMode: "none", driftLevel: "ok" };
  const duration = clampPriorityDurationMs(durationMs);
  const currentNow = Number(now);
  let changed = false;

  const enterActionOnly = () => {
    pending.timerMode = "action_only";
    pending.deadline = null;
    pending.driftLevel = "critical";
    if (!isFinitePositiveTimestamp(pending.openedAt)) pending.openedAt = currentNow;
    if (!isFinitePositiveTimestamp(pending.wallDeadline) || Number(pending.wallDeadline) <= currentNow) {
      pending.wallDeadline = currentNow + PRIORITY_CLOCK.MAX_PRIORITY_WALL_MS;
    }
    changed = true;
  };

  if (!isFinitePositiveTimestamp(currentNow)) {
    enterActionOnly();
    return { changed, expired: false, wallExpired: false, timerMode: "action_only", driftLevel: "critical" };
  }

  if (pending.timerMode === "action_only") {
    if (!isFinitePositiveTimestamp(pending.openedAt)) { pending.openedAt = currentNow; changed = true; }
    if (!isFinitePositiveTimestamp(pending.wallDeadline)) { pending.wallDeadline = currentNow + PRIORITY_CLOCK.MAX_PRIORITY_WALL_MS; changed = true; }
    const wallExpired = currentNow >= Number(pending.wallDeadline);
    return { changed, expired: false, wallExpired, timerMode: "action_only", driftLevel: pending.driftLevel || "critical" };
  }

  const openedAt = Number(pending.openedAt);
  const deadline = Number(pending.deadline);
  const malformed = !isFinitePositiveTimestamp(openedAt)
    || !isFinitePositiveTimestamp(deadline)
    || deadline <= openedAt
    || deadline - openedAt < PRIORITY_CLOCK.MIN_MS
    || deadline - openedAt > PRIORITY_CLOCK.MAX_MS + PRIORITY_CLOCK.HARD_DRIFT_MARGIN_MS;

  if (malformed) {
    const fresh = createPriorityClock(duration, currentNow);
    Object.assign(pending, fresh);
    return { changed: true, expired: false, wallExpired: false, timerMode: fresh.timerMode, driftLevel: fresh.driftLevel, regenerated: true };
  }

  if (!isFinitePositiveTimestamp(pending.wallDeadline)) {
    pending.wallDeadline = openedAt + PRIORITY_CLOCK.MAX_PRIORITY_WALL_MS;
    changed = true;
  }

  const backwardsSkew = openedAt - currentNow;
  if (backwardsSkew > PRIORITY_CLOCK.CRITICAL_SKEW_MS) {
    enterActionOnly();
    return { changed, expired: false, wallExpired: false, timerMode: "action_only", driftLevel: "critical" };
  }

  let driftLevel = pending.driftLevel || "ok";
  if (backwardsSkew > PRIORITY_CLOCK.HARD_SKEW_MS && driftLevel !== "hard") {
    pending.deadline = deadline + PRIORITY_CLOCK.HARD_DRIFT_MARGIN_MS;
    pending.driftLevel = "hard";
    driftLevel = "hard";
    changed = true;
  } else if (backwardsSkew > PRIORITY_CLOCK.WARN_SKEW_MS && driftLevel === "ok") {
    pending.deadline = deadline + PRIORITY_CLOCK.DRIFT_MARGIN_MS;
    pending.driftLevel = "warn";
    driftLevel = "warn";
    changed = true;
  }

  const expired = currentNow >= Number(pending.deadline) + PRIORITY_CLOCK.SAFETY_GRACE_MS;
  return { changed, expired, wallExpired: false, timerMode: "normal", driftLevel };
}
