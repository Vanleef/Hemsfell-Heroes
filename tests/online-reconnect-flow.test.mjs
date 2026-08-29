import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, machine, clock, presence, runtime, layout] = await Promise.all([
  readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/online-clock.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/presence.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/application/online/online-reconnect-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
]);

test("resume shifts every Online deadline through the shared clock helper", () => {
  assert.match(route, /import \{ shiftOnlineDeadlines \} from "\.\.\/online-clock\.mjs"/);
  assert.match(route, /const awaySince = activeParticipant\.disconnectedAt/);
  assert.match(route, /const resumedAt = Date\.now\(\)/);
  assert.match(route, /const pauseStartedAt = room\.pauseStartedAt \?\? awaySince/);
  assert.match(route, /const pausedFor = Math\.max\(0, resumedAt - pauseStartedAt\)/);
  assert.match(route, /shiftOnlineDeadlines\(room\.game, pausedFor\)/);
  assert.match(route, /participant\.mulliganDeadline \+= pausedFor/);

  assert.match(clock, /export function shiftOnlineDeadlines/);
  assert.match(clock, /shiftDeadline\(game, "turnDeadline", milliseconds\)/);
  assert.match(clock, /for \(const target of \[game\.pendingResponse, game\.priority, game\.combatAction, game\.pendingReposition, game\.pendingDecision\]\)/);
  assert.match(clock, /shiftDeadline\(target, "deadline", milliseconds\)/);
});

test("resume is idempotent and gameplay cannot silently clear a disconnected participant", () => {
  assert.match(route, /if \(!awaySince\) return NextResponse\.json\(roomView\(room, true, role\), noStore\)/);
  assert.match(route, /if \(activeParticipant\.disconnectedAt\) return NextResponse\.json\(\{ error: "resume required"/);
  assert.match(route, /activeParticipant\.noActionTimeouts = 0/);
  assert.match(route, /activeParticipant\.disconnectAfterOpponentMaintenance = false/);
  assert.doesNotMatch(route, /activeParticipant\.disconnectedAt = null;\s*if \(body\.action === "select"\)/);
});

test("bfcache restoration and network recovery explicitly resume the authenticated room", () => {
  assert.match(layout, /<OnlineReconnectRuntime \/>/);
  assert.match(runtime, /window\.addEventListener\("pageshow", onPageShow\)/);
  assert.match(runtime, /window\.addEventListener\("online", onOnline\)/);
  assert.match(runtime, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(runtime, /action: "resume", token: session\.token/);
  assert.match(runtime, /navigator|document\.visibilityState/);
  assert.match(runtime, /inFlight\.current/);
  assert.match(runtime, /loadOnlineSession\(localStorage, roomId\)/);
});

test("authenticated polling is read-only and never turns throttling into a disconnect", () => {
  assert.match(machine, /lastSeenAt\?: number \| null/);
  assert.match(presence, /missing polls must never be interpreted as a disconnect/);
  assert.match(presence, /return false/);
  assert.doesNotMatch(route, /heartbeatParticipant/);
  assert.doesNotMatch(route, /PRESENCE_STALE_MS/);
  assert.doesNotMatch(route, /otherParticipant\.disconnectedAt/);
});

test("only explicit disconnect or authoritative inactivity sets disconnectedAt", () => {
  assert.doesNotMatch(presence, /disconnectedAt\s*=/);
  assert.doesNotMatch(route, /persistStalePresence/);
  assert.match(route, /body\.action === "disconnect"/);
  assert.match(machine, /"inactivity-disconnect"/);
});

test("the whole match is frozen while either participant is inside reconnect grace", () => {
  assert.match(machine, /export function reconnectPause\(room: Room, now = Date\.now\(\)\)/);
  assert.match(machine, /const until = disconnected\.at \+ 60_000/);
  assert.match(machine, /if \(reconnectPause\(room\)\) return \{ ok: false, status: 409, error: "match paused for reconnect" \}/);
  assert.match(machine, /if \(!room\.game \|\| room\.status !== "started" \|\| reconnectPause\(room\)\) return false/);
  const pauseGuards = machine.match(/match paused for reconnect/g) || [];
  assert.equal(pauseGuards.length, 2, "both authoritative commands and legacy sync are blocked during reconnect grace");
});

test("disconnect grace expiry clears every canonical interactive checkpoint", () => {
  assert.match(machine, /function finishDisconnectedMatch\(room: Room, loser: 0 \| 1\)/);
  assert.match(machine, /game\.pendingResponse = null/);
  assert.match(machine, /game\.pendingAction = undefined/);
  assert.match(machine, /game\.priorityStack = undefined/);
  assert.match(machine, /game\.stack = \[\]/);
  assert.match(machine, /game\.combatAction = null/);
  assert.match(machine, /game\.onlineCombat = undefined/);
  assert.match(machine, /game\.onlineFinalization = undefined/);
  assert.match(machine, /game\.pendingDecision = null/);
  assert.match(machine, /game\.pendingReposition = null/);
  assert.match(machine, /game\.turnDeadline = null/);
  assert.match(machine, /delete game\.turnTimeRemainingMs/);
  assert.match(machine, /mode: "none"/);
  assert.match(machine, /owner: null/);
  assert.match(machine, /stackDepth: 0/);
  assert.match(machine, /room\.status = "finished"/);
});

test("reconnect grace continues to be exactly sixty seconds", () => {
  assert.match(machine, /disconnected\.at \+ 60_000 > now/);
  assert.match(route, /resumedAt < awaySince \+ 60_000/);
});
