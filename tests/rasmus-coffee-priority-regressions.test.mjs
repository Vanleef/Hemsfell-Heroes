import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";

const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("Café Preto Sem Açúcar grants exactly one target +5/+5 until next turn without skipping untap", () => {
  const rule = explicitCardRules.p249?.[0];
  assert.equal(rule?.trigger, "onPlay");
  assert.equal(rule?.effects?.length, 1);
  const effect = rule.effects[0];
  assert.equal(effect.type, "modifyStats");
  assert.equal(effect.target, "anyCreature");
  assert.equal(effect.selections, 1);
  assert.equal(effect.attack, 5);
  assert.equal(effect.health, 5);
  assert.equal(effect.duration, "untilNextTurn");
  assert.ok(!rule.effects.some((item) => item.type === "skipNextUntap"));
});

test("Rasmus supplied deck matches the author list and totals exactly 49 cards", () => {
  const match = pageSource.match(/rasmus:\[(.*?)\],\n ngoro:/s);
  assert.ok(match, "Rasmus supplied deck must exist");
  const pairs = [...match[1].matchAll(/\[(\d+),(\d+)\]/g)].map((entry) => [Number(entry[1]), Number(entry[2])]);
  const expected = [[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[230,3],[254,2],[212,1],[229,3],[251,2],[235,2]];
  assert.deepEqual(pairs, expected);
  assert.equal(pairs.reduce((sum, [, quantity]) => sum + quantity, 0), 49);
});

test("bot legacy priority window is skipped when the authoritative engine has no legal response", () => {
  assert.match(pageSource, /const probe=\{\.\.\.current,pendingResponse:pending\} as Game/);
  assert.match(pageSource, /legalPriorityResponses\(probe,responder\)\.length===0/);
  assert.match(pageSource, /setSharedResponse\(null\);return/);
});
