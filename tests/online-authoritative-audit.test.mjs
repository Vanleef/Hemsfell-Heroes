import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";

const machine = await readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8");
const initialGame = await readFile(new URL("../app/api/rooms/initial-game.ts", import.meta.url), "utf8");

const fastCard = () => ({
  page: 999,
  id: "fast-1",
  name: "Resposta de Teste",
  type: "Feitiço",
  cost: 0,
  atk: 0,
  hp: 0,
  text: "Acelerado.",
  tags: ["Acelerado"],
  subtypes: [],
  hero: false,
  imageCard: false,
  abilities: [{ id: "fast-play", trigger: "onPlay", effects: [], costs: [] }],
});
const unit = (uid) => ({
  uid,
  id: uid,
  page: 998,
  name: uid,
  type: "Criatura",
  cost: 1,
  atk: 2,
  hp: 2,
  text: "",
  tags: [],
  subtypes: [],
  abilities: [],
  slot: 0,
  damage: 0,
  exhausted: false,
  summoning: false,
  stunned: false,
  frozen: false,
  suffocated: false,
  immobilized: false,
  defenseUses: 0,
  markers: 0,
});
const player = (hand = []) => ({
  heroId: "saymon",
  level: 3,
  heroXP: 0,
  levelUpsThisTurn: 0,
  life: 20,
  maxLife: 30,
  energy: 3,
  maxEnergy: 3,
  reserve: 3,
  hand,
  deck: [],
  extraDeck: [],
  grave: [],
  obscuro: [],
  board: [],
  support: [],
  terrain: null,
  abilityUses: {},
  markers: {},
  cardsPlayed: 0,
  turnCardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
  coffeeSpells: 0,
  damageDealt: 0,
  turnDeaths: 0,
  nextCardDiscounts: [],
  nextCardDiscount: 0,
  nextNonCreatureDiscount: 0,
  nextSpellDiscount: 0,
  nextCreaturePaysLife: false,
});
const baseState = () => ({
  active: 0,
  phase: "combate",
  round: 3,
  winner: null,
  events: 0,
  log: [],
  players: [player(), player()],
  pendingAction: { type: "onlineCheckpoint", owner: 0, checkpoint: "test-root" },
  pendingResponse: { responder: 1, actor: 0, action: "ação raiz", passes: 0 },
});

test("wrong player cannot pass somebody else's priority window", () => {
  const state = baseState();
  assert.throws(() => executeOnlineCommand(state, { type: "passPriority", owner: 0 }, { priority: true }), /not-your-priority/);
});

test("two consecutive passes resolve the top accelerated response instead of deadlocking", () => {
  let state = baseState();
  state.players[1].hand = [fastCard()];
  state = executeOnlineCommand(state, { type: "playCard", owner: 1, cardId: "fast-1" }, { priority: true }).state;
  assert.equal(state.priorityStack?.length, 2);
  assert.equal(state.pendingResponse?.responder, 0);

  state = executeOnlineCommand(state, { type: "passPriority", owner: 0 }, { priority: true }).state;
  assert.equal(state.pendingResponse?.responder, 1);
  assert.equal(state.pendingResponse?.passes, 1);

  state = executeOnlineCommand(state, { type: "passPriority", owner: 1 }, { priority: true }).state;
  assert.equal(state.players[1].hand.length, 0);
  assert.equal(state.players[1].grave.some((card) => card.id === "fast-1"), true);
  assert.equal(state.pendingResponse?.responder, 1);
});

test("only the defending player can choose a blocker and the post-block response survives serialization", () => {
  const state = baseState();
  state.pendingAction = undefined;
  state.pendingResponse = null;
  state.players[0].board = [unit("attacker")];
  state.players[1].board = [unit("blocker")];
  state.combatAction = { attackerOwner: 0, attackerUid: "attacker", attackerCard: fastCard(), stage: "choosing" };

  const refreshed = structuredClone(state);
  assert.equal(refreshed.combatAction.stage, "choosing");
  assert.equal(refreshed.combatAction.attackerUid, "attacker");
  assert.throws(() => executeOnlineCommand(refreshed, { type: "selectDefender", owner: 0, defenderId: "blocker" }, { priority: true }));

  const accepted = executeOnlineCommand(refreshed, { type: "selectDefender", owner: 1, defenderId: "blocker" }, { priority: true }).state;
  assert.equal(accepted.combatAction?.stage, "priority");
  assert.equal(accepted.combatAction?.defenderUid, "blocker");
  assert.equal(accepted.pendingResponse?.responder, 0);
  assert.equal(accepted.priority?.window, "after-blockers");
});

test("command retries are idempotent and revision conflicts fail closed", () => {
  assert.match(machine, /if \(currentParticipant\?\.recentCommandIds\?\.includes\(normalizedCommandId\)\)/);
  assert.match(machine, /Number\(baseRevision\) !== room\.revision/);
  assert.match(machine, /command id required/);
  assert.match(machine, /const command: Record<string, any> = \{ \.\.\.rawCommand, owner \}/);
  assert.match(store, /if \(isStaleRevision\(storageError\)\) throw storageError/);
  assert.match(store, /Number\(current\.revision\) !== room\.revision - 1/);
  assert.match(route, /error: "stale revision"[\s\S]*?roomView\(latest/);
});

test("server owns initial shuffle and the browser cannot upload a game snapshot", () => {
  assert.match(route, /createInitialOnlineGame\(room\.host\.heroId, room\.guest\.heroId/);
  assert.match(route, /body\.action === "initialize"[\s\S]*?client game initialization disabled/);
  assert.match(route, /body\.action === "sync"[\s\S]*?legacy state sync disabled/);
  assert.match(initialGame, /const shuffle =/);
  assert.match(initialGame, /hand: deck\.slice\(0, 7\)/);
  assert.match(initialGame, /deck: deck\.slice\(7\)/);
});

test("opponent private zones and decision payloads are redacted by whitelist", () => {
  assert.match(store, /opponent\.hand = [\s\S]*?visibleTo\(card, viewer\) \? card : hiddenCard/);
  assert.match(store, /opponent\.extraDeck = [\s\S]*?hiddenCard/);
  assert.match(store, /kind: "opponent-choice"/);
  assert.match(store, /effect: \{\}/);
  assert.match(store, /targetSteps: \[\]/);
  assert.match(store, /revealedTo\.includes\(viewer\)/);
});

test("timeout polling is idempotent and does not write an unchanged revision", () => {
  assert.match(route, /body\.action === "timeout"[\s\S]*?if \(!applyTimeout\(room\)\) return NextResponse\.json/);
  assert.match(route, /persistDueTimeout/);
});
