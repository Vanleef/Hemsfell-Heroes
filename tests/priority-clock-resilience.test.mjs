import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIORITY_CLOCK,
  createPriorityClock,
  normalizePriorityClock,
  serverNowMs,
  setServerNowProviderForTests,
} from "../app/api/rooms/time.mjs";

const duration = 30_000;

test.afterEach(() => setServerNowProviderForTests(null));

test("serverNowMs is injectable and honors the server-only emergency offset", () => {
  const previous = process.env.HEMSFELL_TIME_OFFSET_MS;
  process.env.HEMSFELL_TIME_OFFSET_MS = "125";
  setServerNowProviderForTests(() => 1_000_000);
  assert.equal(serverNowMs(), 1_000_125);
  if (previous == null) delete process.env.HEMSFELL_TIME_OFFSET_MS;
  else process.env.HEMSFELL_TIME_OFFSET_MS = previous;
});

test("new priority clock is finite, future and within configured bounds", () => {
  const clock = createPriorityClock(duration, 2_000_000);
  assert.equal(clock.openedAt, 2_000_000);
  assert.equal(clock.deadline, 2_030_000);
  assert.equal(clock.timerMode, "normal");
  assert.ok(clock.deadline > clock.openedAt);
  assert.ok(clock.deadline - clock.openedAt >= PRIORITY_CLOCK.MIN_MS);
  assert.ok(clock.deadline - clock.openedAt <= PRIORITY_CLOCK.MAX_MS);
});

test("zero or malformed deadline regenerates instead of producing an instant timeout", () => {
  const pending = { responder: 1, actor: 0, passes: 0, openedAt: 0, deadline: 0 };
  const state = normalizePriorityClock(pending, duration, 3_000_000);
  assert.equal(state.regenerated, true);
  assert.equal(state.expired, false);
  assert.equal(pending.openedAt, 3_000_000);
  assert.equal(pending.deadline, 3_030_000);
});

test("a valid elapsed deadline remains expired and is not regenerated", () => {
  const pending = { responder: 1, actor: 0, passes: 0, openedAt: 4_000_000, deadline: 4_030_000, timerMode: "normal" };
  const state = normalizePriorityClock(pending, duration, 4_031_000);
  assert.equal(state.expired, true);
  assert.equal(pending.openedAt, 4_000_000);
  assert.equal(pending.deadline, 4_030_000);
});

test("HARD backwards drift grants one bounded margin without changing responder", () => {
  const pending = { responder: 1, actor: 0, passes: 0, openedAt: 5_010_000, deadline: 5_040_000, timerMode: "normal", driftLevel: "ok" };
  const state = normalizePriorityClock(pending, duration, 5_002_000);
  assert.equal(state.driftLevel, "hard");
  assert.equal(pending.responder, 1);
  assert.equal(pending.deadline, 5_045_000);
  const second = normalizePriorityClock(pending, duration, 5_002_000);
  assert.equal(second.changed, false);
  assert.equal(pending.deadline, 5_045_000);
});

test("CRITICAL backwards drift falls back to action_only with a wall ceiling", () => {
  const pending = { responder: 0, actor: 1, passes: 0, openedAt: 6_020_000, deadline: 6_050_000, timerMode: "normal", driftLevel: "ok" };
  const state = normalizePriorityClock(pending, duration, 6_000_000);
  assert.equal(state.timerMode, "action_only");
  assert.equal(pending.deadline, null);
  assert.equal(pending.responder, 0);
  assert.ok(Number(pending.wallDeadline) > 6_000_000);
});

test("action_only never timer-autopasses before the wall ceiling", () => {
  const pending = { responder: 0, actor: 1, passes: 0, openedAt: 7_000_000, deadline: null, timerMode: "action_only", wallDeadline: 7_100_000, driftLevel: "critical" };
  const before = normalizePriorityClock(pending, duration, 7_050_000);
  assert.equal(before.expired, false);
  assert.equal(before.wallExpired, false);
  const after = normalizePriorityClock(pending, duration, 7_100_001);
  assert.equal(after.wallExpired, true);
});
