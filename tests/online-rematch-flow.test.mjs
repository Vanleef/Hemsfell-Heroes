import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { closeFinishedRoom, requestOnlineRematch } from "../app/api/rooms/online-rematch.mjs";

const participant = (heroId) => ({ heroId, userDeck: null, rematchRequested: false, mulliganDone: true, mulliganCount: 2, disconnectedAt: null });
const room = () => ({
  status: "finished",
  host: participant("gimble"),
  guest: participant("goblin"),
  settings: { startingLife: 30 },
  game: { winner: 0 },
  startingRole: null,
  pauseStartedAt: 10,
});
const createGame = (hostHero, guestHero, active, life) => ({ players: [{ heroId: hostHero, life }, { heroId: guestHero, life }], active, winner: null });

test("online rematch waits for both players and then starts a fresh mulligan", () => {
  const state = room();
  const first = requestOnlineRematch(state, "host", createGame, () => .1, 1_000);
  assert.deepEqual(first, { ok: true, started: false });
  assert.equal(state.host.rematchRequested, true);
  assert.equal(state.status, "finished");

  const second = requestOnlineRematch(state, "guest", createGame, () => .1, 2_000);
  assert.deepEqual(second, { ok: true, started: true });
  assert.equal(state.status, "mulligan");
  assert.equal(state.startingRole, "host");
  assert.equal(state.game.active, 0);
  assert.equal(state.game.winner, null);
  assert.equal(state.host.rematchRequested, false);
  assert.equal(state.guest.rematchRequested, false);
  assert.equal(state.host.mulliganDeadline, 32_000);
  assert.equal(state.guest.mulliganDeadline, 32_000);
});

test("leaving a finished match closes it for both participants", () => {
  const state = room();
  state.host.rematchRequested = true;
  assert.equal(closeFinishedRoom(state), true);
  assert.equal(state.status, "closed");
  assert.equal(state.game, null);
  assert.equal(state.host.rematchRequested, false);
  assert.equal(closeFinishedRoom(state), false);
});

test("page and route expose the authoritative rematch and leave protocol", async () => {
  const [page, route, store] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /body\.action === "rematch"/);
  assert.match(route, /body\.action === "leave"/);
  assert.match(store, /rematchRequested/);
  assert.match(page, /A partida online foi encerrada\./);
  assert.match(page, /action:status==="finished"\?"leave":"disconnect"/);
});
