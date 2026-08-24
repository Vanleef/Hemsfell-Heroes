import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const machine = await readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8");

test("every authoritative interaction has a server timeout exit", () => {
  assert.match(machine, /pendingDecision\.deadline = now \+ room\.settings\.responseSeconds \* 1000/);
  assert.match(machine, /chooseAIDecision\(before, owner, "Normal"\)/);
  assert.match(machine, /type: "confirmReposition", owner, auto: true/);
  assert.match(machine, /before\.phase === "manutencao" && noActionTimeout[\s\S]*?type: "skipMaintenanceChoice"/);
});

test("decision timeouts still flow through the authoritative command engine", () => {
  assert.match(machine, /executeOnlineCommand\(before, \{ \.\.\.command, auto: true \}, \{ priority: true \}\)/);
  assert.match(machine, /reconcileOnlineClocks\(before, room\.game, room\.settings, now\)/);
  assert.doesNotMatch(machine, /pendingDecision\s*=\s*null;\s*return true/);
});
