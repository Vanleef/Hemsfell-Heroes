import assert from "node:assert/strict";
import test from "node:test";
import { markStaleParticipants } from "../app/api/rooms/presence.mjs";

test("throttled or minimized tabs are never disconnected by missing heartbeats", () => {
  const now = Date.now();
  const room = {
    status: "started",
    pauseStartedAt: null,
    host: { lastSeenAt: now - 65_000, disconnectedAt: null },
    guest: { lastSeenAt: now - 64_000, disconnectedAt: null },
  };

  assert.equal(markStaleParticipants(room, now), false);
  assert.equal(room.host.disconnectedAt, null);
  assert.equal(room.guest.disconnectedAt, null);
  assert.equal(room.pauseStartedAt, null);
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
