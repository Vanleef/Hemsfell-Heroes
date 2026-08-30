import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";
import { buildAIActionCandidates, canAIPlayLifeCost, chooseAIDecision } from "../app/rules-engine/ai.mjs";

const catalog = cards.map(compileCard);
const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const byName = (name) => compileCard(cards.find((card) => normalize(card.name) === normalize(name)));
const makeState = (level = 1) => ({
  active: 0, phase: "principal", round: 2, cardCatalog: catalog,
  players: [0,1].map((owner) => ({ heroId: owner ? "gimble" : "saymon", level: owner ? 1 : level, heroXP: 0, markers: {}, abilityUses: {}, life: 30, maxLife: 30, energy: 10, maxEnergy: 10, reserve: 0, deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [], turnCardsPlayed: 0, turnSpellsPlayed: 0, lifeLostThisTurn: 0, lifeLossEvents: 0 }))
});
const field = (card, uid, slot = 0) => ({ ...card, uid, slot, summoning: false, exhausted: false, enteredRound: 0, damage: 0, modifiers: [], grantedKeywords: [], temporaryTags: [] });

test("hero damage is also one authoritative life-loss event for Saymon", () => {
  const game = makeState();
  defaultEffectHandlers.damage(game, { type: "damage", amount: 3 }, { owner: 1, sourceId: "bolt", targetIds: ["enemy-hero"] });
  assert.equal(game.players[0].life, 27);
  assert.equal(game.players[0].lifeLostThisTurn, 3);
  assert.equal(game.players[0].lifeLossEvents, 1);
  assert.equal(game.players[0].heroXP, 1);
  assert.equal(game.rulesEvents.filter((event) => event.type === "onLifeLost").length, 1);
  assert.equal(game.rulesEvents.find((event) => event.type === "onLifeLost").damage, true);
});

test("direct combat damage counts toward Saymon life loss", () => {
  const game = makeState(); game.active = 1; game.phase = "combate";
  game.players[1].board.push({ uid: "attacker", id: "attacker", name: "Attacker", type: "Criatura", atk: 3, hp: 3, tags: [], abilities: [], slot: 0, exhausted: false, summoning: false, damage: 0 });
  const next = executeCommand(game, { type: "attack", owner: 1, attackerId: "attacker" }).state;
  assert.equal(next.players[0].life, 27);
  assert.equal(next.players[0].lifeLossEvents, 1);
  assert.equal(next.players[0].heroXP, 1);
});

test("Discípulo only grows from controller life loss during controller turn", () => {
  let game = makeState(); const disciple = field(byName("Discípulo de Sangue"), "disciple"); game.players[0].board.push(disciple);
  game = executeCommand(game, { type: "emit", owner: 0, event: { type: "onLifeLost", owner: 0, amount: 1, lifeLossIndex: 1 } }).state;
  assert.equal(game.players[0].board[0].modifiers.reduce((n,m)=>n+(m.attack||0),0), 1);
  game = executeCommand(game, { type: "emit", owner: 0, event: { type: "onLifeLost", owner: 1, amount: 1, lifeLossIndex: 1 } }).state;
  assert.equal(game.players[0].board[0].modifiers.reduce((n,m)=>n+(m.attack||0),0), 1);
  game.active = 1;
  game = executeCommand(game, { type: "emit", owner: 1, event: { type: "onLifeLost", owner: 0, amount: 1, lifeLossIndex: 2 } }).state;
  assert.equal(game.players[0].board[0].modifiers.reduce((n,m)=>n+(m.attack||0),0), 1);
});

test("Morcego Rastreador draws only on controller first life loss of the turn", () => {
  let game = makeState(); game.players[0].board.push(field(byName("Morcego Rastreador"), "bat")); game.players[0].deck.push({id:"a"},{id:"b"},{id:"c"});
  game = executeCommand(game, { type: "emit", owner: 0, event: { type: "onLifeLost", owner: 0, amount: 1, lifeLossIndex: 1 } }).state;
  assert.equal(game.players[0].hand.length, 1);
  game = executeCommand(game, { type: "emit", owner: 0, event: { type: "onLifeLost", owner: 0, amount: 1, lifeLossIndex: 2 } }).state;
  assert.equal(game.players[0].hand.length, 1);
});

test("Condutor opens a real choice and its alternate path pays life as a cost", () => {
  let game = makeState(3); const condutor = { ...byName("Condutor de Rasnóvia"), id: "condutor", cost: 0 }; game.players[0].hand.push(condutor); game.players[0].deck.push({ id:"vamp", uid:"vamp", name:"Vampiro Forte", type:"Criatura", cost:4, subtypes:["Vampiro"], tags:[], text:"", abilities:[] });
  game = executeCommand(game, { type: "playCard", owner: 0, cardId: "condutor", slot: 0, skipPriority: true }).state;
  assert.equal(game.pendingDecision?.kind, "choice");
  game = executeCommand(game, { type: "resolveDecision", owner: 0, choiceIndex: 1 }).state;
  assert.equal(game.players[0].life, 26);
  assert.equal(game.players[0].lifeLossEvents, 1);
  assert.equal(game.pendingDecision?.kind, "search");

  let low = makeState(3); low.players[0].life = 4; low.players[0].hand.push({ ...condutor, id:"condutor-low" }); low.players[0].deck.push({ id:"v2", name:"Vampiro Forte", type:"Criatura", cost:4, subtypes:["Vampiro"], tags:[], text:"", abilities:[] });
  low = executeCommand(low, { type:"playCard", owner:0, cardId:"condutor-low", slot:0, skipPriority:true }).state;
  assert.throws(() => executeCommand(low, { type:"resolveDecision", owner:0, choiceIndex:1 }), /not-enough-life/);
});

