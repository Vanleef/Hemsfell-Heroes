import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { cardPlayTargetPolicy } from "../app/rules-engine/targeting.mjs";

const state = () => ({
  active: 0, phase: "principal", round: 1, cardCatalog: cards.map(compileCard),
  players: [0, 1].map(() => ({ life: 30, maxLife: 30, energy: 10, maxEnergy: 10, reserve: 0, deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [], abilityUses: {}, nextElementEffects: [], turnCardsPlayed: 0, turnSpellsPlayed: 0, spellsPlayed: 0 })),
});
const printed = (page, overrides = {}) => compileCard({ ...cards.find((card) => card.page === page), ...overrides });
const unit = (id, owner = 0, overrides = {}) => ({ uid: id, id, name: id, type: "Criatura", cost: 1, atk: 2, hp: 4, text: "", tags: [], abilities: [], slot: owner, damage: 0, modifiers: [], exhausted: false, summoning: false, ...overrides });
const spell = (id, element = "Fogo", effects = []) => ({ id, name: id, type: "Feitiço", cost: 0, text: `Elemento: ${element}`, tags: [element], abilities: [{ id: `${id}-play`, trigger: "onPlay", costs: [], effects }] });
const cast = (game, card, targetIds = [], extra = {}) => { game.players[0].hand.push(card); return executeCommand(game, { type: "playCard", owner: 0, cardId: card.id, targetIds, skipPriority: true, ...extra }).state; };

test("Anel de Safira preenche a reserva, não ativa cheio e é destruído", () => {
  for (const reserve of [0, 1, 2]) {
    const game = state(), ring = { ...printed(60), uid: `ring-${reserve}`, slot: 0, exhausted: false, summoning: false, enteredRound: 0 };
    game.players[0].reserve = reserve; game.players[0].support.push(ring);
    const ability = ring.abilities.find((entry) => entry.trigger === "activated");
    const result = executeCommand(game, { type: "activate", owner: 0, sourceId: ring.uid, abilityId: ability.id }).state;
    assert.equal(result.players[0].reserve, 3); assert.equal(result.players[0].support.length, 0); assert.equal(result.players[0].grave.length, 1);
  }
  const full = state(), ring = { ...printed(60), uid: "ring-full", slot: 0, exhausted: false, summoning: false, enteredRound: 0 };
  full.players[0].reserve = 3; full.players[0].support.push(ring);
  assert.throws(() => executeCommand(full, { type: "activate", owner: 0, sourceId: ring.uid, abilityId: ring.abilities.find((entry) => entry.trigger === "activated").id }), /ability-not-available/);
});

test("Punho Sísmico exige criatura e aceita um ou dois alvos distintos", () => {
  const fist = printed(56, { cost: 0 }); const policy = cardPlayTargetPolicy(fist);
  assert.equal(policy.selections, 2); assert.equal(policy.minimumSelections, 1); assert.equal(policy.steps[1].optional, true);
  const empty = state(); empty.players[0].hand.push(fist);
  assert.throws(() => executeCommand(empty, { type: "playCard", owner: 0, cardId: fist.id, targetIds: [] }), /play-condition-not-met/);
  const one = state(); one.players[1].board.push(unit("only"));
  const oneResult = cast(one, fist, ["only"]); assert.equal(oneResult.players[1].board[0].damage, 1);
  const two = state(); two.players[0].board.push(unit("ally")); two.players[1].board.push(unit("enemy"));
  const twoResult = cast(two, printed(56, { cost: 0 }), ["ally", "enemy"]);
  assert.equal(twoResult.players[0].board[0].damage, 1); assert.equal(twoResult.players[1].board[0].damage, 1);
  const duplicate = state(); duplicate.players[1].board.push(unit("same")); duplicate.players[0].hand.push(printed(56, { cost: 0 }));
  assert.throws(() => executeCommand(duplicate, { type: "playCard", owner: 0, cardId: "p56", targetIds: ["same", "same"] }), /invalid-target-count/);
});

