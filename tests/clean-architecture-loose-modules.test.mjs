import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("loose card helpers are compatibility facades over rules-engine cores", async () => {
  const [activationFacade, keywordsFacade, rulesFacade, activationCore] = await Promise.all([
    read("app/card-activation.mjs"),
    read("app/card-keywords.mjs"),
    read("app/game-rules.mjs"),
    read("app/rules-engine/cards/card-activation.mjs"),
  ]);

  assert.match(activationFacade, /rules-engine\/cards\/card-activation\.mjs/);
  assert.match(keywordsFacade, /rules-engine\/cards\/card-keywords\.mjs/);
  assert.match(rulesFacade, /rules-engine\/game-rules\.mjs/);
  assert.match(activationCore, /from "\.\.\/compiler\.mjs"/);
  assert.doesNotMatch(activationFacade, /canActivateCard\s*\(/);
  assert.doesNotMatch(keywordsFacade, /intrinsicKeywordNames\s*\(/);
});

test("rules-engine card core exposes activation and keyword semantics", async () => {
  const cardsIndex = await import("../app/rules-engine/cards/index.mjs");
  assert.equal(typeof cardsIndex.canActivateCard, "function");
  assert.equal(typeof cardsIndex.intrinsicKeywordNames, "function");
});
