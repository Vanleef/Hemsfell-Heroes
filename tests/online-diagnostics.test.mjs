import assert from "node:assert/strict";
import test from "node:test";

import { buildOnlineDiagnostic } from "../app/api/rooms/online-diagnostics.mjs";

test("Online diagnostic snapshot includes timing metadata but never hidden gameplay payloads", () => {
  const room = {
    id: "room-test-deadbeef",
    revision: 17,
    host: { token: "host-secret" },
    guest: { token: "guest-secret" },
    game: {
      active: 1,
      phase: "combate",
      priority: { owner: 0, window: "after-blockers", stackDepth: 2 },
      stack: [{ command: { targetIds: ["secret-target"] } }],
      onlineCombat: { stage: "after-blockers", attackers: [{ attackerId: "secret-card" }] },
      players: [{ hand: [{ name: "Secret A" }], deck: [{ name: "Secret B" }] }, { hand: [], deck: [] }],
    },
  };
  const event = buildOnlineDiagnostic(room, "command-rejected", {
    role: "guest",
    commandType: "passPriority",
    reason: "not your priority",
    baseRevision: 16,
    command: { targetIds: ["must-not-leak"] },
    token: "must-not-leak",
  }, 1234);

  assert.deepEqual(event, {
    at: 1234,
    kind: "command-rejected",
    roomId: "room-test-deadbeef",
    revision: 17,
    active: 1,
    phase: "combate",
    priorityOwner: 0,
    priorityWindow: "after-blockers",
    stackDepth: 2,
    combatStage: "after-blockers",
    role: "guest",
    commandType: "passPriority",
    reason: "not your priority",
    baseRevision: 16,
  });
  const serialized = JSON.stringify(event);
  for (const secret of ["host-secret", "guest-secret", "secret-target", "secret-card", "Secret A", "Secret B", "must-not-leak"]) assert.equal(serialized.includes(secret), false);
});

test("Online diagnostic text is bounded before reaching server logs", () => {
  const event = buildOnlineDiagnostic({ id: "x".repeat(200), revision: 0, game: null }, "k".repeat(200), { reason: "r".repeat(300), commandType: "c".repeat(100) }, 1);
  assert.equal(event.roomId.length, 96);
  assert.equal(event.kind.length, 64);
  assert.equal(event.reason.length, 160);
  assert.equal(event.commandType.length, 64);
});
