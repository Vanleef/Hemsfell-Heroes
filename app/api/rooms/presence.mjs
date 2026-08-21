export const PRESENCE_STALE_MS = 12_000;

/**
 * Convert missed heartbeats into authoritative disconnect timestamps.
 *
 * The timestamp is the last confirmed presence, not the moment another tab
 * happens to notice the absence. That prevents a returning player from
 * accidentally receiving a brand-new sixty-second reconnect window.
 */
export function markStaleParticipants(room, now = Date.now()) {
  if (!room || !["mulligan", "started"].includes(room.status)) return false;
  let changed = false;
  for (const role of ["host", "guest"]) {
    const participant = room[role];
    const lastSeenAt = Number(participant?.lastSeenAt);
    if (!participant || participant.disconnectedAt || !Number.isFinite(lastSeenAt) || now - lastSeenAt < PRESENCE_STALE_MS) continue;
    participant.disconnectedAt = lastSeenAt;
    room.pauseStartedAt = room.pauseStartedAt == null
      ? lastSeenAt
      : Math.min(Number(room.pauseStartedAt), lastSeenAt);
    changed = true;
  }
  return changed;
}
