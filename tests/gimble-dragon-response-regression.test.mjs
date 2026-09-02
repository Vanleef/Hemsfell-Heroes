import assert from "node:assert/strict";
import test from "node:test";
import { getExplicitCardRule } from "../app/rules-engine/card-rules.mjs";
import { readFileSync } from "node:fs";

test("Xarqiroth has a targetless conditional First Act", () => {
  const rule = getExplicitCardRule("p7");
  const enter = rule.find(ability => ability.trigger === "onEnter");
  assert.ok(enter);
  assert.equal(enter.condition?.controllerControlsOtherSubtype, "Dragão");
  assert.deepEqual(enter.effects, [{ type: "draw", amount: 2 }]);
  assert.equal(enter.effects.some(effect => effect.target), false);
});

test("generated Images prefer compiled catalog and emit entry events", () => {
  const source = readFileSync(new URL("../app/rules-engine/effects.mjs", import.meta.url), "utf8");
  assert.match(source, /const catalog = \[\.\.\.\(state\.cardCatalog \|\| \[\]\), \.\.\.\(entry\.extraDeck \|\| \[\]\)\]/);
  assert.match(source, /queueEvent\(state, \{ type: "onEnter", owner, sourceId: copy\.uid/);
  assert.match(source, /if \(base\.type === "Criatura"\) queueEvent\(state, \{ type: "onCreatureEnter"/);
});

test("Gimble level-two UI remains visibly unlocked", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /unlockLevel=Math\.min\(3,slot\+1\),locked=player\.level<unlockLevel/);
  assert.match(page, /locked\?"":"is-unlocked"/);
});

test("response window uses a readable backdrop and bounded responsive drawer", () => {
  const css = readFileSync(new URL("../app/presentation/styles/response-window.css", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../app/presentation/match/match-ui-runtime.tsx", import.meta.url), "utf8");
  assert.match(css, /\.screen-game \.response-overlay\{[\s\S]*position:fixed!important;[\s\S]*inset:0!important;[\s\S]*background:rgba\(2,5,10,\.42\)!important;[\s\S]*backdrop-filter:brightness\(\.72\) saturate\(\.88\)!important;/);
  assert.match(css, /\.screen-game \.response-overlay \.response-dialog\{[\s\S]*position:fixed!important;[\s\S]*left:auto!important;[\s\S]*min-width:min\(18rem[\s\S]*max-width:min\(24rem/);
  assert.match(runtime, /--response-opponent-piles-right/);
  assert.match(runtime, /responseAnchor = anchorValid \? "opponent-upper-right-piles" : "upper-right-fallback"/);
});
