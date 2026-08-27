import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [runtime, page, matchCss, collectionCss, packageJson] = await Promise.all([
  readFile(new URL("../app/card-preview-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/match-ui.css", import.meta.url), "utf8"),
  readFile(new URL("../app/ui-overrides.css", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("card preview uses Floating UI middleware and a body-level portal", () => {
  assert.equal(typeof packageJson.dependencies["@floating-ui/react"], "string");
  assert.match(runtime, /FloatingPortal/);
  assert.match(runtime, /offset\(/);
  assert.match(runtime, /flip\(/);
  assert.match(runtime, /shift\(/);
  assert.match(runtime, /size\(/);
  assert.match(runtime, /whileElementsMounted: autoUpdate/);
  assert.match(matchCss, /body > \[data-floating-ui-portal\]/);
});

test("card preview runtime is mounted globally in the root layout", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /import CardPreviewRuntime from ["']\.\/card-preview-runtime["']/);
  assert.match(layout, /<CardPreviewRuntime\s*\/>/);
});

test("Floating UI coordinates are not overridden by tooltip CSS", () => {
  const floatingBlock = matchCss.match(/\.card-preview-floating\.card-tooltip \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(floatingBlock, "expected floating preview CSS block");
  assert.doesNotMatch(floatingBlock, /inset:\s*auto\s*!important/);
  assert.doesNotMatch(floatingBlock, /transform:\s*none\s*!important/);
  assert.match(runtime, /floatingStyles/);
});

test("floating preview has complete content before its first visible paint", () => {
  assert.match(runtime, /function previewData[\s\S]*\.rich-card-text/);
  assert.match(runtime, /title, meta, rules, keywords/);
  assert.match(runtime, /refs\.setReference\(card\);\s*setPreview\(next\)/);
  assert.match(runtime, /const visible = isPositioned/);
  assert.match(runtime, /visibility: visible \? "visible" : "hidden"/);
  assert.match(runtime, /data-positioned=\{visible \? "true" : "false"\}/);
  assert.doesNotMatch(runtime, /replaceChildren/);
  assert.doesNotMatch(runtime, /contentRef/);
  assert.doesNotMatch(runtime, /positionReady/);
  assert.doesNotMatch(runtime, /update\(\)\.then/);
});

test("every rendered card exposes a preview source, including battlefield units", () => {
  assert.match(page, /data-card-preview="true"/);
  assert.match(page, /data-card-page=\{card\.page\}/);
  assert.doesNotMatch(page, /\{!unit&&<span className="card-tooltip"/);
});

test("touch long press opens a large preview without also executing the card click", () => {
  assert.match(runtime, /LONG_PRESS_MS = 520/);
  assert.match(runtime, /event\.pointerType !== "touch"/);
  assert.match(runtime, /suppressedClicks\.current\.add/);
  assert.match(runtime, /event\.preventDefault\(\);\s*event\.stopPropagation\(\)/);
  assert.match(runtime, /preview\.expanded \? "dialog" : "tooltip"/);
});

test("collection search, type filtering and deck validation are visible and responsive", () => {
  assert.match(page, /useDeferredValue\(collectionQuery\)/);
  assert.match(page, /collectionType==="Todas"\|\|card\.type===collectionType/);
  assert.match(page, /collectionMembership/);
  assert.match(page, /compareCollectionCards/);
  assert.match(page, /validateUserDeck\(activeUserDeck,cards\)/);
  assert.match(page, /mainDeckCopies=deckValidation\.mainCount/);
  assert.match(page, /MAIN_DECK_SIZE/);
  assert.match(page, /className={`deck-validity/);
  assert.match(page, /disabled=\{!deckListValid\}/);
  assert.match(collectionCss, /\.collection-toolbar/);
  assert.match(collectionCss, /\.deck-quantity-controls/);
  assert.match(collectionCss, /\.deck-card-entry\.is-in-deck/);
  assert.match(collectionCss, /\.deck-validity\.is-invalid/);
});