test("Maestria Elemental cria somente a imagem escolhida do deck extra", () => {
  const game = state(); game.players[0].extraDeck = [71, 72, 73, 74, 81].map((page) => printed(page));
  const result = cast(game, printed(70, { cost: 0 }), [], { selectedImageName: "Maestria Elemental: Hidromancia", slot: 2 });
  assert.equal(printed(70).type, "Feitiço"); assert.equal(result.players[0].support.length, 1); assert.ok(result.players[0].support.some((card) => card.page === 72)); assert.equal(result.players[0].grave.some((card) => card.page === 70), true); assert.equal(result.pendingDecision, undefined);
});

test("Hidromancia e Aeromancia disparam no primeiro feitiço de cada turno global", () => {
  let game = state(); game.players[0].life = 20; game.players[0].support.push({ ...printed(72), uid: "hydro", slot: 0, summoning: false, exhausted: false });
  game = cast(game, spell("water-1", "Água")); assert.equal(game.players[0].life, 23);
  game = cast(game, spell("water-2", "Água")); assert.equal(game.players[0].life, 23);
  game.round = 2; game.active = 1; game.phase = "principal";
  game.players[0].hand.push({ ...spell("water-response", "Água"), tags: ["Água", "Acelerado"] }); game.players[0].reserve = 1;
  game = executeCommand(game, { type: "playCard", owner: 0, cardId: "water-response", hasPriority: true, skipPriority: true }).state;
  assert.equal(game.players[0].life, 26, "a resposta no turno adversário conta como um novo turno");

  let air = state(); air.players[0].support.push({ ...printed(71), uid: "aero", slot: 0, summoning: false, exhausted: false });
  air.players[0].reserve = 2; air = cast(air, spell("air-1", "Ar")); assert.equal(air.players[0].reserve, 3);
  air.round = 2; air.players[0].reserve = 3; air = cast(air, spell("air-full", "Ar")); assert.equal(air.players[0].reserve, 3);
  air.players[0].reserve = 2; air = cast(air, spell("air-after-full", "Ar")); assert.equal(air.players[0].reserve, 3, "o feitiço usado com reserva cheia não consome o gatilho");
});

test("Geomancia é opcional, só abre com criaturas e respeita o piso 1", () => {
  let empty = state(); empty.players[0].support.push({ ...printed(73), uid: "geo", slot: 0 }); empty = cast(empty, spell("earth-empty", "Terra")); assert.equal(empty.pendingDecision, undefined);
  empty.players[1].board.push(unit("geo-target", 1, { atk: 2, hp: 2 })); empty = cast(empty, spell("earth-live", "Terra"));
  assert.equal(empty.pendingDecision.kind, "choice-target");
  empty = executeCommand(empty, { type: "resolveDecision", owner: 0 }).state; assert.equal(empty.players[1].board[0].atk, 2);
  empty.round = 2; empty = cast(empty, spell("earth-reduce", "Terra"));
  empty = executeCommand(empty, { type: "resolveDecision", owner: 0, choiceIndex: 1, targetIds: ["geo-target"] }).state;
  const healthModifier = empty.players[1].board[0].modifiers.reduce((sum, modifier) => sum + (modifier.health || 0), 0);
  assert.equal(empty.players[1].board[0].hp + healthModifier, 1);
});

test("Piromancia adiciona 2 ao dano e causa o excesso ao herói", () => {
  const game = state(); game.players[0].support.push({ ...printed(74), uid: "pyro", slot: 0 }); game.players[1].board.push(unit("victim", 1, { hp: 2 }));
  const result = cast(game, spell("fire-damage", "Fogo", [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }]), ["victim"]);
  assert.equal(result.players[1].board.length, 0); assert.equal(result.players[1].life, 29);
});

test("Orbe Cromático simula o elemento escolhido e ainda causa 1 de dano", () => {
  const game = state(); game.players[0].life = 20; game.players[0].support.push({ ...printed(72), uid: "hydro-orb", slot: 0 }); game.players[1].board.push(unit("orb-target"));
  const result = cast(game, printed(55, { cost: 0 }), ["orb-target"], { chosenElement: "Água" });
  assert.equal(result.players[1].board[0].damage, 1); assert.equal(result.players[0].life, 23);
  const empty = state(); empty.players[0].hand.push(printed(55, { cost: 0 }));
  assert.throws(() => executeCommand(empty, { type: "playCard", owner: 0, cardId: "p55", chosenElement: "Fogo", targetIds: [] }), /play-condition-not-met|invalid-target-count/);
});

