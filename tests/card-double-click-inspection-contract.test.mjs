import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const gate = fs.readFileSync("app/presentation/runtime/screen-runtime-gate.tsx", "utf8");
const runtime = fs.readFileSync("app/presentation/cards/card-double-click-inspect-runtime.tsx", "utf8");

test("double-click inspection runtime is card-screen gated before card preview", () => {
  const doubleClickImport = gate.indexOf('import("../cards/card-double-click-inspect-runtime")');
  const previewImport = gate.indexOf('import("../cards/card-preview-runtime")');
  const doubleClickMount = gate.indexOf("<CardDoubleClickInspectRuntime />");
  const previewMount = gate.indexOf("<CardPreviewRuntime />");
  assert.ok(doubleClickImport >= 0 && previewImport > doubleClickImport);
  assert.ok(doubleClickMount >= 0 && previewMount > doubleClickMount);
  assert.match(gate, /const cardRuntimes = carriesCards\(screen\)/);
});

test("legacy press-and-hold is suppressed before document capture sees pointerdown", () => {
  assert.match(runtime, /window\.addEventListener\("pointerdown", suppressLegacyHold, true\)/);
  assert.match(runtime, /card\.dataset\.cardInspectable = "false"/);
  assert.match(runtime, /queueMicrotask\(\(\) => \{/);
  assert.match(runtime, /card\.dataset\.cardInspectable = "true"/);
});

test("detailed inspection opens on double click only for non-gameplay-target cards", () => {
  assert.match(runtime, /document\.addEventListener\("dblclick", inspectOnDoubleClick, true\)/);
  assert.match(runtime, /isGameplayTarget\(card\)/);
  assert.match(runtime, /new CustomEvent\("hemsfell:inspect-card", \{ detail: \{ page \} \}\)/);
  assert.doesNotMatch(runtime, /setTimeout\([^)]*inspect/i);
});
