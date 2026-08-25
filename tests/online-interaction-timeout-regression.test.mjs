import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const machine = await readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8");

test("every authoritative interaction has a server timeout exit", () => {
  assert.match(machine, /pendingDecision\.deadline = now \+ room\.settings\.responseSeconds \* 1000/);
  assert.match(machine, /chooseAIDecision\(before, owner, "Normal"\)/);
  assert.match(machine, /type: "confirmReposition", owner, auto: true/);
  assert.match(machine, /before\.phase === "manutencao" && noActionTimeout[\s\S]*?type: "skipMaintenanceChoice"/);
  assert.match(machine, /if \(room\.game\.turnDeadline[\s\S]*?drainEmptyAssistedPriority\(room, \[\.\.\.\(result\.trace \|\| \[\]\)\]\)/);
});

test("turn timeout drains empty Assisted priority before the room snapshot is returned", () => {
  const timeoutBranch = machine.slice(machine.indexOf("if (room.game.turnDeadline"), machine.indexOf("export function applySafeAutoPass"));
  assert.match(timeoutBranch, /executeOnlineCommand\(before, command, \{ priority: true \}\)/);
  assert.match(timeoutBranch, /drainEmptyAssistedPriority/);
  assert.ok(timeoutBranch.indexOf("drainEmptyAssistedPriority") < timeoutBranch.indexOf("return true"));
});

test("decision timeouts still flow through the authoritative command engine", () => {
  assert.match(machine, /executeOnlineCommand\(before, \{ \.\.\.command, auto: true \}, \{ priority: true \}\)/);
  assert.match(machine, /reconcileOnlineClocks\(before, room\.game, room\.settings, now\)/);
  assert.doesNotMatch(machine, /pendingDecision\s*=\s*null;\s*return true/);
});
