import assert from "node:assert/strict";
import test from "node:test";
import { propagateWeddingRingLinks } from "../app/rules-engine/match-integrity.mjs";

const player = (life) => ({
  life,
  board: [],
  support: [],
  terrain: null,
  hand: [],
  grave: [],
  obscuro: [],
});

test("hero at zero life loses immediately even during own turn", () => {
  const before = { active: 0, winner: null, players: [player(1), player(30)] };
  const after = structuredClone(before);
  after.players[0].life = 0;
  after.pendingDecision = { kind: "choice", owner: 0 };
  after.pendingResponse = { responder: 1, actor: 0, action: "effect" };
  after.pendingAction = { type: "playCard", owner: 0 };
  after.priorityStack = [{ kind: "command" }];
  after.combatAction = { stage: "priority" };

  propagateWeddingRingLinks(before, after);

  assert.equal(after.winner, 1);
  assert.equal(after.pendingDecision, null);
  assert.equal(after.pendingResponse, null);
  assert.equal(after.pendingAction, undefined);
  assert.deepEqual(after.priorityStack, []);
  assert.equal(after.combatAction, null);
});

test("opponent at zero life awards the active player the win", () => {
  const before = { active: 0, winner: null, players: [player(12), player(1)] };
  const after = structuredClone(before);
  after.players[1].life = -2;

  propagateWeddingRingLinks(before, after);

  assert.equal(after.winner, 0);
});
