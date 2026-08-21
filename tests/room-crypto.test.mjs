import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { openRoom, sealRoom } from "../app/api/rooms/room-crypto.mjs";

test("durable room payloads hide participant tokens and private game state", () => {
  const room = { id: "room-secret", revision: 4, host: { token: "host-secret" }, game: { players: [{ hand: ["hidden-card"] }] } };
  const sealed = sealRoom(room, "store-secret");
  assert.doesNotMatch(sealed, /host-secret|hidden-card/);
  assert.deepEqual(openRoom(sealed, "store-secret"), room);
  assert.throws(() => openRoom(sealed, "wrong-secret"));
});

test("Blob adapter negotiates private or public stores but always seals payloads", async () => {
  const store = await readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8");
  assert.match(store, /\["private", "public"\]/);
  assert.match(store, /sealRoom\(room, blobToken\(\)\)/);
  assert.match(store, /openRoom\(await new Response\(result\.stream\)\.text\(\), blobToken\(\)\)/);
  assert.doesNotMatch(store, /put\(roomPath\(room\.id\), JSON\.stringify\(room\)/);
});
