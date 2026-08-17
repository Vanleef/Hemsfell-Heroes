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
test("response window uses dark backdrop and right side lane", () => {
  const css = readFileSync(new URL("../app/response-window-side.css", import.meta.url), "utf8");
  assert.match(css, /\.response-overlay\{[\s\S]*position:fixed!important;[\s\S]*inset:0!important;[\s\S]*background:rgba\(2,5,10,\.72\)!important;/);
  assert.match(css, /\.response-dialog\{[\s\S]*right:clamp\([\s\S]*left:auto!important;[\s\S]*width:fit-content!important;/);
});
