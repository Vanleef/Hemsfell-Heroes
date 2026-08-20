import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8");
const machine = await readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8");

test("started Online matches reject legacy full-state sync", () => {
  const block = route.match(/else if \(body\.action === "sync"\) \{([\s\S]*?)\n    \} else if \(body\.action === "timeout"\)/)?.[1] || "";
  assert.match(block, /legacy state sync disabled; use authoritative commands/);
  assert.match(block, /status: 410/);
  assert.doesNotMatch(block, /room\.game\s*=/);
  assert.doesNotMatch(block, /preserveOpponentSecrets\(/);
});

test("room command whitelist exposes only unitary combat intents", () => {
  assert.match(machine, /"declareAttack", "selectDefender", "attack", "advancePhase"/);
  assert.doesNotMatch(machine, /"declareAttackers"/);
  assert.doesNotMatch(machine, /"declareBlockers"/);
});