test("Feiticeira Espectral consome X marcadores e busca um feitiço de custo até X", () => {
  const sick = state(), sickWitch = { ...printed(80), uid: "sick-witch", slot: 0, markers: 1, summoning: true, exhausted: false };
  sick.players[0].board.push(sickWitch);
  assert.throws(() => executeCommand(sick, { type: "activate", owner: 0, sourceId: sickWitch.uid, abilityId: sickWitch.abilities.find((entry) => entry.trigger === "activated").id, markerAmount: 1 }), /summoning-sickness/);

  const game = state(), witch = { ...printed(80), uid: "witch", slot: 0, markers: 2, summoning: false, exhausted: false };
  const cheap = spell("cheap", "Água"), expensive = { ...spell("expensive", "Fogo"), cost: 3 };
  cheap.cost = 2; game.players[0].board.push(witch); game.players[0].deck.push(cheap, expensive);
  const ability = witch.abilities.find((entry) => entry.trigger === "activated");
  let result = executeCommand(game, { type: "activate", owner: 0, sourceId: witch.uid, abilityId: ability.id, markerAmount: 2 }).state;
  assert.equal(result.players[0].board[0].markers, 0);
  assert.equal(result.pendingDecision.kind, "search");
  assert.equal(result.pendingDecision.context.markerAmount, 2);
  result = executeCommand(result, { type: "resolveDecision", owner: 0, selectedCardIds: [cheap.id] }).state;
  assert.equal(result.players[0].hand.at(-1).id, cheap.id);
  assert.ok(result.players[0].deck.some((card) => card.id === expensive.id));

  const stale = state(), canonical = printed(80), staleWitch = { ...canonical, uid: "stale-witch", slot: 0, markers: 1, summoning: false, exhausted: false, abilities: canonical.abilities.filter((entry) => entry.trigger !== "activated") };
  stale.players[0].board.push(staleWitch); stale.players[0].deck.push({ ...spell("cost-one", "Ar"), cost: 1 }, { ...spell("cost-two", "Terra"), cost: 2 });
  const activatedId = canonical.abilities.find((entry) => entry.trigger === "activated").id;
  const recovered = executeCommand(stale, { type: "activate", owner: 0, sourceId: staleWitch.uid, abilityId: activatedId, markerAmount: 1 }).state;
  assert.equal(recovered.players[0].board[0].markers, 0, "uma sala antiga também consome o marcador");
  assert.equal(recovered.pendingDecision.context.markerAmount, 1, "um marcador limita a busca a custo 1 ou 0");
  assert.equal(recovered.pendingDecision.effect.maxCostFromMarkerAmount, true);
  const recoveredSearch = executeCommand(recovered, { type: "resolveDecision", owner: 0, selectedCardIds: ["cost-one"] }).state;
  assert.equal(recoveredSearch.players[0].hand.at(-1).id, "cost-one");
  assert.ok(recoveredSearch.players[0].deck.some((card) => card.id === "cost-two"));
});

test("Tufão devolve todas as criaturas aos donos e dissipa Imagens", () => {
  const game = state();
  game.players[0].board.push(unit("ally"), unit("ally-image", 0, { imageCard: true, generatedImage: true }));
  game.players[1].board.push(unit("enemy", 1));
  const result = cast(game, printed(66, { cost: 0 }));
  assert.equal(result.players[0].board.length + result.players[1].board.length, 0);
  assert.ok(result.players[0].hand.some((card) => card.id === "ally"));
  assert.ok(result.players[1].hand.some((card) => card.id === "enemy"));
  assert.ok(!result.players[0].hand.some((card) => card.id === "ally-image"));
});

test("Levantar Maré em resposta permite escolher o Clone de Água como defensor", () => {
  const game = state(); game.phase = "combate"; game.players[0].board.push(unit("attacker"));
  game.players[1].reserve = 3; game.players[1].hand.push(printed(61, { cost: 0 })); game.players[1].extraDeck.push(printed(81));
  let result = executeCommand(game, { type: "declareAttack", owner: 0, attackerId: "attacker" }, { priority: true }).state;
  result = executeCommand(result, { type: "playCard", owner: 1, cardId: "p61", hasPriority: true }, { priority: true }).state;
  result = executeCommand(result, { type: "passPriority", owner: 0 }, { priority: true }).state;
  result = executeCommand(result, { type: "passPriority", owner: 1 }, { priority: true }).state;
  const clone = result.players[1].board.find((card) => /clone de água/i.test(card.name));
  assert.ok(clone);
  result = executeCommand(result, { type: "passPriority", owner: 1 }, { priority: true }).state;
  result = executeCommand(result, { type: "passPriority", owner: 0 }, { priority: true }).state;
  assert.equal(result.combatAction.stage, "choosing");
  result = executeCommand(result, { type: "selectDefender", owner: 1, defenderId: clone.uid }).state;
  assert.equal(result.combatAction.defenderUid, clone.uid);
});

