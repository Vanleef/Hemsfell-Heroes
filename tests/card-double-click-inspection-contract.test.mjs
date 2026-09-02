import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const runtime = fs.readFileSync("app/presentation/cards/card-double-click-inspect-runtime.tsx", "utf8");

test("double-click inspection runtime mounts before legacy card preview runtime", () => {
  const doubleClickImport = layout.indexOf('import CardDoubleClickInspectRuntime from "./presentation/cards/card-double-click-inspect-runtime"');
  const previewImport = layout.indexOf('import CardPreviewRuntime from "./presentation/cards/card-preview-runtime"');
  const doubleClickMount = layout.indexOf("<CardDoubleClickInspectRuntime />");
  const previewMount = layout.indexOf("<CardPreviewRuntime />");
  assert.ok(doubleClickImport >= 0 && previewImport > doubleClickImport);
  assert.ok(doubleClickMount >= 0 && previewMount > doubleClickMount);
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
