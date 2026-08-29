import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/presentation/match/match-ui-guard.tsx", import.meta.url), "utf8");

test("deck picker enrichment is idempotent under MutationObserver", () => {
  assert.match(source, /const setTextIfChanged\s*=\s*\(/);
  assert.match(source, /node\.textContent !== text/);
  assert.match(source, /let syncQueued = false/);
  assert.match(source, /if \(syncQueued\) return;/);
  assert.doesNotMatch(source, /evolution\) evolution\.textContent = meta\.evolution/);
  assert.doesNotMatch(source, /plan\) plan\.textContent = meta\.plan/);
});
