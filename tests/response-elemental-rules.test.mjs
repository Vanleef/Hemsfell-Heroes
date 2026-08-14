import assert from "node:assert/strict";
import test from "node:test";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { targetPolicy } from "../app/rules-engine/targeting.mjs";

const makeState = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [0, 1].map(() => ({
    life: 30,
    maxLife: 30,
    energy: 5,
    maxEnergy: 5,
    reserve: 3,
    deck: [],
    hand: [],
    board: [],
    support: [],
    terrain: null,
    grave: [],
    obscuro: [],
    nextElementEffects: [],
  })),
});

const spell = (id, name, extra = {}) => ({
  id,
  name,
  type: "Feitiço",
  cost: 0,
  text: "",
  tags: [],
  abilities: [],
  ...extra,
});

test("accelerated responses stay pending and resolve last-in-first-out before the root action", () => {
  const game = makeState();
  const root = spell("root", "Ação original");
  const first = spell("first", "Resposta 1", { tags: ["Acelerado"] });
  const last = spell("last", "Resposta 2", { tags: ["Acelerado"] });
  game.players[0].hand.push(root, last);
  game.players[1].hand.push(first);
  game.pendingAction = { type: "playCard", owner: 0, cardId: root.id };
  game.pendingResponse = { responder: 1, actor: 0, action: root.name, passes: 0 };

  const stackedFirst = executeCommand(game, { type: "playCard", owner: 1, cardId: first.id, hasPriority: true }, { priority: true }).state;
  assert.equal(stackedFirst.players[1].hand.some((card) => card.id === first.id), true, "first response must wait on the stack");
  assert.equal(stackedFirst.priorityStack.length, 2);

  const stackedLast = executeCommand(stackedFirst, { type: "playCard", owner: 0, cardId: last.id, hasPriority: true }, { priority: true }).state;
  assert.equal(stackedLast.players[0].hand.some((card) => card.id === last.id), true, "last response must also wait for passes");
  assert.equal(stackedLast.priorityStack.length, 3);

  const passOne = executeCommand(stackedLast, { type: "passPriority", owner: 1 }, { priority: true }).state;
  const resolveLast = executeCommand(passOne, { type: "passPriority", owner: 0 }, { priority: true }).state;
  assert.equal(resolveLast.players[0].hand.some((card) => card.id === last.id), false, "last response resolves first");
  assert.equal(resolveLast.players[1].hand.some((card) => card.id === first.id), true, "earlier response remains pending");
  assert.equal(resolveLast.pendingAction.cardId, root.id, "root action stays deferred");

  const passTwo = executeCommand(resolveLast, { type: "passPriority", owner: 0 }, { priority: true }).state;
  const resolveFirst = executeCommand(passTwo, { type: "passPriority", owner: 1 }, { priority: true }).state;
  assert.equal(resolveFirst.players[1].hand.some((card) => card.id === first.id), false, "earlier response resolves after the last response");
  assert.equal(resolveFirst.players[0].hand.some((card) => card.id === root.id), true, "root action still waits for its own response window");
  assert.equal(resolveFirst.pendingAction.cardId, root.id);
});

test("Uruk consumes only the matching elemental promise, replaces the cue and clears it at end of turn", () => {
  const game = makeState();
  game.players[0].nextElementEffects = [{ element: "Fogo", keyword: "Sufocado", expires: "turn" }];
  game.players[1].board.push({ uid: "enemy", id: "enemy", name: "Alvo", type: "Criatura", atk: 2, hp: 3, damage: 0, tags: [], modifiers: [], exhausted: false, summoning: false, abilities: [] });
  game.players[0].hand.push(spell("fire", "Feitiço de Fogo", {
    text: "Elemento: Fogo",
    abilities: [{ id: "fire-play", trigger: "onPlay", costs: [], effects: [{ type: "grantNextElementEffect", element: "Terra", keyword: "Imobilizado", expires: "turn" }] }],
  }));

  const resolved = executeCommand(game, { type: "playCard", owner: 0, cardId: "fire", targetIds: ["enemy"], skipPriority: true }, { priority: true }).state;
  assert.equal(resolved.players[1].board[0].suffocated, true, "matching Fogo promise is consumed on this spell");
  assert.deepEqual(resolved.players[0].nextElementEffects.map(({ element, keyword }) => ({ element, keyword })), [{ element: "Terra", keyword: "Imobilizado" }], "only the newly prepared cue remains");
  assert.equal(resolved.players[0].nextElementEffects[0].expires, "turn");

  resolved.phase = "fim";
  const nextTurn = executeCommand(resolved, { type: "advancePhase", owner: 0 }, { priority: true }).state;
  assert.deepEqual(nextTurn.players[0].nextElementEffects, [], "elemental enhancement expires when the turn ends");
});

