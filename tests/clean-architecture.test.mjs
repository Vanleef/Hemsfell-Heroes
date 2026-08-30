import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertGameCommandEnvelope, GameCommandType } from "../app/rules-engine/commands/game-command.mjs";
import { assertMatchStateShape, cloneMatchState, nextTurnPhase, TURN_PHASE_ORDER } from "../app/rules-engine/state/match-state.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("View depends on application, model and catalog boundaries", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /from "\.\/application\/commands\/game-command-service\.mjs"/);
  assert.match(page, /from "\.\/application\/session\/online-session\.mjs"/);
  assert.match(page, /from "\.\/model\/game-state"/);
  assert.match(page, /from "\.\/data\/catalog\/generated-card-catalog"/);
  assert.doesNotMatch(page, /from "\.\/rules-engine\/engine\.mjs"/);
  assert.doesNotMatch(page, /from "\.\/cards\.generated\.json"/);
});

test("application command service delegates legality without owning rules", async () => {
  const service = await read("app/application/commands/game-command-service.mjs");
  assert.match(service, /assertMatchStateShape/);
  assert.match(service, /assertGameCommandEnvelope/);
  assert.match(service, /executeRulesCommand\(state, command, options\)/);
  assert.doesNotMatch(service, /not-enough-energy|invalid-target|summoning-sickness/);
});

test("turn phase FSM is declarative and deterministic", () => {
  assert.deepEqual(TURN_PHASE_ORDER, ["manutencao", "principal", "combate", "fim"]);
  assert.equal(nextTurnPhase("manutencao"), "principal");
  assert.equal(nextTurnPhase("principal"), "combate");
  assert.equal(nextTurnPhase("combate"), "fim");
  assert.equal(nextTurnPhase("fim"), "manutencao");
  assert.throws(() => nextTurnPhase("setup"), /unknown-turn-phase/);
});

test("match-state guard and clone preserve the authoritative input", () => {
  const state = { players: [{ hand: [] }, { hand: [] }], active: 0, phase: "principal" };
  assert.equal(assertMatchStateShape(state), state);
  const cloned = cloneMatchState(state);
  cloned.players[0].hand.push("changed");
  assert.deepEqual(state.players[0].hand, []);
  assert.throws(() => assertMatchStateShape({ ...state, active: 2 }), /invalid-active-player/);
});

test("command envelope separates shape validation from rules validation", () => {
  const command = { type: GameCommandType.PLAY_CARD, owner: 0, cardId: "p1" };
  assert.equal(assertGameCommandEnvelope(command), command);
  assert.throws(() => assertGameCommandEnvelope({ owner: 0 }), /type-missing/);
  assert.throws(() => assertGameCommandEnvelope({ type: "playCard", owner: 3 }), /invalid-owner/);
});

test("organized application modules expose contracts without root facades", async () => {
  const [session, orientation, storeFacade] = await Promise.all([
    import("../app/application/session/online-session.mjs"),
    import("../app/application/session/online-state-orientation.mjs"),
    read("app/api/rooms/store-runtime.ts"),
  ]);
  assert.equal(typeof session.loadOnlineSession, "function");
  assert.equal(typeof orientation.orientOnlineGameForRole, "function");
  assert.match(storeFacade, /export \* from "\.\.\/\.\.\/infrastructure\/rooms\/room-repository"/);
});

test("API routes use infrastructure and data boundaries", async () => {
  const [createRoute, roomRoute, initialGame] = await Promise.all([
    read("app/api/rooms/route.ts"),
    read("app/api/rooms/[id]/route.ts"),
    read("app/api/rooms/initial-game.ts"),
  ]);
  assert.match(createRoute, /infrastructure\/rooms\/room-repository/);
  assert.match(roomRoute, /infrastructure\/rooms\/room-repository/);
  assert.match(roomRoute, /data\/catalog\/generated-card-catalog/);
  assert.match(initialGame, /data\/catalog\/generated-card-catalog/);
});
