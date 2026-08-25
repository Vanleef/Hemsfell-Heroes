import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [machine, route, initial, store] = await Promise.all([
  readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/initial-game.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8"),
]);

test("online deck selection validates and stores only a private UserDeck", () => {
  assert.match(machine, /userDeck\?: UserDeck \| null/);
  assert.match(route, /validateUserDeck\(body\.userDeck/);
  assert.match(route, /current\.userDeck = selectedUserDeck/);
  assert.doesNotMatch(store, /host: \{[^}]*userDeck/);
  assert.doesNotMatch(store, /guest: room\.guest \? \{[^}]*userDeck/);
});

test("server-owned bootstrap consumes validated host and guest deck definitions", () => {
  assert.match(route, /createInitialOnlineGame\([^;]*room\.host\.userDeck, room\.guest\.userDeck\)/);
  assert.match(initial, /resolveConfiguredDeck/);
  assert.match(initial, /expandUserDeckMain/);
  assert.match(initial, /resolveUserDeckExtra/);
  assert.match(initial, /validation\.deck\.heroId !== id/);
});
