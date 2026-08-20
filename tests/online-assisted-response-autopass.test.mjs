import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { legalPriorityResponses, shouldAutoPass } from "../app/rules-engine/priority.mjs";
import { syncPriorityMetadata } from "../app/rules-engine/priority-state.mjs";

const accelerated = (id, { cost = 0, target = null } = {}) => ({
  id,
  uid: id,
  name: id,
  type: "Feitiço",
  cost,
  text: "Acelerado",
  tags: ["Acelerado"],
  diagnostics: { source: "explicit", unsupported: 0 },
  abilities: [{
    id: `${id}-play`,
    trigger: "onPlay",
    costs: [],
    effects: target ? [{ type: "damage", amount: 1, target }] : [{ type: "draw", amount: 1 }],
  }],
});

const player = (hand = [], reserve = 0) => ({
  heroId: "gimble",
  level: 1,
  life: 30,
  maxLife: 30,
  energy: 0,
  maxEnergy: 3,
  reserve,
  hand,
  deck: [{ id: "draw", type: "Criatura", cost: 0, abilities: [], tags: [], subtypes: [] }],
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

const responseState = (responderHand = [], responderReserve = 0) => syncPriorityMetadata({
  active: 0,
  phase: "principal",
  round: 3,
  events: 0,
  winner: null,
  players: [player(), player(responderHand, responderReserve)],
  pendingAction: { type: "playCard", owner: 0, cardId: "root" },
  pendingResponse: { responder: 1, actor: 0, action: "root", passes: 0 },
});

test("Assisted auto-passes immediately when responder has no legal action", () => {
  const game = responseState();
  assert.deepEqual(legalPriorityResponses(game, 1), []);
  assert.equal(shouldAutoPass(game, 1, "assisted"), true);
  assert.equal(shouldAutoPass(game, 1, "full-control"), false);
});

test("an Acelerado without enough reserve does not hold Assisted priority", () => {
  const game = responseState([accelerated("fast", { cost: 2 })], 1);
  assert.deepEqual(legalPriorityResponses(game, 1), []);
  assert.equal(shouldAutoPass(game, 1, "assisted"), true);
});

test("an Acelerado with no valid required target does not hold Assisted priority", () => {
  const game = responseState([accelerated("targeted", { target: "enemyCreature" })], 0);
  assert.deepEqual(legalPriorityResponses(game, 1), []);
  assert.equal(shouldAutoPass(game, 1, "assisted"), true);
});

test("a genuinely executable Acelerado keeps the response window open", () => {
  const game = responseState([accelerated("free")], 0);
  assert.ok(legalPriorityResponses(game, 1).some((command) => command.cardId === "free"));
  assert.equal(shouldAutoPass(game, 1, "assisted"), false);
});

test("Online runtime auto-passes from authoritative pendingResponse instead of waiting for the modal", async () => {
  const runtime = await readFile(new URL("../app/online-match-runtime.tsx", import.meta.url), "utf8");
  assert.match(runtime, /import \{ shouldAutoPass \} from "\.\/rules-engine\/priority\.mjs"/);
  assert.match(runtime, /pending\.responder !== 0 \|\| !shouldAutoPass\(game as any, 0, "assisted"\)/);
  assert.match(runtime, /command: \{ type: "passPriority", auto: true \}/);
  assert.match(runtime, /responseControl !== "assisted"/);
  assert.match(runtime, /const ASSISTED_PASS_DELAY_MS = 45/);
  assert.match(runtime, /const POLL_MS = 320/);
});
