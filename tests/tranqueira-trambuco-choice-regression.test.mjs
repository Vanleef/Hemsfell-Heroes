import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileCard } from "../app/rules-engine/compiler.mjs";
import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { chooseAIDecision } from "../app/rules-engine/ai.mjs";

const goblin = (uid, slot) => ({ uid, id: uid, name: `Goblin ${uid}`, type: "Criatura", cost: 1, atk: 1, hp: 3, damage: 0, tags: [], subtypes: ["Goblin"], abilities: [], modifiers: [], slot, exhausted: false, summoning: false, defenseUses: 0 });
const tranqueira = () => ({ ...compileCard({ page: 46, id: "p46", name: "TRANQUEIRA-MÁTICA ELETROSTÁTICA", type: "Feitiço", cost: 1, text: "", tags: [] }), uid: "tranqueira", slot: 0, enteredRound: 1, damage: 0, exhausted: false, summoning: false, modifiers: [], cardsPlayedAfterSelf: 6, remainUntilTurnEnd: true });
const trambuco = () => ({ ...compileCard({ page: 38, id: "p38", name: "TRAMBUCO DO PIPOCO", type: "Artefato", cost: 0, text: "", tags: ["Veloz"] }), imageCard: true });
const state = () => ({ active: 0, phase: "combate", round: 1, cardCatalog: [trambuco()], players: [0, 1].map(() => ({ heroId: "goblin", level: 1, life: 30, maxLife: 30, energy: 0, maxEnergy: 10, reserve: 0, deck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [], extraDeck: [trambuco()], abilityUses: {}, turnCardsPlayed: 0, turnSpellsPlayed: 0 })) });

const enterEndStep = (game) => executeCommand(game, { type: "advancePhase", owner: 0 }).state;
const finishTurn = (game) => executeCommand(game, { type: "advancePhase", owner: 0 }).state;

test("p46 six-card branch uses the canonical Trambuco name and Goblin attachment policy", () => {
  const turnEnd = explicitCardRules.p46.find((ability) => ability.trigger === "onTurnEnd");
  const branch = turnEnd.effects[0].branches.find((entry) => entry.min === 6 && entry.max === 6);
  const reward = branch.effects[0];
  assert.equal(reward.name, "TRAMBUCO DO PIPOCO");
  assert.equal(reward.autoAttachSubtype, "Goblin");
  assert.equal(reward.chooseAttachmentIfMultiple, true);
  assert.equal(reward.ignoreSupportPage, 46);
  assert.equal(reward.skipIfNoValidPlacement, true);
});

test("one valid Goblin receives Trambuco automatically", () => {
  const game = state();
  game.players[0].board.push(goblin("g1", 0));
  game.players[0].support.push(tranqueira());
  const result = enterEndStep(game);
  assert.equal(result.phase, "fim");
  assert.equal(result.pendingDecision ?? null, null);
  const artifact = result.players[0].support.find((card) => card.page === 38);
  assert.ok(artifact, "six-card reward should create the real artifact");
  assert.equal(artifact.name, "TRAMBUCO DO PIPOCO");
  assert.equal(artifact.attachedTo, "g1");
  assert.ok(result.players[0].grave.some((card) => card.page === 46));
});

test("two valid Goblins require the controller to choose the attachment target", () => {
  const game = state();
  game.players[0].board.push(goblin("g1", 0), goblin("g2", 1));
  game.players[0].support.push(tranqueira());
  const waiting = enterEndStep(game);
  assert.equal(waiting.phase, "fim");
  assert.equal(waiting.pendingDecision?.kind, "targets");
  assert.equal(waiting.pendingDecision?.owner, 0);
  assert.deepEqual(new Set(waiting.pendingDecision?.targetSteps?.[0]?.allowedIds || []), new Set(["g1", "g2"]));
  assert.equal(waiting.players[0].support.some((card) => card.page === 38), false);

  const resolved = executeCommand(waiting, { type: "resolveDecision", owner: 0, targetIds: ["g2"] }).state;
  const artifact = resolved.players[0].support.find((card) => card.page === 38);
  assert.ok(artifact);
  assert.equal(artifact.attachedTo, "g2");
  assert.ok(resolved.players[0].grave.some((card) => card.page === 46));
});

test("an occupied auxiliary slot removes that Goblin from the attachment choices", () => {
  const game = state();
  game.players[0].board.push(goblin("g1", 0), goblin("g2", 1));
  game.players[0].support.push(tranqueira(), { uid: "occupied", id: "occupied", page: 999, name: "Outra constante", type: "Encanto", slot: 1, tags: [], abilities: [] });
  const result = enterEndStep(game);
  assert.equal(result.phase, "fim");
  assert.equal(result.pendingDecision ?? null, null);
  const artifact = result.players[0].support.find((card) => card.page === 38);
  assert.ok(artifact);
  assert.equal(artifact.attachedTo, "g1");
});

test("zero valid Goblins skips the reward without locking end of turn", () => {
  const game = state();
  game.players[0].support.push(tranqueira());
  const endStep = enterEndStep(game);
  assert.equal(endStep.phase, "fim");
  assert.equal(endStep.pendingDecision ?? null, null);
  assert.equal(endStep.players[0].support.some((card) => card.page === 38), false);
  assert.ok(endStep.players[0].grave.some((card) => card.page === 46));

  const result = finishTurn(endStep);
  assert.equal(result.active, 1);
  assert.equal(result.phase, "manutencao");
});

test("local bot UI asks for a Goblin when multiple hosts exist and honors the chosen uid", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /"tranqueira-attach"/);
  assert.match(page, /function tranqueiraAttachmentChoice\(state:Game,owner:0\|1\)/);
  assert.match(page, /allowedIds\.length>1/);
  assert.match(page, /chosenTranqueiraHostUid=uid/);
  assert.match(page, /summonImage\(g,owner,"TRAMBUCO DO PIPOCO",undefined,false,\(x as any\)\.chosenTranqueiraHostUid\)/);
  assert.match(page, /attachedToUid\?:string/);
});

test("Sr. Goblin AI resolves the mandatory Trambique image attachment without locking the turn", async () => {
  const game = state();
  game.active = 1;
  game.players[1].board.push(goblin("ai-g1", 0), goblin("ai-g2", 1));
  game.players[1].support.push(tranqueira());
  const waiting = executeCommand(game, { type: "advancePhase", owner: 1 }).state;
  assert.equal(waiting.pendingDecision?.owner, 1);
  const decision = chooseAIDecision(waiting, 1, "Difícil");
  assert.equal(decision?.type, "resolveDecision");
  assert.equal(decision?.targetIds?.length, 1);
  const resolved = executeCommand(waiting, decision).state;
  assert.equal(resolved.pendingDecision ?? null, null);
  assert.ok(resolved.players[1].support.some((card) => card.page === 38 && card.attachedTo));

  const runtime = await readFile(new URL("../app/rules-engine/ai-system/runtime.ts", import.meta.url), "utf8");
  assert.match(runtime, /const decision = chooseAIDecision\(/);
  assert.match(runtime, /return decision \?\? chooseAdvancedAIAction/);
});