test("Uruk III repete no fim do turno o último feitiço usado naquele turno", () => {
  let game = state(); game.players[0].heroId = "uruk"; game.players[0].level = 3; game.players[1].board.push(unit("old-target", 0, { hp: 5 }), unit("uruk-target", 1, { hp: 5 }));
  game = cast(game, spell("earlier-spell", "Água", [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }]), ["old-target"]);
  game = cast(game, spell("last-spell", "Fogo", [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }]), ["uruk-target"]);
  assert.deepEqual(game.players[1].board.map((card) => card.damage), [1, 1]);
  game.phase = "combate";
  game = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.phase, "fim");
  assert.equal(game.pendingDecision.kind, "targets");
  assert.equal(game.pendingDecision.sourceName, "Uruk I · Fogo");
  game = executeCommand(game, { type: "resolveDecision", owner: 0, targetIds: ["enemy-hero"] }).state;
  assert.equal(game.pendingDecision.sourceName, "Uruk III · last-spell");
  game = executeCommand(game, { type: "resolveDecision", owner: 0, targetIds: ["old-target"] }).state;
  assert.deepEqual(game.players[1].board.map((card) => card.damage), [2, 1], "o último feitiço recebe uma nova seleção de alvo");
  assert.equal(game.players[0].lastSpellReplay, undefined, "a cópia é consumida uma única vez");
});

test("Uruk III não abre seleção quando o último feitiço não possui mais alvo válido", () => {
  let game = state(); game.players[0].heroId = "uruk"; game.players[0].level = 3; game.players[1].board.push(unit("only-target", 1, { hp: 1 }));
  game = cast(game, spell("lethal-last-spell", "Água", [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }]), ["only-target"]);
  assert.equal(game.players[1].board.length, 0);
  game.phase = "combate";
  game = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.pendingDecision, undefined);
});

test("Uruk I resolve corretamente Fogo, Terra, Água e Ar no fim do turno", () => {
  const ending = (element) => { const game = state(); game.players[0].heroId = "uruk"; game.players[0].level = 1; game.players[0].lastSpellElement = element; game.phase = "combate"; return executeCommand(game, { type: "advancePhase", owner: 0 }).state; };

  const fire = ending("Fogo"); assert.equal(fire.pendingDecision.sourceName, "Uruk I · Fogo");
  const earthGame = state(); earthGame.players[0].heroId = "uruk"; earthGame.players[0].level = 1; earthGame.players[0].lastSpellElement = "Terra"; earthGame.players[0].deck.push({ id: "drawn" }); earthGame.phase = "combate";
  const earth = executeCommand(earthGame, { type: "advancePhase", owner: 0 }).state; assert.equal(earth.players[0].hand[0].id, "drawn");
  const waterGame = state(); waterGame.players[0].heroId = "uruk"; waterGame.players[0].level = 1; waterGame.players[0].life = 20; waterGame.players[0].lastSpellElement = "Água"; waterGame.phase = "combate";
  const water = executeCommand(waterGame, { type: "advancePhase", owner: 0 }).state; assert.equal(water.players[0].life, 21);
  const airGame = state(); airGame.players[0].heroId = "uruk"; airGame.players[0].level = 1; airGame.players[0].energy = 3; airGame.players[0].lastSpellElement = "Ar"; airGame.phase = "combate";
  const air = executeCommand(airGame, { type: "advancePhase", owner: 0 }).state; assert.equal(air.players[0].energy, 4);
});

test("Eclipse Final causa duas vezes o total de feitiços do turno incluindo ela mesma", () => {
  let game = state();
  game = cast(game, spell("first-spell", "Ar"));
  game = cast(game, spell("second-spell", "Terra"));
  game = cast(game, printed(75, { cost: 0 }), ["enemy-hero"]);
  assert.equal(game.players[1].life, 24);
  assert.equal(game.players[0].turnSpellsPlayed, 3);
});

