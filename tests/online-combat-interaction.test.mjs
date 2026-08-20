import assert from "node:assert/strict";
import test from "node:test";
import { canEndCombat, listAttackCapableCreatures, listLegalBlockers, listPendingIndomitableAttackers } from "../app/rules-engine/combat.mjs";

const unit = (id, slot, tags = []) => ({
  uid: id,
  id,
  name: id,
  type: "Criatura",
  slot,
  atk: 2,
  hp: 3,
  text: "",
  tags,
  abilities: [],
  modifiers: [],
  damage: 0,
  exhausted: false,
  summoning: false,
  stunned: false,
  immobilized: false,
  suffocated: false,
  defenseUses: 0,
  attackLimit: 1,
  attacksThisTurn: 0,
  attackedThisTurn: false,
  markers: 0,
});

const player = () => ({
  heroId: "saymon",
  level: 1,
  life: 30,
  maxLife: 30,
  energy: 0,
  maxEnergy: 3,
  reserve: 0,
  hand: [],
  deck: [],
  extraDeck: [],
  grave: [],
  obscuro: [],
  board: [],
  support: [],
  terrain: null,
  abilityUses: {},
  markers: {},
  heroXP: 0,
});

const base = () => ({ active: 0, phase: "combate", round: 4, events: 0, winner: null, players: [player(), player()] });

test("attacker capability is derived from authoritative declareAttack preflight", () => {
  const game = base();
  const ready = unit("ready", 0, ["Indomável"]);
  ready.attackLimit = 2;
  const sick = unit("sick", 1);
  sick.summoning = true;
  const turned = unit("turned", 2);
  turned.exhausted = true;
  game.players[0].board = [ready, sick, turned];

  assert.deepEqual(listAttackCapableCreatures(game, 0).map((card) => card.uid), ["ready"]);
  assert.deepEqual(listPendingIndomitableAttackers(game, 0).map((card) => card.uid), ["ready"]);
  assert.equal(canEndCombat(game, 0), false);
});

test("blocker list reuses authoritative attack legality for flying and ordinary defenders", () => {
  const game = base();
  const flying = unit("flying", 0, ["Voar"]);
  const plain = unit("plain", 0);
  const flyingBlocker = unit("flying-blocker", 1, ["Voar", "Defensor 2"]);
  game.players[0].board = [flying];
  game.players[1].board = [plain, flyingBlocker];

  assert.deepEqual(listLegalBlockers(game, 1, flying).map((card) => card.uid), ["flying-blocker"]);
});

test("Furtivo exposes no legal blocker while direct damage remains a defender choice", () => {
  const game = base();
  const stealth = unit("stealth", 0, ["Furtivo"]);
  game.players[0].board = [stealth];
  game.players[1].board = [unit("plain", 0), unit("fly", 1, ["Voar"] )];
  assert.deepEqual(listLegalBlockers(game, 1, stealth), []);
});
