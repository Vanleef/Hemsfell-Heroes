import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../app/presentation/styles/cross-screen-ui.css", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../app/presentation/runtime/cross-screen-ui-runtime.tsx", import.meta.url), "utf8");
const gate = fs.readFileSync(new URL("../app/presentation/runtime/screen-runtime-gate.tsx", import.meta.url), "utf8");

test("AI deck selectors reserve a bounded column for hero art", () => {
  assert.match(css, /\.deck-picker\s*\{[\s\S]*grid-template-columns:\s*clamp\(4\.6rem,\s*6\.1vw,\s*5\.75rem\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.deck-picker > \.remote-card-art,[\s\S]*max-width:\s*5\.75rem/);
});

test("deck selector summary keeps faction and concise plan without evolution duplication", () => {
  assert.match(runtime, /faction\.classList\.add\("deck-picker-faction"\)/);
  assert.match(runtime, /summary\.className = "deck-picker-summary"/);
  assert.match(runtime, /plan\.className = "deck-plan"/);
  assert.doesNotMatch(runtime, /deck-evolution/);
});

test("setup decoration is isolated to the setup screen instead of a global match observer", () => {
  assert.match(gate, /CrossScreenUiRuntime/);
  assert.match(gate, /screen === "setup"[\s\S]*?<CrossScreenUiRuntime mode="setup" \/>/);
  assert.match(runtime, /main\.hh-app\.screen-setup/);
  assert.match(runtime, /observer\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(runtime, /observer\.observe\(document\.body/);
});

test("setup layout collapses responsively on narrow screens", () => {
  assert.match(css, /@media \(max-width:\s*48rem\)/);
  assert.match(css, /\.deck-picker\s*\{\s*grid-template-columns:\s*clamp\(4\.2rem,\s*18vw,\s*5\.25rem\)/);
  assert.match(css, /\.host-settings\s*\{\s*grid-template-columns:\s*1fr/);
});
