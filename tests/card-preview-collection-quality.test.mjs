import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [runtime, page, remoteCardArt, matchCss, collectionCss, packageJson] = await Promise.all([
  readFile(new URL("../app/presentation/cards/card-preview-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/cards/remote-card-art.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/match-ui.css", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/base/ui-overrides.css", import.meta.url), "utf8"),
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
  const [layout, matchRuntime] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/presentation/match/match-ui-runtime.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /import CardPreviewRuntime from ["']\.\/presentation\/cards\/card-preview-runtime["']/);
  assert.match(layout, /<CardPreviewRuntime\s*\/>/);
  assert.doesNotMatch(matchRuntime, /CardPreviewRuntime/);
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
  assert.match(runtime, /title, meta, rules, keywords, subtypes/);
  assert.match(runtime, /refs\.setReference\(card\);\s*setPreview\(next\)/);
  assert.match(runtime, /const visible = previewFloating\.isPositioned/);
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

test("one-second press opens detailed inspection without also executing the card click", () => {
  assert.match(runtime, /INSPECTION_HOLD_MS = 1_000/);
  assert.match(runtime, /card\.dataset\.cardInspectable !== "true"/);
  assert.match(runtime, /beginInspectionHold\(card, event\)/);
  assert.match(runtime, /new CustomEvent\("hemsfell:inspect-card", \{ detail: \{ page \} \}\)/);
  assert.match(runtime, /suppressedClicks\.current\.add/);
  assert.match(runtime, /event\.preventDefault\(\);\s*event\.stopPropagation\(\)/);
  assert.match(page, /data-card-inspectable=\{inspectable\?"true":"false"\}/);
  assert.match(page, /disabled=\{disabled&&!inspectable\}/);
  assert.match(page, /aria-disabled=\{disabled\|\|undefined\}/);
  assert.match(page, /const interactionClick=!disabled&&/);
  assert.doesNotMatch(page, /requestCardInspection/);
});

test("press progress is centered, non-interactive and canceled by movement or dragging", () => {
  assert.match(runtime, /const HOLD_SLOP_PX = 12/);
  assert.match(runtime, /progress\.className = "card-inspection-hold-progress"/);
  assert.match(runtime, /Math\.hypot\([\s\S]*HOLD_SLOP_PX/);
  assert.match(runtime, /const onDragStart = \(\) => \{[\s\S]*clearInspectionHold\(\)/);
  assert.match(matchCss, /\.card-inspection-hold-progress\s*\{[\s\S]*left:\s*50%[\s\S]*top:\s*50%[\s\S]*pointer-events:\s*none/);
  assert.match(matchCss, /conic-gradient\(/);
  assert.match(matchCss, /@keyframes cardInspectionHoldProgress/);
});

test("read-only collection keeps hero information, deck lists, search and validation", () => {
  assert.match(page, /useDeferredValue\(collectionQuery\)/);
  assert.match(page, /collectionType==="Todas"\|\|card\.type===collectionType/);
  assert.match(page, /validateUserDeck\(activeUserDeck,cards\)/);
  assert.match(page, /mainDeckCopies=deckValidation\.mainCount/);
  assert.match(page, /MAIN_DECK_SIZE/);
  assert.match(page, /className={`deck-validity/);
  assert.match(page, /disabled=\{!deckListValid\}/);
  assert.match(page, /HeroGuide deck=\{selectedDeck\}/);
  assert.match(page, /<b>Deck Principal<\/b>/);
  assert.match(page, /<b>Deck Extra<\/b>/);
  assert.doesNotMatch(page, /collectionMembership/);
  assert.doesNotMatch(page, /compareCollectionCards/);
  assert.doesNotMatch(page, /DeckQuantityControls/);
  assert.doesNotMatch(page, /Coleção disponível/);
  assert.match(collectionCss, /\.collection-toolbar/);
  assert.match(collectionCss, /\.deck-validity\.is-invalid/);
});

test("native browser titles are removed from card tooltip targets", () => {
  assert.match(runtime, /NATIVE_TITLE_SELECTOR/);
  assert.match(runtime, /removeAttribute\("title"\)/);
  assert.match(runtime, /MutationObserver/);
  assert.doesNotMatch(page, /data-tip=\{keyword\.description\} title=/);
  assert.doesNotMatch(page, /data-tip=\{keyword\?\.description\} title=/);
  assert.doesNotMatch(remoteCardArt, /\s+title=\{/);
});

test("card tooltip remains interactive while hovered", () => {
  assert.match(runtime, /TOOLTIP_CLOSE_DELAY_MS = 180/);
  assert.match(runtime, /target\?\.closest\("\.card-preview-floating"\)/);
  assert.match(runtime, /onPointerEnter=\{cancelScheduledClose\}/);
  assert.match(matchCss, /\.card-preview-floating\.card-tooltip[\s\S]*pointer-events: auto !important/);
});

test("compact card tooltip stays small and closes as soon as dragging starts", () => {
  assert.match(matchCss, /\.card-preview-floating\.is-compact\s*\{[\s\S]*width:\s*min\(12rem/);
  assert.match(matchCss, /\.card-preview-floating\.is-compact\s*\{[\s\S]*max-height:\s*min\(22rem/);
  assert.match(runtime, /document\.addEventListener\("dragstart", onDragStart, true\)/);
  assert.match(runtime, /const onDragStart = \(\) => \{[\s\S]*clearHoverOpen\(\);[\s\S]*closePreview\(\)/);
});

test("card tooltip opens only after one second of continuous hover and never from focus", () => {
  assert.match(runtime, /const TOOLTIP_HOVER_DELAY_MS = 1_000/);
  assert.match(runtime, /hoverTimer = window\.setTimeout\([\s\S]*TOOLTIP_HOVER_DELAY_MS\)/);
  assert.match(runtime, /const onPointerOver[\s\S]*scheduleHoverOpen\(card\)/);
  assert.match(runtime, /const onPointerOut[\s\S]*clearHoverOpen\(\)/);
  assert.doesNotMatch(runtime, /addEventListener\("focusin"/);
});

test("keywords and subtypes expose highlighted nested glossary tooltips", () => {
  assert.match(page, /data-card-subtypes=/);
  assert.match(runtime, /kind: "keyword"/);
  assert.match(runtime, /kind: "subtype"/);
  assert.match(runtime, /card-preview-term is-/);
  assert.match(runtime, /card-glossary-floating/);
  assert.match(runtime, /glossaryFloating\.refs\.setReference/);
  assert.match(matchCss, /\.card-preview-term\.is-keyword/);
  assert.match(matchCss, /\.card-preview-term\.is-subtype/);
});
