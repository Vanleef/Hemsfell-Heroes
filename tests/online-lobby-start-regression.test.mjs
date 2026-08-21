import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("coin winner choice reconciles a heartbeat revision conflict on the first click", () => {
  assert.match(page, /const retryableStale=staleRevision&&\(action==="command"\|\|action==="choose_start"\)/);
  assert.match(page, /if\(action==="choose_start"&&\["mulligan","started","finished"\]\.includes\(data\?\.status\)\)return data/);
  assert.match(page, /if\(staleRetries<3\)[\s\S]*?execute\(staleRetries\+1\)/);
});

test("coin winner controls are single-flight while the room starts", () => {
  assert.match(page, /if\(lobbyActionPending\)return;setLobbyActionPending\(true\)/);
  assert.match(page, /disabled=\{lobbyActionPending\}/);
  assert.match(page, /lobbyActionPending\?"Iniciando…":"Eu começo"/);
});
