import assert from "node:assert/strict";
import test from "node:test";
import { markStaleParticipants } from "../app/api/rooms/presence.mjs";

test("both players absent for over one minute do not receive a fresh reconnect grace", () => {
  const now = Date.now();
  const room = {
    status: "started",
    pauseStartedAt: null,
    host: { lastSeenAt: now - 65_000, disconnectedAt: null },
    guest: { lastSeenAt: now - 64_000, disconnectedAt: null },
  };

  assert.equal(markStaleParticipants(room, now), true);
  assert.equal(room.host.disconnectedAt, now - 65_000);
  assert.equal(room.guest.disconnectedAt, now - 64_000);
  assert.equal(room.pauseStartedAt, now - 65_000);
  assert.ok(room.host.disconnectedAt + 60_000 <= now);
});

test("a recent heartbeat remains connected", () => {
  const now = Date.now();
  const room = {
    status: "started",
    pauseStartedAt: null,
    host: { lastSeenAt: now - 5_000, disconnectedAt: null },
    guest: { lastSeenAt: now - 4_000, disconnectedAt: null },
  };
  assert.equal(markStaleParticipants(room, now), false);
  assert.equal(room.host.disconnectedAt, null);
  assert.equal(room.guest.disconnectedAt, null);
});
