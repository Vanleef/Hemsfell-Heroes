import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { isAccelerated, legalPriorityResponses } from "../app/rules-engine/priority.mjs";

const player = () => ({ heroId: "rasmus", level: 1, life: 30, energy: 3, reserve: 3, hand: [], deck: [], board: [], support: [], terrain: null, grave: [], obscuro: [], abilityUses: {} });

test("Café Pingado is canonically Accelerated", () => {
  const cards = JSON.parse(fs.readFileSync(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
  const raw = cards.find((card) => card.page === 236);
  assert.ok(raw);
  assert.ok((raw.tags || []).some((tag) => /acelerado/i.test(String(tag))));
  assert.match(raw.text || "", /acelerado/i);
  const cafe = compileCard(raw);
  assert.equal(isAccelerated(cafe), true);
});

test("Café Pingado appears as a legal response when priority and reserve allow it", () => {
  const cards = JSON.parse(fs.readFileSync(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
  const cafe = compileCard(cards.find((card) => card.page === 236));
  const p0 = player(), p1 = player();
  p0.hand = [cafe];
  const state = { players: [p0, p1], active: 1, phase: "principal", round: 1, pendingResponse: { responder: 0, actor: 1, action: "ação", passes: 0 }, priorityStack: [] };
  const legal = legalPriorityResponses(state, 0);
  assert.equal(legal.some((command) => command.type === "playCard" && command.cardId === "p236"), true);
});

test("Café Pingado is not legal off-turn without enough reserve", () => {
  const cards = JSON.parse(fs.readFileSync(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
  const cafe = compileCard(cards.find((card) => card.page === 236));
  const p0 = player(), p1 = player();
  p0.reserve = 0;
  p0.hand = [cafe];
  const state = { players: [p0, p1], active: 1, phase: "principal", round: 1, pendingResponse: { responder: 0, actor: 1, action: "ação", passes: 0 }, priorityStack: [] };
  assert.equal(legalPriorityResponses(state, 0).some((command) => command.cardId === "p236"), false);
});
