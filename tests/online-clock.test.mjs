import assert from "node:assert/strict";
import test from "node:test";
import { reconcileOnlineClocks, shiftOnlineDeadlines } from "../app/api/rooms/online-clock.mjs";

const settings = { turnSeconds: 120, responseSeconds: 30 };
const now = 1_000_000;
const game = (overrides = {}) => ({ active: 0, winner: null, turnDeadline: now + 90_000, ...overrides });

test("opening a response pauses the active player's action clock", () => {
  const before = game();
  const after = game({ pendingResponse: { responder: 1, actor: 0, passes: 0 } });
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, null);
  assert.equal(after.turnTimeRemainingMs, 90_000);
  assert.equal(after.pendingResponse.deadline, now + 30_000);
});

test("canonical priority deadline mirrors the authoritative response deadline", () => {
  const before = game({ priority: { model: "online-v2", deadline: null } });
  const after = game({ priority: { model: "online-v2", deadline: null }, pendingResponse: { responder: 1, actor: 0, passes: 0 } });
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.pendingResponse.deadline, now + 30_000);
  assert.equal(after.priority.deadline, after.pendingResponse.deadline);
});

test("priority handoff refreshes only the response clock", () => {
  const before = game({ turnDeadline: null, turnTimeRemainingMs: 71_000, priority: { deadline: now - 1 }, pendingResponse: { responder: 1, actor: 0, passes: 0, deadline: now - 1 } });
  const after = structuredClone(before);
  after.pendingResponse = { ...after.pendingResponse, responder: 0, passes: 1, deadline: now - 1 };
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, null);
  assert.equal(after.turnTimeRemainingMs, 71_000);
  assert.equal(after.pendingResponse.deadline, now + 30_000);
  assert.equal(after.priority.deadline, now + 30_000);
});

test("closing the response window resumes the exact action-clock remainder", () => {
  const before = game({ turnDeadline: null, turnTimeRemainingMs: 54_321, priority: { deadline: now + 10_000 }, pendingResponse: { responder: 0, actor: 0, passes: 1, deadline: now + 10_000 } });
  const after = game({ turnDeadline: null, turnTimeRemainingMs: 54_321, priority: { deadline: now + 10_000 }, pendingResponse: null });
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, now + 54_321);
  assert.equal("turnTimeRemainingMs" in after, false);
  assert.equal(after.priority.deadline, null);
});

test("ordinary actions do not refill the turn timer", () => {
  const before = game({ turnDeadline: now + 42_000 });
  const after = game({ turnDeadline: now + 42_000 });
  reconcileOnlineClocks(before, after, settings, now + 5_000);
  assert.equal(after.turnDeadline, now + 42_000);
});

test("a new active player receives a fresh turn clock", () => {
  const before = game({ active: 0, turnDeadline: null, turnTimeRemainingMs: 1_000 });
  const after = game({ active: 1, turnDeadline: null });
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, now + 120_000);
  assert.equal("turnTimeRemainingMs" in after, false);
});

test("a new turn that immediately opens response priority keeps its full action clock paused", () => {
  const before = game({ active: 0, turnDeadline: null, turnTimeRemainingMs: 5_000 });
  const after = game({ active: 1, turnDeadline: null, pendingResponse: { responder: 1, actor: 1, passes: 0 } });
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, null);
  assert.equal(after.turnTimeRemainingMs, 120_000);
  assert.equal(after.pendingResponse.deadline, now + 30_000);
});

test("unitary blocker choice pauses the attacker's action clock and gets a response deadline", () => {
  const before = game({
    turnDeadline: null,
    turnTimeRemainingMs: 63_500,
    priority: { model: "online-v2", deadline: now + 2_000 },
    pendingResponse: { responder: 0, actor: 0, passes: 1, deadline: now + 2_000 },
    combatAction: { stage: "priority", attackerOwner: 0, attackerUid: "attacker" },
  });
  const after = game({
    turnDeadline: null,
    turnTimeRemainingMs: 63_500,
    priority: { model: "online-v2", deadline: null },
    pendingResponse: null,
    combatAction: { stage: "choosing", attackerOwner: 0, attackerUid: "attacker" },
  });
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, null);
  assert.equal(after.turnTimeRemainingMs, 63_500);
  assert.equal(after.combatAction.deadline, now + 30_000);
  assert.equal(after.priority.deadline, after.combatAction.deadline);
});

test("selecting a blocker resumes exactly the attacker's paused clock through charging/impact", () => {
  const before = game({
    turnDeadline: null,
    turnTimeRemainingMs: 37_777,
    priority: { deadline: now + 1_000 },
    combatAction: { stage: "choosing", attackerOwner: 0, attackerUid: "attacker", deadline: now + 1_000 },
  });
  const after = game({
    turnDeadline: null,
    turnTimeRemainingMs: 37_777,
    priority: { deadline: now + 1_000 },
    combatAction: { stage: "charging", attackerOwner: 0, attackerUid: "attacker", targetHero: true },
  });
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, now + 37_777);
  assert.equal("turnTimeRemainingMs" in after, false);
  assert.equal(after.priority.deadline, null);
  assert.equal("deadline" in after.combatAction, false);
});

test("reconnect pause shifts every absolute unitary Online interaction deadline together", () => {
  const paused = game({
    turnDeadline: now + 40_000,
    priority: { deadline: now + 10_000 },
    pendingResponse: { responder: 1, actor: 0, passes: 0, deadline: now + 10_000 },
    combatAction: { stage: "choosing", attackerOwner: 0, attackerUid: "attacker", deadline: now + 15_000 },
    pendingReposition: { deadline: now + 20_000 },
    pendingDecision: { deadline: now + 25_000 },
  });
  shiftOnlineDeadlines(paused, 12_345);
  assert.equal(paused.turnDeadline, now + 52_345);
  assert.equal(paused.pendingResponse.deadline, now + 22_345);
  assert.equal(paused.priority.deadline, now + 22_345);
  assert.equal(paused.combatAction.deadline, now + 27_345);
  assert.equal(paused.pendingReposition.deadline, now + 32_345);
  assert.equal(paused.pendingDecision.deadline, now + 37_345);
});