test("retornos dos demais decks reutilizam a regra de Imagens e bônus de subtipo", () => {
  let gelado = state(); gelado.players[1].board.push(unit("cat", 1, { cost: 4, subtypes: ["Gato"] }));
  gelado = cast(gelado, printed(224, { cost: 0 }), ["cat"]);
  assert.equal(gelado.players[1].hand[0].costModifier, -4);
  assert.equal(gelado.players[1].hand[0].costModifierExpiresRound, 2);

  let latte = state(); latte.players[1].board.push(unit("cat-latte", 1, { subtypes: ["Gato"] }));
  latte = cast(latte, printed(240, { cost: 0 }), ["cat-latte"]);
  assert.ok(latte.players[1].hand[0].tags.includes("Investida"));

  let image = state(); image.players[1].board.push(unit("cat-image", 1, { imageCard: true, generatedImage: true, subtypes: ["Gato"] }));
  image = cast(image, printed(224, { cost: 0 }), ["cat-image"]);
  assert.equal(image.players[1].hand.length, 0);
});

test("Contramedida e ativáveis de marcadores preservam quantidade e alvo", () => {
  let counter = state(); counter.players[0].board.push(unit("one")); counter.players[1].board.push(unit("two", 1));
  counter = cast(counter, printed(288, { cost: 0 }), ["one", "two"]);
  assert.equal(counter.players[0].board.length + counter.players[1].board.length, 0);

  let marker = state(), source = { ...printed(292), uid: "marker-source", slot: 0, summoning: false, exhausted: false, enteredRound: 0 }, target = unit("marker-target", 1, { markers: 0 });
  marker.players[0].board.push(source); marker.players[1].board.push(target);
  marker = executeCommand(marker, { type: "activate", owner: 0, sourceId: source.uid, abilityId: source.abilities[0].id, targetIds: [target.uid] }).state;
  assert.equal(marker.players[1].board[0].markers, 1);

  let ready = state(), readySource = { ...printed(294), uid: "ready-source", slot: 0, markers: 2, summoning: false, exhausted: false }, turned = unit("turned", 1, { exhausted: true });
  ready.players[0].board.push(readySource); ready.players[1].board.push(turned);
  ready = executeCommand(ready, { type: "activate", owner: 0, sourceId: readySource.uid, abilityId: readySource.abilities[0].id, targetIds: [turned.uid] }).state;
  assert.equal(ready.players[1].board[0].exhausted, false);
});

test("Bolha protege o próximo dano do herói sem alvo base", () => {
  let game = state(); game = cast(game, printed(62, { cost: 0 })); assert.equal(game.players[0].damageShields.length, 1);
  game = cast(game, spell("self-hit", "Terra", [{ type: "damage", amount: 5, target: "anyCharacter", selections: 1 }]), ["ally-hero"]);
  assert.equal(game.players[0].life, 30); assert.equal(game.players[0].damageShields.length, 0);
});

test("Nuvem Esmagadora acumula imposto e zera ataque aprimorado até o próximo turno", () => {
  let game = state(); game.players[0].nextElementEffects = [{ element: "Ar", keyword: "Teste", expires: "turn" }]; game.players[1].board.push(unit("cloud-target", 1, { atk: 5 }));
  game = cast(game, printed(65, { cost: 0 }), ["cloud-target"]);
  assert.equal(game.players[1].hand[0].attackZeroUntilOwnerMaintenance, 0); assert.equal(game.players[1].nextCreatureTaxes.length, 1);
  game.active = 1; game.round = 2; game.phase = "principal"; game.players[1].energy = 3; game.players[1].hand.push({ ...unit("taxed-creature", 1), id: "taxed-creature", uid: undefined, cost: 1 });
  game = executeCommand(game, { type: "playCard", owner: 1, cardId: "taxed-creature", slot: 0 }).state;
  assert.equal(game.players[1].energy, 1); assert.equal(game.players[1].nextCreatureTaxes.length, 0);
});

