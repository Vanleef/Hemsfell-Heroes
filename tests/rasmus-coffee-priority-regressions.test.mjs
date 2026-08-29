import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";
import { suppliedDeckPages } from "../app/model/decks/user-deck.mjs";

const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("Café Preto Sem Açúcar uses one target for +5/+5 and the next-untap skip", () => {
  const rule = explicitCardRules.p249?.[0];
  assert.equal(rule?.trigger, "onPlay");
  assert.equal(rule?.effects?.length, 2);
  const [buff, untapSkip] = rule.effects;
  assert.equal(buff.type, "modifyStats");
  assert.equal(buff.target, "anyCreature");
  assert.equal(buff.selections, 1);
  assert.equal(buff.attack, 5);
  assert.equal(buff.health, 5);
  assert.equal(buff.duration, "untilNextTurn");
  assert.equal(untapSkip.type, "skipNextUntap");
  assert.equal(untapSkip.target, "anyCreature");
  assert.equal(untapSkip.reusePreviousTarget, true);
});

test("Rasmus supplied deck matches the author list and totals exactly 49 cards", () => {
  const pairs = suppliedDeckPages.rasmus;
  assert.ok(pairs, "Rasmus supplied deck must exist");
  const expected = [[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[234,3],[254,2],[212,1],[229,3],[251,2],[235,2]];
  assert.deepEqual(pairs, expected);
  assert.equal(pairs.reduce((sum, [, quantity]) => sum + quantity, 0), 49);
});

test("bot legacy priority window is skipped when the authoritative engine has no legal response", () => {
  assert.match(pageSource, /const probe=\{\.\.\.current,pendingResponse:pending\} as Game/);
  assert.match(pageSource, /legalPriorityResponses\(probe,responder\)\.length===0/);
  assert.match(pageSource, /setSharedResponse\(null\);return/);
});