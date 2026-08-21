import test from "node:test";
import assert from "node:assert/strict";
import {
  OnlineInteractionState,
  assertOnlineInteractionInvariant,
  commandTypesForOnlineState,
  deriveOnlineInteractionState,
  inputOwnerForOnlineState,
  syncPriorityMetadata,
} from "../app/rules-engine/priority-state.mjs";

const base = (overrides = {}) => ({
  active: 0,
  phase: "principal",
  winner: null,
  players: [{}, {}],
  ...overrides,
});

test("principal exposes active-player action priority", () => {
  const state = syncPriorityMetadata(base());
  assert.equal(state.priority.model, "online-v3");
  assert.equal(deriveOnlineInteractionState(state), OnlineInteractionState.ACTION_PRIORITY);
  assert.equal(inputOwnerForOnlineState(state), 0);
  assert.deepEqual(commandTypesForOnlineState(state), ["playCard", "activate", "activateHero", "evolveHero", "advancePhase"]);
});

test("response window has exactly the responder as input owner", () => {
  const state = syncPriorityMetadata(base({
    pendingAction: { type: "playCard", owner: 0 },
    pendingResponse: { actor: 0, responder: 1, action: "teste", passes: 0 },
  }));
  assert.equal(deriveOnlineInteractionState(state), OnlineInteractionState.RESPONSE_PRIORITY);
  assert.equal(inputOwnerForOnlineState(state), 1);
  assert.equal(state.priority.owner, 1);
  assert.ok(state.priority.commandTypes.includes("passPriority"));
});

test("unit combat distinguishes idle and blocker ownership", () => {
  const idle = syncPriorityMetadata(base({ phase: "combate" }));
  assert.equal(deriveOnlineInteractionState(idle), OnlineInteractionState.COMBAT_IDLE);
  assert.equal(inputOwnerForOnlineState(idle), 0);
  assert.deepEqual(idle.priority.commandTypes, ["declareAttack", "advancePhase"]);

  const blocking = syncPriorityMetadata(base({
    phase: "combate",
    combatAction: { stage: "choosing", attackerOwner: 0, attackerUid: "a" },
  }));
  assert.equal(deriveOnlineInteractionState(blocking), OnlineInteractionState.AWAITING_BLOCKER);
  assert.equal(inputOwnerForOnlineState(blocking), 1);
  assert.deepEqual(blocking.priority.commandTypes, ["selectDefender"]);
});

test("interactive decision cannot coexist with response priority", () => {
  const state = base({
    pendingDecision: { owner: 0, kind: "choice" },
    pendingResponse: { actor: 0, responder: 1, action: "teste", passes: 0 },
  });
  assert.throws(() => assertOnlineInteractionInvariant(state), /decision-and-response-overlap/);
});

test("blocker choice cannot overlap response priority", () => {
  const state = base({
    phase: "combate",
    combatAction: { stage: "choosing", attackerOwner: 0, attackerUid: "a" },
    pendingResponse: { actor: 0, responder: 1, action: "ataque", passes: 0 },
  });
  assert.throws(() => assertOnlineInteractionInvariant(state), /blocker-and-response-overlap/);
});
