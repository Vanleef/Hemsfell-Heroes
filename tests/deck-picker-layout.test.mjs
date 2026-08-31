import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("../app/presentation/styles/match-ui-guard.css", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../app/presentation/match/match-ui-guard.tsx", import.meta.url), "utf8");

test("AI deck selectors reserve a bounded column for hero art", () => {
  assert.match(css, /\.deck-picker \{[\s\S]*?overflow: hidden;[\s\S]*?grid-template-columns: clamp\(4\.6rem, 6\.1vw, 5\.75rem\) minmax\(0, 1fr\)/);
  assert.match(css, /\.deck-picker > \.remote-card-art,[\s\S]*?width: 100% !important;[\s\S]*?max-width: 5\.75rem !important;[\s\S]*?aspect-ratio: 5 \/ 7/);
  assert.match(css, /\.deck-picker-summary \.deck-plan \{[\s\S]*?overflow-wrap: anywhere/);
});

test("deck picker enhancement keeps faction and plan in dedicated grid areas", () => {
  assert.match(runtime, /faction\.classList\.add\("deck-picker-faction"\)/);
  assert.match(runtime, /summary\.className = "deck-picker-summary"/);
  assert.match(runtime, /summary\.append\(createText\("p", "deck-plan", ""\)\)/);
});
