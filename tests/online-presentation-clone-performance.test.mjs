import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridge = await readFile(new URL("../app/presentation/runtime/presentation-event-bridge.tsx", import.meta.url), "utf8");

test("online presentation reuses already-oriented immutable snapshots instead of deep-cloning each revision", () => {
  assert.match(bridge, /snapshots\.set\(roomId, \{ revision, game: after, isHost, status \}\)/);
  assert.match(bridge, /emit\(\{ before: ack\.before, after, command: ack\.command/);
  assert.match(bridge, /before: previous\.game,[\s\S]*?after,/);
  assert.match(bridge, /const before = isCommand && snapshot \? snapshot\.game : null/);
  assert.doesNotMatch(bridge, /game: clone\(after\)/);
  assert.doesNotMatch(bridge, /before: clone\(previous\.game\)/);
  assert.doesNotMatch(bridge, /after: clone\(after\)/);
});
