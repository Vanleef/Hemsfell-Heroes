import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = (
  await Promise.all([
    readFile(new URL("../app/presentation/styles/match-ui-guard.css", import.meta.url), "utf8"),
    readFile(new URL("../app/presentation/styles/match-stability-polish.css", import.meta.url), "utf8"),
  ])
).join("\n");

test("mobile deck setup remains contained inside the viewport", () => {
  assert.match(css, /@media \(max-width: 48rem\)[\s\S]*?\.match-setup\s*\{[\s\S]*?max-width:\s*100%[\s\S]*?overflow-x:\s*clip/);
  assert.match(css, /grid-template-areas:\s*"label label"\s*"art select"\s*"art faction"\s*"plan plan"\s*!important/);
  assert.match(css, /\.match-setup \.deck-picker > select\s*\{[\s\S]*?min-width:\s*0[\s\S]*?text-overflow:\s*ellipsis/);
});

test("mobile difficulty controls wrap into a readable two-column grid", () => {
  assert.match(css, /\.match-setup > \.difficulty\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.match-setup > \.difficulty > span\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(css, /\.match-setup > \.difficulty > button\s*\{[\s\S]*?min-width:\s*0/);
});
