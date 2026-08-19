import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const roomStore = await readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8");

test("invite lookup checks every configured durable store before reporting not found", () => {
  assert.match(roomStore, /const failures: unknown\[\] = \[\]/);
  assert.match(roomStore, /const room = await readSupabase\(id\);[\s\S]*?if \(room\) return room;[\s\S]*?const room = await readSupabaseStorageRoom\(id\);/);
  assert.match(roomStore, /const room = await readSupabaseStorageRoom\(id\);[\s\S]*?if \(room\) return room;[\s\S]*?const room = await readBlob\(id\);/);
  assert.match(roomStore, /if \(failures\.length\) throw failures\[failures\.length - 1\]/);
  assert.match(roomStore, /if \(attemptedStore\) return null/);
});