test("Arquimago e Golem resolvem passivamente sem solicitar alvo", () => {
  let game = state(); game.players[0].board.push({ ...printed(78), uid: "archmage", slot: 0, summoning: false, exhausted: false, modifiers: [] });
  game = cast(game, spell("arch-spell", "Ar")); assert.equal(game.pendingDecision, undefined); assert.equal(game.players[0].board[0].modifiers.at(-1).attack, 1);
  const noSpell = state(); noSpell.players[0].hand.push(printed(76, { cost: 0 })); const plain = executeCommand(noSpell, { type: "playCard", owner: 0, cardId: "p76", slot: 0 }).state.players[0].board[0];
  assert.equal(plain.tags.includes("Robusto") || plain.grantedKeywords?.includes("Robusto"), false); assert.ok(plain.tags.includes("Defensor 2"));
  const withSpell = state(); withSpell.players[0].turnSpellsPlayed = 1; withSpell.players[0].hand.push(printed(76, { cost: 0 })); const robust = executeCommand(withSpell, { type: "playCard", owner: 0, cardId: "p76", slot: 0 }).state.players[0].board[0];
  assert.ok(robust.grantedKeywords.includes("Robusto"));
});

test("fim do turno exige descarte até nove cartas", () => {
  let game = state(); game.phase = "fim"; game.players[0].hand = Array.from({ length: 11 }, (_, index) => ({ id: `h${index}`, name: `H${index}` }));
  game = executeCommand(game, { type: "advancePhase", owner: 0 }).state; assert.equal(game.pendingDecision.kind, "hand-limit-discard"); assert.equal(game.pendingDecision.effect.amount, 2);
  game = executeCommand(game, { type: "resolveDecision", owner: 0, selectedCardIds: ["h0", "h1"] }).state;
  assert.equal(game.players[0].hand.length, 9); assert.equal(game.players[0].grave.length, 2); assert.equal(game.active, 1);
});

test("lista de feitiços acelerados e bônus permanente de Biriba estão corretos", () => {
  for (const page of [57, 61, 62, 63, 64, 65]) assert.ok(cards.find((card) => card.page === page).tags.includes("Acelerado"), `p${page}`);
  const biriba = printed(30); assert.equal(biriba.abilities[0].effects[0].duration, "permanent");
});

test("Marcha dos Condenados seleciona simultaneamente uma ou duas criaturas com Último Suspiro", () => {
  const empty = state(); empty.players[0].hand.push(printed(122, { cost: 0 }));
  assert.throws(() => executeCommand(empty, { type: "playCard", owner: 0, cardId: "p122", skipPriority: true }), /play-condition-not-met/);

  let game = state();
  game.players[0].grave.push({ ...printed(10), uid: "last-1" }, { ...printed(116), uid: "last-2" }, { ...unit("plain"), uid: "plain" });
  game = cast(game, printed(122, { cost: 0 }));
  assert.equal(game.pendingDecision.kind, "grave-to-hand-many");
  assert.equal(game.pendingDecision.effect.maximum, 2);
  game = executeCommand(game, { type: "resolveDecision", owner: 0, selectedCardIds: ["last-1"] }).state;
  assert.ok(game.players[0].hand.some((card) => card.uid === "last-1"));
  assert.ok(game.players[0].grave.some((card) => card.uid === "last-2"));
});

test("Castigo e Café Derramado exigem um efeito realmente aplicado no turno", () => {
  let game = state(); game.players[1].board.push(unit("affected", 1));
  game = cast(game, spell("real-effect", "Terra", [{ type: "modifyStats", target: "anyCreature", selections: 1, attack: 1, health: 0, duration: "turn" }]), ["affected"]);
  assert.equal(game.players[1].board[0].effectAppliedRound, game.round);
  game = cast(game, printed(162, { cost: 0 }), ["affected"]);
  assert.equal(game.players[1].board.length, 0);

  const prevented = state(), shielded = unit("shielded", 1, { damageShields: [{ uses: 1, reduction: Number.POSITIVE_INFINITY }] });
  prevented.players[1].board.push(shielded);
  let result = cast(prevented, spell("prevented", "Fogo", [{ type: "damage", target: "anyCreature", selections: 1, amount: 3 }]), ["shielded"]);
  assert.equal(result.players[1].board[0].effectAppliedRound, undefined);
  result.players[0].hand.push(printed(226, { cost: 0 }));
  assert.throws(() => executeCommand(result, { type: "playCard", owner: 0, cardId: "p226", targetIds: ["shielded"], skipPriority: true }), /invalid-target/);
});

