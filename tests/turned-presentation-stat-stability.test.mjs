import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("turned presentation copies keep ATK and HP at battlefield scale", () => {
  const runtime = read("app/presentation/runtime/game-presentation-runtime.tsx");
  const css = read("app/presentation/styles/match-interaction-terminal.css");

  assert.match(runtime, /classList\.contains\("is-exhausted"\)/);
  assert.match(runtime, /dataset\.hhPresentationOrientation = "turned"/);
  assert.match(css, /original-card\[data-hh-presentation-orientation="turned"\] > :is\(\.live-atk, \.live-hp\)/);
  assert.match(css, /--hh-turned-presentation-stat-size:\s*clamp\(/);
  assert.match(css, /calc\(var\(--hh-presentation-card-width\) \* \.36\)/);
  assert.match(css, /width:\s*var\(--hh-turned-presentation-stat-size\)\s*!important/);
  assert.match(css, /height:\s*var\(--hh-turned-presentation-stat-size\)\s*!important/);
  assert.match(css, /font-size:\s*clamp\([\s\S]*calc\(var\(--hh-presentation-card-width\) \* \.18\)/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /transition:\s*none\s*!important/);
});
