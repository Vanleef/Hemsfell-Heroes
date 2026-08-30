import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACTIVE_ONLINE_SESSION_KEY, clearOnlineSession, loadOnlineSession, saveOnlineSession } from "../app/application/session/online-session.mjs";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
};

test("an Online session survives navigation without a room query", () => {
  const storage = memoryStorage();
  const session = { roomId: "room-abc", token: "secret", isHost: true };
  assert.deepEqual(saveOnlineSession(storage, session), session);
  assert.deepEqual(loadOnlineSession(storage), session);
  assert.deepEqual(loadOnlineSession(storage, "room-abc"), session);
});

test("legacy per-room credentials migrate through the active session pointer", () => {
  const storage = memoryStorage();
  storage.setItem("hemsfell-room-legacy", JSON.stringify({ token: "guest-token", isHost: false }));
  assert.deepEqual(loadOnlineSession(storage, "legacy"), { roomId: "legacy", token: "guest-token", isHost: false });
  assert.equal(loadOnlineSession(storage), null);
});

test("finishing or abandoning the active room clears both credentials", () => {
  const storage = memoryStorage();
  saveOnlineSession(storage, { roomId: "room-done", token: "secret", isHost: false });
  clearOnlineSession(storage, "room-done");
  assert.equal(storage.getItem(ACTIVE_ONLINE_SESSION_KEY), null);
  assert.equal(loadOnlineSession(storage, "room-done"), null);
});

test("the menu and initial load route active players back to their match", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /loadOnlineSession\(localStorage,preferredRoomId\)/);
  assert.match(page, /void resumeOnlineSession\(session\)/);
  assert.match(page, /Continuar partida/);
  assert.match(page, /activeOnlineSession\?<button className="gold"/);
  assert.match(page, /history\.replaceState\(\{\},"",`\/\?room=/);
});