test("Abstinência de Café mantém a criatura virada até outro feitiço aplicar um efeito", () => {
  let game = state(); game.players[1].board.push(unit("abstinence", 1));
  game = cast(game, printed(227, { cost: 0 }), ["abstinence"]);
  assert.equal(game.players[1].board[0].exhausted, true);
  assert.ok(game.players[1].board[0].staysExhaustedUntilSpellEffect);
  assert.ok(game.players[1].board[0].grantedKeywords.some((keyword) => /abstinência/i.test(keyword)));
  game = cast(game, spell("later-effect", "Água", [{ type: "modifyStats", target: "anyCreature", selections: 1, attack: 0, health: 1, duration: "turn" }]), ["abstinence"]);
  assert.equal(game.players[1].board[0].staysExhaustedUntilSpellEffect, undefined);
  assert.ok(!game.players[1].board[0].grantedKeywords.some((keyword) => /abstinência/i.test(keyword)));
  assert.equal(game.players[1].board[0].exhausted, true, "o efeito deixa de prender, mas não desvira imediatamente");
});

test("Descarte Estratégico escolhe aleatoriamente e resolve o tipo descartado", () => {
  let creatureCase = state(); creatureCase.players[0].hand.push({ ...unit("discard-creature"), uid: undefined, cost: 4 });
  creatureCase = cast(creatureCase, printed(253, { cost: 0 }));
  assert.equal(creatureCase.pendingDecision.kind, "targets");
  creatureCase = executeCommand(creatureCase, { type: "resolveDecision", owner: 0, targetIds: ["enemy-hero"] }).state;
  assert.equal(creatureCase.players[1].life, 26);

  let spellCase = state(); spellCase.players[0].hand.push(spell("discard-spell")); spellCase.players[1].hand.push({ id: "opponent-card", name: "Carta adversária", type: "Criatura" });
  spellCase = cast(spellCase, printed(253, { cost: 0 }));
  assert.equal(spellCase.pendingDecision.kind, "hand-discard-one"); assert.equal(spellCase.pendingDecision.owner, 1);
  spellCase = executeCommand(spellCase, { type: "resolveDecision", owner: 1, selectedCardIds: ["opponent-card"] }).state;
  assert.equal(spellCase.players[1].hand.length, 0); assert.equal(spellCase.players[1].grave.length, 1);

  let acceleratedCase = state(); acceleratedCase.players[0].deck.push({ id: "drawn", name: "Comprada", type: "Criatura" }); acceleratedCase.players[0].hand.push({ ...spell("discard-fast", "Ar", [{ type: "draw", amount: 1 }]), tags: ["Ar", "Acelerado"] });
  acceleratedCase = cast(acceleratedCase, printed(253, { cost: 0 }));
  assert.ok(acceleratedCase.players[0].hand.some((card) => card.id === "drawn"));

  let terrainCase = state(); terrainCase.players[0].hand.push({ id: "discard-terrain", name: "Terreno", type: "Terreno", cost: 1, text: "", tags: [], abilities: [] });
  terrainCase = cast(terrainCase, printed(253, { cost: 0 }));
  assert.equal(terrainCase.players[1].skipNextTurn, true);
  terrainCase.active = 1; terrainCase.phase = "manutencao";
  terrainCase = executeCommand(terrainCase, { type: "advancePhase", owner: 1 }).state;
  assert.equal(terrainCase.active, 0); assert.equal(terrainCase.phase, "manutencao"); assert.equal(terrainCase.players[1].skipNextTurn, false);
});

test("CRIATURA 6 move opcionalmente um marcador de qualquer carta para si", () => {
  let game = state(), source = { ...printed(297), uid: "marker-thief", slot: 0, summoning: false, exhausted: false, markers: { action: 0 } }, donor = unit("donor", 1, { markers: { coffee: 2 } });
  game.players[0].board.push(source); game.players[1].board.push(donor);
  game = executeCommand(game, { type: "emit", owner: 0, event: { type: "onCombatDamage", owner: 0, sourceId: source.uid, source, amount: 2, targetIds: [donor.uid] } }).state;
  assert.equal(game.pendingDecision.kind, "targets"); assert.equal(game.pendingDecision.targetSteps[0].optional, true);
  game = executeCommand(game, { type: "resolveDecision", owner: 0, targetIds: [donor.uid] }).state;
  assert.equal(game.players[1].board[0].markers.coffee, 1); assert.equal(game.players[0].board[0].markers.action, 1);

  game = executeCommand(game, { type: "emit", owner: 0, event: { type: "onCombatDamage", owner: 0, sourceId: source.uid, source: game.players[0].board[0], amount: 1 } }).state;
  game = executeCommand(game, { type: "resolveDecision", owner: 0, targetIds: [] }).state;
  assert.equal(game.players[0].board[0].markers.action, 1);
});

