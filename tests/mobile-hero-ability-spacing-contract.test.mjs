import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/presentation/styles/mobile-hero-ability-spacing-terminal.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("short mobile landscape keeps hero ability rail clear of the progress strip", () => {
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /pointer:\s*coarse/);
  assert.match(css, /max-height:\s*34rem/);
  assert.match(css, /hero-ability-rail[\s\S]*left:\s*calc\(var\(--hh-hero-art-right, 100%\) \+ clamp\(2\.05rem,\s*3\.5dvw,\s*2\.55rem\)\)\s*!important/);
});

test("mobile ability spacing loads after the broad mobile anchor pass and before pile footer terminal", () => {
  const broad = layout.indexOf('import "./presentation/styles/priority-card-anchor-terminal.css"');
  const spacing = layout.indexOf('import "./presentation/styles/mobile-hero-ability-spacing-terminal.css"');
  const pile = layout.indexOf('import "./presentation/styles/side-pile-text-shadow-terminal.css"');
  assert.ok(broad >= 0 && spacing > broad && pile > spacing);
});
