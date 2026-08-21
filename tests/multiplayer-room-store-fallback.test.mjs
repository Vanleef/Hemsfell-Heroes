import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const roomStore = await readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8");

test("invite lookup checks every configured durable store and reconciles by revision before reporting not found", () => {
  assert.match(roomStore, /const failures: unknown\[\] = \[\]/);
  assert.match(roomStore, /const candidates: Array<\{ source: "table" \| "storage" \| "blob"; priority: number; room: Room \}> = \[\]/);
  assert.match(roomStore, /const room = await readSupabase\(id\);[\s\S]*?candidates\.push\(\{ source: "table", priority: 3, room \}\)/);
  assert.match(roomStore, /const room = await readSupabaseStorageRoom\(id\);[\s\S]*?candidates\.push\(\{ source: "storage", priority: 2, room \}\)/);
  assert.match(roomStore, /const room = await readBlob\(id\);[\s\S]*?candidates\.push\(\{ source: "blob", priority: 1, room \}\)/);
  assert.match(roomStore, /candidates\.sort\(\(a, b\) => Number\(b\.room\.revision \|\| 0\) - Number\(a\.room\.revision \|\| 0\) \|\| b\.priority - a\.priority\)/);
  assert.match(roomStore, /return winner\.room/);
  assert.match(roomStore, /if \(failures\.length\) throw failures\[failures\.length - 1\]/);
  assert.match(roomStore, /if \(attemptedStore\) return null/);
});
