import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileCard } from "../app/rules-engine/compiler.mjs";
import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const state = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [0, 1].map(() => ({
    life: 30,
    maxLife: 30,
    energy: 10,
    maxEnergy: 10,
    reserve: 0,
    deck: [],
    hand: [],
    board: [],
    support: [],
    terrain: null,
    grave: [],
    obscuro: [],
    abilityUses: {},
    turnCardsPlayed: 0,
    turnSpellsPlayed: 0,
  })),
});

const limo = () => compileCard({
  page: 10,
  id: "p10",
  name: "Dragão de Limo",
  type: "Criatura",
  cost: 5,
  atk: 4,
  hp: 1,
  text: "Atropelar. Ultimo Suspiro: Explode em acido, causando 2 de dano a todas as criaturas em campo.",
  tags: ["Atropelar"],
});

test("Dragão de Limo Last Breath deals 2 to every surviving battlefield creature", () => {
  const game = state();
  game.phase = "combate";
  game.players[0].board.push(
    { ...limo(), uid: "limo", slot: 0, damage: 0, exhausted: false, summoning: false, modifiers: [], defenseUses: 0 },
    { uid: "ally", id: "ally", name: "Aliado", type: "Criatura", atk: 1, hp: 6, damage: 0, exhausted: false, summoning: false, modifiers: [], tags: [], abilities: [], slot: 1, defenseUses: 0 },
  );
  game.players[1].board.push(
    { uid: "blocker", id: "blocker", name: "Bloqueador", type: "Criatura", atk: 1, hp: 10, damage: 0, exhausted: false, summoning: false, modifiers: [], tags: [], abilities: [], slot: 0, defenseUses: 0 },
    { uid: "enemy", id: "enemy", name: "Inimigo", type: "Criatura", atk: 1, hp: 6, damage: 0, exhausted: false, summoning: false, modifiers: [], tags: [], abilities: [], slot: 1, defenseUses: 0 },
  );

  const result = executeCommand(game, { type: "attack", owner: 0, attackerId: "limo", defenderId: "blocker" }).state;
  assert.ok(result.players[0].grave.some((card) => card.page === 10), "Dragão de Limo must die in the combat");
  assert.equal(result.players[0].board.find((card) => card.uid === "ally")?.damage, 2);
  assert.equal(result.players[1].board.find((card) => card.uid === "enemy")?.damage, 2);
  assert.equal(result.players[1].board.find((card) => card.uid === "blocker")?.damage, 6, "4 combat damage + 2 acid damage");
});

test("legacy match compatibility resolves Dragão de Limo acid burst instead of logging it as manual", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if\(c\.page===10\)\{/);
  assert.match(page, /Dragão de Limo explodiu em ácido/);
});

test("Tranqueira-Mática expires before the controller's next turn even if its explicit self-move was skipped", () => {
  const game = state();
  game.phase = "fim";
  game.players[0].support.push({
    uid: "tranqueira-stuck",
    id: "p46",
    page: 46,
    name: "TRANQUEIRA-MÁTICA ELETROSTÁTICA",
    type: "Feitiço",
    cost: 1,
    tags: [],
    abilities: [],
    remainUntilTurnEnd: true,
    slot: 0,
  });

  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.players[0].support.some((card) => card.page === 46), false);
  assert.ok(result.players[0].grave.some((card) => card.page === 46));
  assert.equal(result.active, 1);
  assert.equal(result.phase, "manutencao");
});

test("Tranqueira-Mática end trigger is scoped to the turn of its controller", () => {
  const turnEnd = explicitCardRules.p46.find((ability) => ability.trigger === "onTurnEnd");
  assert.equal(turnEnd?.condition?.eventOwnerIsController, true);
});
