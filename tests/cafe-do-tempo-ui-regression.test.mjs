import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/presentation/styles/effects/cafe-time-placement.css", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("Café do Tempo placement prompt stays in the right-side safe lane", () => {
  assert.match(css, /\.cafe-time-placement-banner\s*\{[\s\S]*?grid-column:\s*5\s*!important/);
  assert.match(css, /\.cafe-time-placement-banner\s*\{[\s\S]*?grid-row:\s*5\s*!important/);
  assert.match(css, /\.cafe-time-placement-banner\s*\{[\s\S]*?pointer-events:\s*none\s*!important/);
});

test("Café do Tempo placement styles are loaded by globals", () => {
  assert.match(globals, /@import\s+["']\.\/presentation\/styles\/effects\/cafe-time-placement\.css["'];/);
});
