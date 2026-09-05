import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../app/presentation/runtime/game-presentation-runtime.tsx", import.meta.url), "utf8");

test("presentation snapshot observer ignores cosmetic class churn", () => {
  assert.match(runtime, /SNAPSHOT_STRUCTURAL_TARGET_SELECTOR/);
  assert.match(runtime, /SNAPSHOT_VALUE_SELECTOR/);
  assert.match(runtime, /record\.type === "characterData"/);
  assert.match(runtime, /record\.attributeName === "data-unit-id"/);
  assert.match(runtime, /target\.matches\(SNAPSHOT_STRUCTURAL_TARGET_SELECTOR\)/);
  assert.match(runtime, /attributeFilter:\s*\["data-unit-id"\]/);
  assert.doesNotMatch(runtime, /attributeFilter:\s*\[[^\]]*"class"/);
});
