import assert from "node:assert/strict";
import test from "node:test";
import { orientOnlineGameForRole } from "../app/application/session/online-state-orientation.mjs";

const fixture = () => ({
  players: [{ heroId: "gimble" }, { heroId: "saymon" }],
  active: 0,
  winner: 1,
  pendingResponse: { responder: 1, actor: 0, action: "teste", passes: 1 },
  pendingAction: { type: "playCard", owner: 0, cardId: "x" },
  priorityStack: [{ kind: "command", actor: 1, command: { type: "playCard", owner: 1, cardId: "y" } }],
  priority: { model: "online-v2", owner: 1, mode: "response", window: "after-attackers" },
  stack: [{ id: "s", controller: 0, command: { type: "playCard", owner: 0, cardId: "x" } }],
  pendingDecision: { owner: 1, context: { owner: 0, decisionOwner: 1, targetOwner: 0 }, effect: { targetOwner: 1 } },
  pendingReposition: { owners: [0, 1], confirmed: [1], activeOwner: 0 },
  combatAction: { attackerOwner: 0, attackerUid: "a" },
  onlineCombat: { attackerOwner: 0, stage: "after-attackers", attackers: [], interaction: { stage: "declare-blockers", owner: 1, blockerOptions: [{ attackId: "a", defenderIds: ["d"] }] } },
  onlineFinalization: { owner: 0, stage: "finalization-priority" },
});

test("host orientation is a cloned identity view", () => {
  const source = fixture();
  const oriented = orientOnlineGameForRole(source, "host");
  assert.deepEqual(oriented, source);
  assert.notEqual(oriented, source);
});

test("guest orientation flips every canonical player index exactly once", () => {
  const source = fixture();
  const game = orientOnlineGameForRole(source, "guest");
  assert.equal(game.players[0].heroId, "saymon");
  assert.equal(game.players[1].heroId, "gimble");
  assert.equal(game.active, 1);
  assert.equal(game.winner, 0);
  assert.deepEqual(game.pendingResponse, { responder: 0, actor: 1, action: "teste", passes: 1 });
  assert.equal(game.pendingAction.owner, 1);
  assert.equal(game.priorityStack[0].actor, 0);
  assert.equal(game.priorityStack[0].command.owner, 0);
  assert.equal(game.priority.owner, 0);
  assert.equal(game.stack[0].controller, 1);
  assert.equal(game.stack[0].command.owner, 1);
  assert.equal(game.pendingDecision.owner, 0);
  assert.equal(game.pendingDecision.context.owner, 1);
  assert.equal(game.pendingDecision.context.decisionOwner, 0);
  assert.equal(game.pendingDecision.context.targetOwner, 1);
  assert.equal(game.pendingDecision.effect.targetOwner, 0);
  assert.deepEqual(game.pendingReposition.owners, [1, 0]);
  assert.deepEqual(game.pendingReposition.confirmed, [0]);
  assert.equal(game.pendingReposition.activeOwner, 1);
  assert.equal(game.combatAction.attackerOwner, 1);
  assert.equal(game.onlineCombat.attackerOwner, 1);
  assert.equal(game.onlineCombat.interaction.owner, 0);
  assert.deepEqual(game.onlineCombat.interaction.blockerOptions, [{ attackId: "a", defenderIds: ["d"] }], "card ids are perspective-independent");
  assert.equal(game.onlineFinalization.owner, 1);
  assert.equal(source.active, 0, "authoritative source is never mutated");
});

test("orientation is an involution for two-player online state", () => {
  const source = fixture();
  const twice = orientOnlineGameForRole(orientOnlineGameForRole(source, "guest"), "guest");
  assert.deepEqual(twice, source);
});
