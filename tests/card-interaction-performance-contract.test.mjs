import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/page.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const runtime = fs.readFileSync("app/presentation/runtime/hand-ai-ui-runtime.tsx", "utf8");
const art = fs.readFileSync("app/presentation/cards/remote-card-art.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/card-interaction-stability-terminal.css", "utf8");

test("exhausted target cards stay geometrically stable in field and decision popups", () => {
  assert.match(page, /unit\?\.exhausted\?"is-exhausted"/);
  assert.match(page, /engineTargetDecision/);
  assert.match(css, /original-card\.is-exhausted:is\(\.target-ally,\.target-enemy\)/);
  assert.match(css, /visual-card-choice \.original-card\.is-exhausted/);
  assert.match(css, /transform: none !important/);
  assert.match(css, /translate: none !important/);
  assert.match(css, /rotate: none !important/);
  assert.match(css, /scale: 1 !important/);
});

test("presentation owns a face without card-local icons and restores live icons by CSS state", () => {
  assert.match(css, /card-frame:has\(> \.original-card:is\(\.hh-presentation-hidden,\.is-impacting\)\)/);
  for (const token of ["field-negative-statuses", "field-keywords", "card-frame-marker", "card-frame-activation", "summoning-sickness-badge"]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /\.hh-flight-face :is\([\s\S]*?revealed-badge[\s\S]*?hh-hand-metric[\s\S]*?display: none !important/);
  assert.doesNotMatch(runtime, /getComputedStyle|DOMMatrixReadOnly|FIELD_FRAME_SELECTOR/);
});

test("revealed public information remains visible on stable hand cards", () => {
  assert.match(page, /!unit&&card\.revealed&&<span className="revealed-badge"/);
  assert.match(page, /card\.revealed\?<OriginalCard/);
  assert.match(css, /:is\(\.player-hand,\.opponent-hand\)[\s\S]*?original-card:not\(\.hh-presentation-hidden\) > \.revealed-badge/);
  assert.match(css, /visibility: visible !important/);
  assert.match(css, /opacity: 1 !important/);
});

test("hand peek opens only immediate neighbours without changing flex geometry", () => {
  assert.match(runtime, /dataset\.hhHandPeek/);
  assert.match(runtime, /pointerup/);
  assert.match(runtime, /pointercancel/);
  assert.match(runtime, /dragend/);
  assert.match(css, /--hh-hand-peek-gap/);
  assert.match(css, /card-frame:has\(\+ \.card-frame\[data-hh-hand-peek="true"\]\)/);
  assert.match(css, /card-frame\[data-hh-hand-peek="true"\] \+ \.card-frame/);
  assert.match(css, /translateX\(calc\(-1 \* var\(--hh-hand-peek-gap\)\)\)/);
  assert.match(css, /translateX\(var\(--hh-hand-peek-gap\)\)/);
});

test("hand observer ignores board class churn and never reads field layout", () => {
  assert.match(runtime, /observer\.observe\(document\.body,[\s\S]*?childList: true,[\s\S]*?characterData: true/);
  assert.doesNotMatch(runtime, /attributeFilter|attributes:\s*true/);
  assert.doesNotMatch(runtime, /getBoundingClientRect|getComputedStyle|DOMMatrixReadOnly/);
  assert.match(runtime, /dirtyHands/);
});

test("card art keeps a bounded raster cache and no longer blanks canvases on cleanup", () => {
  assert.match(art, /MAX_CACHED_RASTER_PROMISES = 40/);
  assert.match(art, /rasterPromises = new Map/);
  assert.match(art, /loadCardRaster/);
  assert.match(art, /context\.drawImage\(raster, 0, 0\)/);
  assert.match(art, /if \(!entry\.isIntersecting\) return;[\s\S]*?observer\.disconnect\(\)/);
  assert.doesNotMatch(art, /canvas\.width\s*=\s*1/);
  assert.doesNotMatch(art, /canvas\.height\s*=\s*1/);
});

test("interaction stability authority is terminal for gameplay but tutorial remains final", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const hand = imports.indexOf("./presentation/styles/hand-ai-ui-terminal.css");
  const stability = imports.indexOf("./presentation/styles/card-interaction-stability-terminal.css");
  const tutorial = imports.indexOf("./presentation/styles/tutorial-current-ui-terminal.css");
  assert.ok(stability > hand);
  assert.ok(tutorial > stability);
  assert.equal(imports.at(-1), "./presentation/styles/tutorial-current-ui-terminal.css");
});
