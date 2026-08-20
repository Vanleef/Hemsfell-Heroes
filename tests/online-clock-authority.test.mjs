import assert from "node:assert/strict";
import test from "node:test";
import { reconcileOnlineClocks } from "../app/api/rooms/online-clock.mjs";

const settings = { turnSeconds: 120, responseSeconds: 20 };

test("target/effect decisions pause and later restore the active turn clock", () => {
  const now = 1_000_000;
  const before = { active: 0, winner: null, turnDeadline: now + 60_000, priority: {} };
  const choosing = { active: 0, winner: null, pendingDecision: { kind: "targets", owner: 0 }, priority: {} };

  reconcileOnlineClocks(before, choosing, settings, now);
  assert.equal(choosing.turnDeadline, null);
  assert.equal(choosing.turnTimeRemainingMs, 60_000);

  const responding = {
    ...structuredClone(choosing),
    pendingDecision: null,
    pendingResponse: { responder: 1, actor: 0, action: "efeito", passes: 0 },
    priority: {},
  };
  reconcileOnlineClocks(choosing, responding, settings, now + 15_000);
  assert.equal(responding.turnDeadline, null);
  assert.equal(responding.turnTimeRemainingMs, 60_000);
  assert.equal(responding.pendingResponse.deadline, now + 35_000);

  const resumed = { ...structuredClone(responding), pendingResponse: null, priority: {} };
  reconcileOnlineClocks(responding, resumed, settings, now + 20_000);
  assert.equal(resumed.turnDeadline, now + 80_000);
  assert.equal("turnTimeRemainingMs" in resumed, false);
});

test("reposition decisions also pause the active turn clock", () => {
  const now = 2_000_000;
  const before = { active: 0, winner: null, turnDeadline: now + 25_000, priority: {} };
  const after = { active: 0, winner: null, pendingReposition: { owners: [0], confirmed: [], activeOwner: 0 }, priority: {} };
  reconcileOnlineClocks(before, after, settings, now);
  assert.equal(after.turnDeadline, null);
  assert.equal(after.turnTimeRemainingMs, 25_000);
});