test("CRIATURA 7 converte marcadores e pede escolha em empate no fim do turno", () => {
  let game = state(), source = { ...printed(298), uid: "converter", slot: 0, summoning: false, exhausted: false, enteredRound: 0 }, target = unit("converted", 1, { markers: { action: 2 } });
  game.players[0].board.push(source); game.players[1].board.push(target);
  game = executeCommand(game, { type: "activate", owner: 0, sourceId: source.uid, abilityId: source.abilities.find((ability) => ability.trigger === "activated").id, targetIds: [target.uid] }).state;
  assert.equal(game.players[1].board[0].markers.action, 0); assert.equal(game.players[1].board[0].markers.plusOne, 2); assert.deepEqual(game.players[1].board[0].modifiers.at(-1), { attack: 2, health: 2, duration: "permanent", sourceId: source.uid, markerBased: "plusOne" });

  const tie = state(); tie.players[0].board.push({ ...printed(298), uid: "tie-source", slot: 0, summoning: false }, unit("tie-a", 0, { slot: 1, markers: { plusOne: 2 } }), unit("tie-b", 0, { slot: 2, markers: { plusOne: 2 } }));
  let tied = executeCommand(tie, { type: "emit", owner: 0, event: { type: "onTurnEnd", owner: 0 } }).state;
  assert.equal(tied.pendingDecision.kind, "targets"); assert.deepEqual(new Set(tied.pendingDecision.targetSteps[0].allowedIds), new Set(["tie-a", "tie-b"]));
  tied = executeCommand(tied, { type: "resolveDecision", owner: 0, targetIds: ["tie-b"] }).state;
  assert.ok(!tied.players[0].board.some((card) => card.uid === "tie-b")); assert.ok(tied.players[0].obscuro.some((card) => card.uid === "tie-b"));
});

test("FUGA zera o custo retornado e transfere o artefato ao outro controlador", () => {
  const game = state(), target = unit("escape-target", 1, { cost: 5, slot: 2 }), artifact = { uid: "stolen-artifact", id: "stolen-artifact", name: "Artefato", type: "Artefato", cost: 2, slot: 2, attachedTo: target.uid, tags: [], abilities: [], modifiers: [] };
  game.players[1].board.push(target); game.players[1].support.push(artifact);
  const result = cast(game, printed(307, { cost: 0 }), [target.uid]);
  assert.equal(result.players[1].board.length, 0); assert.equal(result.players[1].hand[0].costModifier, -5);
  assert.ok(result.players[0].support.some((card) => card.uid === artifact.uid && !card.attachedTo)); assert.equal(result.players[1].support.length, 0);
});

test("SOPRO NATURAL devolve até três criaturas e bane todo o restante do cemitério", () => {
  let game = state(); game.players[0].grave = Array.from({ length: 5 }, (_, index) => ({ ...unit(`grave-${index}`), uid: `grave-${index}` })); game.players[0].grave.push({ id: "grave-spell", name: "Outro feitiço", type: "Feitiço" });
  game = cast(game, printed(308, { cost: 0 }));
  assert.equal(game.pendingDecision.kind, "grave-to-hand-and-banish"); assert.equal(game.pendingDecision.effect.maximum, 3); assert.equal(game.pendingDecision.effect.minimum, 0);
  game = executeCommand(game, { type: "resolveDecision", owner: 0, selectedCardIds: ["grave-0", "grave-1"] }).state;
  assert.equal(game.players[0].hand.filter((card) => /^grave-[01]$/.test(card.uid || "")).length, 2);
  assert.equal(game.players[0].grave.length, 0); assert.equal(game.players[0].obscuro.length, 5);
});
