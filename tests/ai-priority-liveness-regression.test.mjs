import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../app/rules-engine/ai-system/runtime.ts", import.meta.url);

test("AI priority has an end-to-end presentation deadline before strategic search", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /PRIORITY_PRESENTATION_TIMEOUT_MS = 4200/);
  assert.match(runtime, /waitForPresentationIdle\(PRIORITY_PRESENTATION_TIMEOUT_MS, true\)/);
  assert.match(runtime, /if \(!presentationReady\) return passPriority\(owner\)/);
  assert.match(runtime, /PRIORITY_HARD_TIMEOUT_MS = 850/);
  assert.match(runtime, /boundedPrioritySearch\(chooseAdvancedAIActionReady\(state, owner, difficulty\), owner\)/);
});

test("stale presentation can never keep AI priority locked indefinitely", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /presentationWindow\.__hemsfellPresentationBusy = false/);
  assert.match(runtime, /hemsfell:presentation-catch-up/);
  assert.match(runtime, /hemsfell:presentation-idle/);
  assert.match(runtime, /reason: "ai-priority-liveness"/);
});

test("mandatory AI decisions do not wait for presentation twice", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const decision = runtime.match(/export async function chooseAdvancedAIDecision[\s\S]*?\n}\n\nexport function planAdvancedAIAttacks/)?.[0] || "";
  assert.ok(decision);
  assert.match(decision, /await waitForPresentationIdle\(\)/);
  assert.match(decision, /decision \?\? chooseAdvancedAIActionReady\(state, owner, difficulty\)/);
  assert.doesNotMatch(decision, /decision \?\? chooseAdvancedAIAction\(state, owner, difficulty\)/);
});
