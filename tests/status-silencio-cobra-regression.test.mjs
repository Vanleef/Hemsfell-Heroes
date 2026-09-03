import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { canActivateCard } from "../app/rules-engine/cards/card-activation.mjs";

const byPage = (page) => compileCard(cards.find((card) => Number(card.page) === page));
const unit = (card, uid, slot = 0) => ({ ...card, uid, slot, damage: 0, exhausted: false, summoning: false, modifiers: [], markers: {} });
const player = (heroId) => ({
  heroId,
  level: 1,
  heroXP: 0,
  markers: {},
  abilityUses: {},
  life: 30,
  maxLife: 30,
  energy: 20,
  maxEnergy: 20,
  reserve: 0,
  deck: [],
  extraDeck: [],
  hand: [],
  board: [],
  support: [],
  terrain: null,
  grave: [],
  obscuro: [],
  turnCardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
});
const state = () => ({ active: 0, phase: "principal", round: 2, winner: null, events: 1, log: [], players: [player("saymon"), player("gimble")] });

test("Cobra Dor maintenance is a real Saymon life-loss event and unlocks its marker activation", () => {
  const game = state();
  const cobra = byPage(134);
  game.players[0].board.push(unit(cobra, "cobra"));

  const result = executeCommand(game, { type: "emit", owner: 0, event: { type: "onMaintenance", owner: 0 } }, { priority: false }).state;
  const live = result.players[0].board.find((card) => card.uid === "cobra");

  assert.equal(result.players[0].life, 28);
  assert.equal(result.players[0].heroXP, 1, "Saymon gains one evolution marker for the life-loss event");
  assert.equal(result.players[0].lifeLossEvents, 1);
  assert.equal(live.markers.action, 1);
  assert.equal(canActivateCard(live, {
    energy: result.players[0].energy,
    reserve: result.players[0].reserve,
    life: result.players[0].life,
    heroId: "saymon",
    heroLevel: 1,
    topGrave: undefined,
    constantMarkers: 1,
    hasSacrificeTarget: false,
  }), true, "one action marker makes Cobra Dor's X-marker ability usable");
});

test("Silencio Ensurdecedor follows its suffocated target out of the battlefield", () => {
  const game = state();
  const silencio = byPage(147);
  const victim = byPage(3);
  game.players[0].hand.push({ ...silencio, id: "silencio-hand" });
  game.players[1].board.push(unit(victim, "victim"));

  let result = executeCommand(game, {
    type: "playCard",
    owner: 0,
    cardId: "silencio-hand",
    slot: 0,
    targetIds: ["victim"],
    skipPriority: true,
  }, { priority: false }).state;

  const source = result.players[0].support.find((card) => Number(card.page) === 147);
  assert.ok(source, "Silencio enters the support row");
  assert.equal(result.players[1].board[0].suffocated, true);
  assert.equal(source.hhSuffocatingTargetId, "victim");

  result.players[0].hand.push({
    id: "destroy-spell",
    name: "Teste de remoção",
    type: "Feitiço",
    cost: 0,
    text: "",
    tags: [],
    abilities: [{ id: "destroy", trigger: "onPlay", costs: [], effects: [{ type: "destroy", target: "anyCreature", selections: 1 }] }],
  });

  result = executeCommand(result, {
    type: "playCard",
    owner: 0,
    cardId: "destroy-spell",
    targetIds: ["victim"],
    skipPriority: true,
  }, { priority: false }).state;

  assert.equal(result.players[1].board.some((card) => card.uid === "victim"), false);
  assert.equal(result.players[0].support.some((card) => Number(card.page) === 147), false);
  assert.equal(result.players[0].grave.some((card) => Number(card.page) === 147), true);
});

test("status overflow portals keep coordinates, centered counts and visible negative-status help", () => {
  const runtime = fs.readFileSync(new URL("../app/presentation/runtime/status-overflow-runtime.tsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../app/presentation/styles/hero-ability-progress-tooltip-terminal.css", import.meta.url), "utf8");

  assert.match(runtime, /--hh-status-tooltip-left/);
  assert.match(runtime, /--hh-status-tooltip-top/);
  assert.match(runtime, /className="hh-status-overflow-count"/);
  assert.match(runtime, /LIVE_STATUS_SELECTOR/);
  assert.match(runtime, /element\.dataset\.status \? "negative" : "positive"/);
  assert.match(css, /\.hh-global-tooltip-portal:is\(\.hh-status-list-tooltip, \.hh-status-detail-tooltip\)/);
  assert.match(css, /top: var\(--hh-status-tooltip-top, 0px\) !important/);
  assert.match(css, /\.hh-status-overflow-trigger > \.hh-status-overflow-count/);
  assert.match(css, /place-items: center !important/);
});

test("priority overlay stays gently dim while local usable hero powers receive a gold aura", () => {
  const css = fs.readFileSync(new URL("../app/presentation/styles/hero-ability-progress-tooltip-terminal.css", import.meta.url), "utf8");
  assert.match(css, /\.response-overlay \{[\s\S]*background: rgb\(2 5 10 \/ 30%\) !important[\s\S]*brightness\(\.82\)/);
  assert.match(css, /\.response-overlay > \.response-dialog \{[\s\S]*opacity: 1 !important[\s\S]*filter: none !important/);
  assert.match(css, /hero-ability-orb\[data-owned="true"\]\[data-active="true"\]\[data-available="true"\]/);
  assert.match(css, /rgb\(255 216 104 \/ 96%\)/);
});
