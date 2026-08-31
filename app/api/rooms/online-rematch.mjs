const participantFor = (room, role) => role === "host" ? room.host : room.guest;

export function requestOnlineRematch(room, role, createGame, random = Math.random, now = Date.now()) {
  if (room.status !== "finished" || !room.game) return { ok: false, error: "rematch unavailable" };
  const current = participantFor(room, role);
  if (!current || !room.guest || !room.host.heroId || !room.guest.heroId) return { ok: false, error: "participants unavailable" };
  current.rematchRequested = true;
  if (!room.host.rematchRequested || !room.guest.rematchRequested) return { ok: true, started: false };

  room.startingRole = random() < .5 ? "host" : "guest";
  const active = room.startingRole === "host" ? 0 : 1;
  room.game = createGame(room.host.heroId, room.guest.heroId, active, room.settings.startingLife, room.host.userDeck, room.guest.userDeck);
  room.game.turnDeadline = null;
  const mulliganDeadline = now + 30_000;
  for (const participant of [room.host, room.guest]) {
    participant.rematchRequested = false;
    participant.mulliganDone = false;
    participant.mulliganCount = 0;
    participant.mulliganDeadline = mulliganDeadline;
    participant.disconnectedAt = null;
    participant.lastSeenAt = now;
    participant.turnHadAction = false;
    participant.noActionTimeouts = 0;
    participant.lastNoActionTimeoutRound = null;
    participant.probationRound = null;
    participant.disconnectAfterOpponentMaintenance = false;
  }
  room.pauseStartedAt = null;
  room.status = "mulligan";
  return { ok: true, started: true };
}

export function closeFinishedRoom(room) {
  if (room.status !== "finished") return false;
  room.status = "closed";
  room.game = null;
  room.pauseStartedAt = null;
  room.host.rematchRequested = false;
  if (room.guest) room.guest.rematchRequested = false;
  return true;
}
