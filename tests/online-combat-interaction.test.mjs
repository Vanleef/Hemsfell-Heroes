import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { onlineCombatInteractionView } from "../app/rules-engine/online-combat.mjs";

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
  grave: [],
  obscuro: [],
  board: [],
  support: [],
  terrain: null,
  abilityUses: {},
  markers: {},
  heroXP: 0,
});

const base = () => ({
  active: 0,
  phase: "combate",
  round: 4,
  events: 0,
  winner: null,
  players: [player(), player()],
});

test("attacker interaction options come from authoritative declareAttack preflight", () => {
  const game = base();
  const ready = unit("ready", 0, ["Indomável"]);
  ready.attackLimit = 2;
  const sick = unit("sick", 1);
  sick.summoning = true;
  const turned = unit("turned", 2);
  turned.exhausted = true;
  game.players[0].board = [ready, sick, turned];
  game.onlineCombat = { stage: "declare-attackers", attackerOwner: 0, attackers: [], blocks: [], resolutionIndex: 0 };

  const view = onlineCombatInteractionView(game, 0);
  assert.deepEqual(view.attackerOptions, [{ attackerId: "ready", slot: 0, maxUses: 2, mandatoryUses: 2 }]);
  assert.deepEqual(onlineCombatInteractionView(game, 1).attackerOptions, [], "opponent gets no actionable attacker list");
});

test("blocker interaction options reuse authoritative attack legality", () => {
  const game = base();
  const flying = unit("flying", 0, ["Voar"]);
  const plain = unit("plain", 0);
  const flyingBlocker = unit("flying-blocker", 1, ["Voar", "Defensor 2"]);
  game.players[0].board = [flying];
  game.players[1].board = [plain, flyingBlocker];
  game.onlineCombat = {
    stage: "declare-blockers",
    attackerOwner: 0,
    attackers: [{ attackId: "attack-1", attackerId: "flying", declaredSlot: 0, occurrence: 0 }],
    blocks: [],
    resolutionIndex: 0,
  };

  const view = onlineCombatInteractionView(game, 1);
  assert.deepEqual(view.blockerOptions, [{ attackId: "attack-1", defenderIds: ["flying-blocker"] }]);
  assert.equal(view.defenderCapacities["flying-blocker"], 2);
  assert.equal(view.defenderCapacities.plain, 1);
  assert.deepEqual(onlineCombatInteractionView(game, 0).blockerOptions, [], "attacker gets no actionable blocker list");
});

test("room public view wires viewer-scoped combat interaction metadata", async () => {
  const store = await readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8");
  assert.match(store, /onlineCombatInteractionView/);
  assert.match(store, /game\.onlineCombat\.interaction = onlineCombatInteractionView\(game, viewer\)/);
});
