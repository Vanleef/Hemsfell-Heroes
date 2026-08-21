import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "hemsfell-room-test-"));
process.env.HEMSFELL_DEV_ROOM_DIR = root;
const { readDevelopmentRoom, writeDevelopmentRoom } = await import(`../app/api/rooms/dev-store.mjs?test=${Date.now()}`);

test("development room persists across independent reads and revisions", async () => {
  const room = { id: "room-test-abc123", revision: 0, status: "waiting", host: { token: "secret" }, guest: null };
  await writeDevelopmentRoom(room);
  assert.deepEqual(await readDevelopmentRoom(room.id), room);

  const next = { ...room, revision: 1, status: "deck-selection" };
  await writeDevelopmentRoom(next);
  assert.deepEqual(await readDevelopmentRoom(room.id), next);
});

test("development room rejects duplicate and stale writes", async () => {
  const room = { id: "room-test-def456", revision: 0, status: "waiting" };
  await writeDevelopmentRoom(room);
  await assert.rejects(() => writeDevelopmentRoom(room), /stale room revision/);
  await assert.rejects(() => writeDevelopmentRoom({ ...room, revision: 2 }), /stale room revision/);
});

test("development room accepts only one concurrent writer for each revision", async () => {
  const room = { id: "room-test-race789", revision: 0, status: "started", value: "base" };
  await writeDevelopmentRoom(room);

  const writes = await Promise.allSettled([
    writeDevelopmentRoom({ ...room, revision: 1, value: "command" }),
    writeDevelopmentRoom({ ...room, revision: 1, value: "heartbeat" }),
  ]);

  assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = writes.find((result) => result.status === "rejected");
  assert.match(String(rejected?.reason?.message), /stale room revision/);
  assert.equal((await readDevelopmentRoom(room.id)).revision, 1);
});

test.after(async () => {
  await rm(root, { recursive: true, force: true });
});