test("Anel-style self destruction is not parsed as a target request", () => {
  const policy = targetPolicy("Vire: Destrua este Artefato e depois aumente seu limite de energia máxima em 1.");
  assert.equal(policy.selections, 0);
  assert.equal(policy.scope, "none");
});

test("Vingança only accepts a creature that damaged its controller this turn", () => {
  const vengeance = spell("vengeance", "Vingança", {
    page: 160,
    tags: ["Acelerado"],
    abilities: [{ id: "vengeance-play", trigger: "onPlay", costs: [], effects: [{ type: "destroyIfDamagedControllerThisTurn", target: "anyCreature", selections: 1 }] }],
  });

  const invalid = makeState();
  invalid.players[0].hand.push(vengeance);
  invalid.players[1].board.push({ uid: "attacker", id: "attacker", name: "Agressor", type: "Criatura", atk: 2, hp: 2, damage: 0, tags: [], modifiers: [], exhausted: false, summoning: false, abilities: [] });
  assert.throws(() => executeCommand(invalid, { type: "playCard", owner: 0, cardId: vengeance.id, targetIds: ["attacker"], skipPriority: true }, { priority: true }), /vengeance-target/);

  const valid = makeState();
  valid.players[0].hand.push(structuredClone(vengeance));
  valid.players[1].board.push({ uid: "attacker", id: "attacker", name: "Agressor", type: "Criatura", atk: 2, hp: 2, damage: 0, tags: [], modifiers: [], exhausted: false, summoning: false, abilities: [], damagedOwnersThisTurn: [0] });
  const result = executeCommand(valid, { type: "playCard", owner: 0, cardId: vengeance.id, targetIds: ["attacker"], skipPriority: true }, { priority: true }).state;
  assert.equal(result.players[1].board.length, 0);
  assert.equal(result.players[1].grave.length, 1);
});

test("negative attack modifiers never make combat damage negative and zero vitality destroys a creature", () => {
  const game = makeState();
  game.phase = "combate";
  game.players[0].board.push({ uid: "weak", id: "weak", name: "Fraca", type: "Criatura", atk: 1, hp: 2, damage: 0, tags: [], modifiers: [{ attack: -5 }], exhausted: false, summoning: false, abilities: [] });
  const attacked = executeCommand(game, { type: "attack", owner: 0, attackerId: "weak" }, { priority: true }).state;
  assert.equal(attacked.players[1].life, 30, "attack is floored at zero");

  const lethal = makeState();
  lethal.players[0].hand.push(spell("shrink", "Redução", { abilities: [{ id: "shrink-play", trigger: "onPlay", costs: [], effects: [{ type: "modifyStats", target: "enemyCreature", selections: 1, health: -2, duration: "permanent" }] }] }));
  lethal.players[1].board.push({ uid: "victim", id: "victim", name: "Vítima", type: "Criatura", atk: 1, hp: 2, damage: 0, tags: [], modifiers: [], exhausted: false, summoning: false, abilities: [] });
  const destroyed = executeCommand(lethal, { type: "playCard", owner: 0, cardId: "shrink", targetIds: ["victim"], skipPriority: true }, { priority: true }).state;
  assert.equal(destroyed.players[1].board.length, 0, "zero vitality destroys the creature");
  assert.equal(destroyed.players[1].grave.length, 1);
});