test("Olhos Sangrentos has no free Veloz and gains it only after paying 2 life", () => {
  const printed = byName("Olhos Sangrentos"); assert.equal((printed.tags||[]).some((tag)=>/veloz/i.test(tag)), false);
  let game = makeState(3); const eyes = field(printed, "eyes"); game.players[0].board.push(eyes); const ability = eyes.abilities.find((a)=>a.trigger === "activated");
  game = executeCommand(game, { type:"activate", owner:0, sourceId:"eyes", abilityId:ability.id }).state;
  assert.equal(game.players[0].life, 28);
  assert.ok(game.players[0].board[0].temporaryTags.some((tag)=>/veloz/i.test(tag)));
});

test("Castelo Carmesim counts only life losses witnessed by that card instance", () => {
  let game = makeState(); game.players[0].lifeLossEvents = 8; game.players[0].deck.push({id:"drawn"}); const castle = field(byName("Castelo Carmesim"), "castle"); game.players[0].support.push(castle);
  game = executeCommand(game, { type:"emit", owner:0, event:{ type:"onLifeLost", owner:0, amount:1, lifeLossIndex:9 } }).state;
  assert.equal(game.players[0].hand.length, 1);
  assert.equal(game.players[0].support[0].crimsonLifeLossCount, 1);
  game.round = 3; game.players[0].deck.push({id:"drawn2"});
  game = executeCommand(game, { type:"emit", owner:0, event:{ type:"onLifeLost", owner:0, amount:1, lifeLossIndex:10 } }).state;
  assert.equal(game.players[0].support[0].crimsonLifeLossCount, 1);
});

test("Saymon I can hit allied creatures but never Saymon himself; Saymon II is permanent", () => {
  let game = makeState(1); game.players[0].board.push({ uid:"ally", id:"ally", name:"Ally", type:"Criatura", atk:1, hp:3, tags:[], abilities:[], slot:0, damage:0, exhausted:false, summoning:false });
  game = executeCommand(game, { type:"activateHero", owner:0, abilityId:"saymon-level-1", targetIds:["ally"] }).state;
  assert.equal(game.players[0].board[0].damage, 1);
  const invalid = makeState(1); assert.throws(() => executeCommand(invalid, { type:"activateHero", owner:0, abilityId:"saymon-level-1", targetIds:["ally-hero"] }), /invalid-target|ability-not-available/);

  let level2 = makeState(2); level2.players[0].board.push({ uid:"ally2", id:"ally2", name:"Ally", type:"Criatura", atk:1, hp:3, tags:[], abilities:[], slot:0, damage:0, exhausted:false, summoning:false, grantedKeywords:[], temporaryTags:[] });
  level2 = executeCommand(level2, { type:"activateHero", owner:0, abilityId:"saymon-level-2", targetIds:["ally2"] }).state;
  assert.ok(level2.players[0].board[0].grantedKeywords.some((tag)=>/roubo de vida/i.test(tag)));
  assert.equal(level2.players[0].board[0].temporaryTags.some((tag)=>/roubo de vida/i.test(tag)), false);
});

test("Saymon AI supplies Cobra markerAmount and avoids unsafe life activations", () => {
  const cobra = field(compileCard(cards.find((card) => Number(card.page) === 134)), "cobra"); cobra.markers = { action: 3 };
  const eyes = field(byName("Olhos Sangrentos"), "eyes", 1);
  const game = makeState(3); game.players[0].life = 25; game.players[0].board.push(cobra, eyes); game.players[1].board.push({uid:"enemy",id:"enemy",name:"Enemy",type:"Criatura",atk:2,hp:2,tags:[],abilities:[],slot:0,damage:0,exhausted:false,summoning:false});
  const commands = buildAIActionCandidates(game, 0, "Normal");
  const cobraCommand = commands.find((command)=>command.type === "activate" && command.sourceId === "cobra");
  assert.equal(cobraCommand?.markerAmount, 3);
  assert.equal(canAIPlayLifeCost({ text:"Pague 4 de vida" }, { heroId:"saymon", level:3, life:4 }), false);
  assert.equal(canAIPlayLifeCost({ text:"Pague 4 de vida" }, { heroId:"saymon", level:3, life:5 }), true);

  const unsafe = makeState(3); unsafe.players[0].life = 4; unsafe.players[0].board.push(field(byName("Olhos Sangrentos"), "unsafe-eyes")); unsafe.players[1].board.push({uid:"enemy",id:"enemy",name:"Enemy",type:"Criatura",atk:2,hp:2,tags:[],abilities:[],slot:0,damage:0,exhausted:false,summoning:false});
  assert.equal(buildAIActionCandidates(unsafe,0,"Normal").some((command)=>command.type === "activate" && command.sourceId === "unsafe-eyes"), false);
});

test("Condutor AI never chooses the 4-life branch when Saymon III cannot pay it", () => {
  const game = makeState(3); game.players[0].life = 4; game.players[0].deck.push({id:"v",name:"V",type:"Criatura",cost:4,subtypes:["Vampiro"]}); game.pendingDecision = { kind:"choice", owner:0, effect:{ aiPolicy:"saymon-condutor", choices:[[],[]] }, context:{ owner:0 } };
  assert.equal(chooseAIDecision(game,0,"Difícil").choiceIndex, 0);
});
