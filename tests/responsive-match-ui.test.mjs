import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [css, page] = await Promise.all([
  readFile(new URL("../app/match-ui.css", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("lower match resolutions use two-axis responsive sizing", () => {
  assert.match(css, /--hh-slot-w: clamp\([^;]+min\([^;]+cqw[^;]+cqh/);
  assert.match(css, /@container hemsfell-board \(max-height: 44rem\)/);
  assert.match(css, /@container hemsfell-board \(max-height: 36rem\)/);
});

test("match chrome and card collections have explicit responsive bounds", () => {
  for (const selector of [
    "priority-stack-indicator", "engine-decision-wait", "game-bar", "hero-command-bar",
    "field-energy", "side-piles", "opponent-hand", "priority-control-toggle",
    "revealed-badge", "extra-deck-dialog", "search-deck-dialog", "engine-decision-panel",
  ]) assert.match(css, new RegExp(selector));
  assert.match(css, /\.game-bar > button:last-child/);
  assert.match(css, /\.field-keywords,\.field-negative-statuses/);
});

test("priority controls use the requested Assisted and Manual labels", () => {
  assert.match(page, /Modo: Assistido/);
  assert.match(page, /Modo: Manual/);
  assert.doesNotMatch(page, /Resposta: Full Control/);
});
