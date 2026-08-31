import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../app/rules-engine/ai-system/runtime.ts", import.meta.url);

test("AI priority has bounded presentation and strategic deadlines", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /PRIORITY_PRESENTATION_TIMEOUT_MS = 4200/);
  assert.match(runtime, /PRESENTATION_IDLE_FAILSAFE_MS = 20000/);
  assert.match(runtime, /Math\.min\(PRESENTATION_IDLE_FAILSAFE_MS, PRIORITY_PRESENTATION_TIMEOUT_MS\)/);
  assert.match(runtime, /const presentationReady = await waitForPresentationIdle\(\)/);
  assert.match(runtime, /if \(!presentationReady\) return passPriority\(owner\)/);
  assert.match(runtime, /PRIORITY_HARD_TIMEOUT_MS = 850/);
  assert.match(runtime, /boundedPrioritySearch\(chooseAdvancedAIAction\(state, owner, difficulty\), owner\)/);
});

test("stale presentation can never keep AI priority locked indefinitely", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /presentationWindow\.__hemsfellPresentationBusy = false/);
  assert.match(runtime, /hemsfell:presentation-catch-up/);
  assert.match(runtime, /hemsfell:presentation-idle/);
  assert.match(runtime, /reason: "ai-priority-liveness"/);
});

test("all advanced AI entry points retain the shared presentation boundary", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /export async function chooseAdvancedAIAction[\s\S]*?await waitForPresentationIdle\(\)/);
  assert.match(runtime, /export async function chooseAdvancedAIDecision[\s\S]*?await waitForPresentationIdle\(\)/);
  assert.match(runtime, /export async function chooseAdvancedAIResponse[\s\S]*?await waitForPresentationIdle\(\)/);
});
