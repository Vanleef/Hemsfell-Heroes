import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [machine, route, page, presence] = await Promise.all([
  readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/presence.mjs", import.meta.url), "utf8"),
]);

test("first no-action turn timeout arms one server-side inactivity strike", () => {
  assert.match(machine, /turnHadAction\?: boolean/);
  assert.match(machine, /noActionTimeouts\?: number/);
  assert.match(machine, /lastNoActionTimeoutRound\?: number \| null/);
  assert.match(machine, /current\.lastNoActionTimeoutRound === round/);
  assert.match(machine, /current\.noActionTimeouts = Math\.min\(2/);
});

test("the next turn has exactly fifteen seconds and any accepted own-turn command clears probation", () => {
  assert.match(machine, /activeParticipant\.noActionTimeouts \?\? 0\) === 1/);
  assert.match(machine, /after\.turnDeadline = now \+ 15_000/);
  assert.match(machine, /recordAcceptedPlayerAction\(room, owner, before\)/);
  assert.match(machine, /current\.noActionTimeouts = 0/);
  assert.match(machine, /current\.disconnectAfterOpponentMaintenance = false/);
});

test("a second empty turn disconnects only after the opponent leaves Maintenance", () => {
  assert.match(machine, /current\.disconnectAfterOpponentMaintenance = true/);
  assert.match(machine, /before\.phase === "manutencao" && after\.phase !== "manutencao"/);
  assert.match(machine, /absentOwner = \(1 - after\.active\)/);
  assert.match(machine, /absent\.disconnectedAt = now/);
  assert.match(machine, /room\.pauseStartedAt = now/);
  assert.match(machine, /disconnected\.at \+ 60_000/);
});

test("background throttling is harmless while close, navigation and menu exit are explicit", () => {
  assert.match(presence, /missing polls must never be interpreted as a disconnect/);
  assert.doesNotMatch(route, /persistStalePresence|PRESENCE_STALE_MS/);
  assert.match(page, /window\.addEventListener\("pagehide",notifyDisconnect\)/);
  assert.match(page, /leaveOnlineMatch=[\s\S]*?signalOnlineDisconnect\(\)/);
  assert.match(page, /Você foi desconectado por inatividade/);
  assert.match(page, /Retornar à partida/);
});
