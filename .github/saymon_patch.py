from pathlib import Path
import json, re, unicodedata


def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value or '')) if unicodedata.category(c) != 'Mn').lower()

def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing pattern: {label}')
    return text.replace(old, new, 1)

cards_path = Path('app/cards.generated.json')
cards = json.loads(cards_path.read_text())

def card_named(name):
    n = norm(name)
    matches = [c for c in cards if norm(c.get('name')) == n]
    if len(matches) != 1:
        raise SystemExit(f'expected one card named {name}, found {len(matches)}')
    return matches[0]

# Olhos Sangrentos must not have Veloz until its activated life payment resolves.
eyes = card_named('Olhos Sangrentos')
eyes['tags'] = [tag for tag in eyes.get('tags', []) if norm(tag) != 'veloz']
cards_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + '\n')

disciple = card_named('Discípulo de Sangue')
bat = card_named('Morcego Rastreador')
condutor = card_named('Condutor de Rasnóvia')
castle = card_named('Castelo Carmesim')
assert condutor['page'] == 135 and castle['page'] == 148

rules_path = Path('app/rules-engine/card-rules.mjs')
rules = rules_path.read_text()
old = '  p129: { hero: true, evolution: [{ level: 2, condition: { lifeLossEventsAtLeast: 3 } }, { level: 3, condition: { lifeLossEventsAtLeast: 5 } }], levels: { 1: [ability("activated", [effect("damage", { amount: 1, target: "enemyCharacter", selections: 1 })], [{ type: "life", amount: 2 }], { id: "saymon-level-1", uiActivation: true, usageLimit: { count: 1, period: "turn" } })], 2: [ability("activated", [effect("grantKeyword", { target: "allyCreature", keyword: "Roubo de Vida", duration: "turn" })], [{ type: "life", amount: 2 }], { id: "saymon-level-2", uiActivation: true, usageLimit: { count: 1, period: "turn" } })], 3: [ability("static", [effect("lifeCostsCannotKill")])] } },'
new = '  p129: { hero: true, evolution: [{ level: 2, condition: { lifeLossEventsAtLeast: 3 } }, { level: 3, condition: { lifeLossEventsAtLeast: 5 } }], levels: { 1: [ability("activated", [effect("damage", { amount: 1, target: "anyCharacter", selections: 1, excludeIds: ["ally-hero"] })], [{ type: "life", amount: 2 }], { id: "saymon-level-1", uiActivation: true, usageLimit: { count: 1, period: "turn" } })], 2: [ability("activated", [effect("grantKeyword", { target: "allyCreature", keyword: "Roubo de Vida", duration: "permanent" })], [{ type: "life", amount: 2 }], { id: "saymon-level-2", uiActivation: true, usageLimit: { count: 1, period: "turn" } })], 3: [ability("static", [effect("lifeCostsCannotKill")])] } },'
rules = must_replace(rules, old, new, 'Saymon hero rules')
old = '  p135: [ability("onEnter", [effect("draw", { amount: 1 }), effect("loseLife", { amount: 4, target: "controllerHero" }), effect("replaceFirstAct", { effects: [effect("search", { zone: "deck", destination: "hand", types: ["Criatura"], subtype: "Vampiro", minCost: 4, amount: 1, shuffle: true })] })])],'
new = '  p135: [ability("onEnter", [effect("controllerChoice", { prompt: "Condutor de Rasnóvia — escolha o Primeiro Ato.", labels: ["Compre 1 carta", "Pague 4 de vida: busque um Vampiro de custo 4 ou mais"], aiPolicy: "saymon-condutor", choices: [[effect("draw", { amount: 1 })], [effect("payLifeCost", { amount: 4 }), effect("search", { zone: "deck", destination: "hand", types: ["Criatura"], subtype: "Vampiro", minCost: 4, amount: 1, shuffle: true })]] })])],'
rules = must_replace(rules, old, new, 'Condutor choice')

anchor = '  p130: [ability("onEnter", [effect("loseLife", { amount: 3, target: "controllerHero" })])],\n'
extra = ''
for card, line in [
    (disciple, f'  p{disciple["page"]}: [ability("onLifeLost", [effect("modifyStats", {{ target: "self", attack: 1, health: 0, duration: "permanent" }})], [], {{ condition: {{ eventOwnerIsController: true, controllerTurn: true }} }})],\n'),
    (bat, f'  p{bat["page"]}: [ability("onLifeLost", [effect("draw", {{ amount: 1 }})], [], {{ condition: {{ eventOwnerIsController: true, controllerTurn: true, firstLifeLossEachTurn: true }}, usageLimit: {{ count: 1, period: "turn" }} }})],\n')
]:
    if re.search(rf'^  p{card["page"]}:', rules, re.M) is None:
        extra += line
if extra:
    if anchor not in rules:
        raise SystemExit('missing p130 anchor')
    rules = rules.replace(anchor, anchor + extra, 1)
rules_path.write_text(rules)

# Shared life-loss accounting: damage, explicit losses and costs all publish one onLifeLost event.
effects_path = Path('app/rules-engine/effects.mjs')
effects = effects_path.read_text()
anchor = 'const queueEvent = (state, event) => { state.rulesEvents ||= []; state.rulesEvents.push(event); };\n'
helper = '''const queueEvent = (state, event) => { state.rulesEvents ||= []; state.rulesEvents.push(event); };
export function recordLifeLoss(state, owner, amount, metadata = {}) {
  const lost = Math.max(0, Number(amount || 0));
  if (!lost) return 0;
  const entry = player(state, owner);
  entry.life -= lost;
  entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + lost;
  entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1;
  if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1;
  queueEvent(state, { type: "onLifeLost", owner, sourceOwner: metadata.sourceOwner ?? owner, sourceId: metadata.sourceId, amount: lost, paidAsCost: !!metadata.paidAsCost, damage: !!metadata.damage, lifeLossIndex: entry.lifeLossEvents });
  return lost;
}
'''
if 'export function recordLifeLoss' not in effects:
    effects = must_replace(effects, anchor, helper, 'life loss helper')

effects = must_replace(effects,
'        entry.life -= amount; queueEvent(state, { type: "onPlayerDamaged", owner, sourceOwner: context.owner, sourceId: context.sourceId, source: context.effectSource, amount });',
'        recordLifeLoss(state, owner, amount, { sourceOwner: context.owner, sourceId: context.sourceId, damage: true }); queueEvent(state, { type: "onPlayerDamaged", owner, sourceOwner: context.owner, sourceId: context.sourceId, source: context.effectSource, amount });',
'hero damage records life loss')
effects = must_replace(effects,
'        const overflow = amount - remainingHealth; player(state, targetOwner).life -= overflow;\n        queueEvent(state, { type: "onPlayerDamaged", owner: targetOwner, sourceOwner: context.owner, sourceId: context.sourceId, source: context.effectSource, amount: overflow });',
'        const overflow = amount - remainingHealth; recordLifeLoss(state, targetOwner, overflow, { sourceOwner: context.owner, sourceId: context.sourceId, damage: true });\n        queueEvent(state, { type: "onPlayerDamaged", owner: targetOwner, sourceOwner: context.owner, sourceId: context.sourceId, source: context.effectSource, amount: overflow });',
'spell trample records life loss')
old = '  loseLife(state, effect, context) { const owner = effect.target === "spellControllerHero" ? context.event?.owner ?? context.owner : context.owner; const amount = effect.amount ?? 0; const entry = player(state, owner); entry.life -= amount; entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + amount; entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1; if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1; queueEvent(state, { type: "onLifeLost", owner, sourceOwner: context.owner, sourceId: context.sourceId, amount, paidAsCost: false }); },'
new = '  loseLife(state, effect, context) { const owner = effect.target === "spellControllerHero" ? context.event?.owner ?? context.owner : context.owner; recordLifeLoss(state, owner, effect.amount ?? 0, { sourceOwner: context.owner, sourceId: context.sourceId, paidAsCost: false }); },\n  payLifeCost(state, effect, context) { const entry = player(state, context.owner), amount = Math.max(0, Number(effect.amount || 0)), minimumLife = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0; if (entry.life - amount < minimumLife) throw new RulesViolation("not-enough-life"); recordLifeLoss(state, context.owner, amount, { sourceOwner: context.owner, sourceId: context.sourceId, paidAsCost: true }); },'
effects = must_replace(effects, old, new, 'loseLife/payLifeCost')
old = '  resolveCrimsonCastle(state, effect, context) { const entry = player(state, context.owner), count = entry.lifeLossEvents || 0; if (count === 1) { defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, context); return; } if (count === 2) { state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ type: "damage", target: "anyCharacter", amount: 2 }] }, context, targetSteps: [{ scope: "anyCharacter", role: "effect" }], sourceName: "Castelo Carmesim" }; return; } if (count === 3) { defaultEffectHandlers.heal(state, { type: "heal", amount: 2, target: "controllerHero" }, context); return; } if (count >= 4) defaultEffectHandlers.heal(state, { type: "heal", amount: 1, target: "controllerHero" }, context); },'
new = '  resolveCrimsonCastle(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; if (source.crimsonLifeLossRound !== state.round) { source.crimsonLifeLossRound = state.round; source.crimsonLifeLossCount = 0; } const count = ++source.crimsonLifeLossCount; if (count === 1) { defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, context); return; } if (count === 2) { state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ type: "damage", target: "anyCharacter", amount: 2 }] }, context, targetSteps: [{ scope: "anyCharacter", role: "effect" }], sourceName: "Castelo Carmesim" }; return; } if (count === 3) { defaultEffectHandlers.heal(state, { type: "heal", amount: 2, target: "controllerHero" }, context); return; } if (count >= 4) defaultEffectHandlers.heal(state, { type: "heal", amount: 1, target: "controllerHero" }, context); },'
effects = must_replace(effects, old, new, 'castle own counter')
# Other direct life subtractions also use the same event path when encountered.
effects = effects.replace('player(state, 1 - context.owner).life -= Math.floor(markerTotal(source) / (effect.divisor || 3));', 'recordLifeLoss(state, 1 - context.owner, Math.floor(markerTotal(source) / (effect.divisor || 3)), { sourceOwner: context.owner, sourceId: context.sourceId });')
effects = effects.replace('entry.life -= nonCreatures * effect.penaltyPerNonCreature.amount;', 'recordLifeLoss(state, context.owner, nonCreatures * effect.penaltyPerNonCreature.amount, { sourceOwner: context.owner, sourceId: context.sourceId });')
effects = effects.replace('damageHeroPerCount(state, effect, context) { player(state, context.owner).life -= (context.count || 0) * effect.amount; },', 'damageHeroPerCount(state, effect, context) { recordLifeLoss(state, context.owner, (context.count || 0) * effect.amount, { sourceOwner: context.owner, sourceId: context.sourceId }); },')
effects = effects.replace('if (card.type === "Criatura") { entry.life -= Math.max(0, card.cost || 0); return; }', 'if (card.type === "Criatura") { recordLifeLoss(state, context.owner, Math.max(0, card.cost || 0), { sourceOwner: context.owner, sourceId: context.sourceId }); return; }')
effects_path.write_text(effects)

engine_path = Path('app/rules-engine/engine-base.mjs')
engine = engine_path.read_text()
engine = must_replace(engine, 'import { applyEffect, defaultEffectHandlers, RulesViolation } from "./effects.mjs";', 'import { applyEffect, defaultEffectHandlers, recordLifeLoss, RulesViolation } from "./effects.mjs";', 'engine import')
old = '''    if (cost.type === "life") {
      entry.life -= cost.amount;
      entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + cost.amount;
      entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1;
      if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1;
      state.rulesEvents ||= [];
      state.rulesEvents.push({ type: "onLifeLost", owner: context.owner, sourceOwner: context.owner, sourceId: context.sourceId, amount: cost.amount, paidAsCost: true });
    }'''
new = '''    if (cost.type === "life") recordLifeLoss(state, context.owner, cost.amount, { sourceOwner: context.owner, sourceId: context.sourceId, paidAsCost: true });'''
engine = must_replace(engine, old, new, 'engine life cost')
old = '        if (paysLife) { entry.life -= cost; entry.nextCreaturePaysLife = false; entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + cost; entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1; if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1; state.rulesEvents ||= []; state.rulesEvents.push({ type: "onLifeLost", owner: item.command.owner, sourceOwner: item.command.owner, sourceId: card.id, amount: cost, paidAsCost: true }); }'
new = '        if (paysLife) { recordLifeLoss(state, item.command.owner, cost, { sourceOwner: item.command.owner, sourceId: card.id, paidAsCost: true }); entry.nextCreaturePaysLife = false; }'
engine = must_replace(engine, old, new, 'next creature pays life')
engine = must_replace(engine, '          defenderPlayer.life -= attack;', '          recordLifeLoss(state, defenderOwner, attack, { sourceOwner: attackerOwner, sourceId: attacker.uid || attacker.id, damage: true });', 'direct combat damage')
engine = engine.replace('const overflow = dealtByAttacker - defenderRemaining; defenderPlayer.life -= overflow; damageDealtByAttacker += overflow;', 'const overflow = dealtByAttacker - defenderRemaining; recordLifeLoss(state, defenderOwner, overflow, { sourceOwner: attackerOwner, sourceId: attacker.uid || attacker.id, damage: true }); damageDealtByAttacker += overflow;')
engine = engine.replace('            defenderPlayer.life -= overflow;\n            if (overflow > 0) stack.push({ kind: "event", event: { type: "onPlayerDamaged", owner: defenderOwner, sourceOwner: attackerOwner, sourceId: attacker.uid, source: attacker, amount: overflow } });', '            recordLifeLoss(state, defenderOwner, overflow, { sourceOwner: attackerOwner, sourceId: attacker.uid || attacker.id, damage: true });\n            if (overflow > 0) stack.push({ kind: "event", event: { type: "onPlayerDamaged", owner: defenderOwner, sourceOwner: attackerOwner, sourceId: attacker.uid, source: attacker, amount: overflow } });')
engine = must_replace(engine, '  if (condition.controllerTurn && state.active !== owner) return false;', '  if (condition.controllerTurn && state.active !== owner) return false;\n  if (condition.firstLifeLossEachTurn && Number(event.lifeLossIndex || 0) !== 1) return false;', 'first life loss bool')
engine_path.write_text(engine)

ai_path = Path('app/rules-engine/ai.mjs')
ai = ai_path.read_text()
ai = must_replace(ai, 'const printedLoss = Number(String(card?.text || "").match(/\\bperca\\s+(\\d+)\\s+(?:de\\s+)?vida/i)?.[1] || 0);', 'const printedLoss = Number(String(card?.text || "").match(/\\b(?:perca|pague)\\s+(\\d+)\\s+(?:de\\s+)?vida/i)?.[1] || 0);', 'AI pay/perca regex')
choice_anchor = '  if (decision.kind === "replay-ability") {'
choice_code = '''  if (decision.kind === "choice" && effect.aiPolicy === "saymon-condutor") {
    const minimumLife = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0;
    const canPay = entry.life - 4 >= minimumLife;
    const hasVampire = (entry.deck || []).some((card) => card.type === "Criatura" && hasSubtype(card, "Vampiro") && Number(card.cost || 0) >= 4);
    return { ...command, choiceIndex: canPay && hasVampire && difficulty !== "Fácil" ? 1 : 0 };
  }
'''
if 'effect.aiPolicy === "saymon-condutor"' not in ai:
    ai = must_replace(ai, choice_anchor, choice_code + choice_anchor, 'Condutor AI choice')
helper_anchor = 'export function buildAIActionCandidates(state, owner, difficulty = "Normal") {'
helper = '''function completeAIActivationCommand(state, owner, source, ability, difficulty = "Normal") {
  const entry = state.players[owner], opponent = state.players[1 - owner];
  if (!source || source.summoning) return null;
  const command = { type: "activate", owner, sourceId: cardId(source), abilityId: ability.id };
  const xCost = (ability.costs || []).find((cost) => cost.type === "removeMarkers" && cost.amount === "X");
  if (xCost) {
    const available = markerTotal(source), minimum = Number(xCost.minimum || 0);
    if (available < minimum) return null;
    if (Number(source.page) === 134) {
      const missingLife = Math.max(0, Number(entry.maxLife ?? 30) - Number(entry.life || 0));
      if (!missingLife) return null;
      command.markerAmount = Math.max(minimum, Math.min(available, missingLife));
    } else command.markerAmount = available;
  }
  const lifeCost = (ability.costs || []).filter((cost) => cost.type === "life").reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  if (lifeCost) {
    const hardFloor = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0;
    const after = Number(entry.life || 0) - lifeCost;
    if (after < hardFloor) return null;
    const tacticalFloor = difficulty === "Difícil" ? Math.max(hardFloor, 3) : Math.max(hardFloor, 6);
    if (after < tacticalFloor) return null;
    const keywords = [...(source.tags || []), ...(source.temporaryTags || []), ...(source.grantedKeywords || [])].map(normalized).join(' ');
    if (Number(source.page) === 137 && (!opponent.board?.length || keywords.includes('toque da morte'))) return null;
    if (Number(source.page) === 138 && (!opponent.board?.length || source.exhausted || keywords.includes('veloz'))) return null;
    if (Number(source.page) === 141) {
      const host = (entry.board || []).find((card) => cardId(card) === source.attachedTo);
      if (!host || host.exhausted) return null;
    }
  }
  return command;
}

'''
if 'function completeAIActivationCommand' not in ai:
    ai = must_replace(ai, helper_anchor, helper + helper_anchor, 'AI activation helper')
old = '    for (const source of permanentUnits(entry)) for (const ability of source.abilities || []) if (ability.trigger === "activated") candidates.push({ type: "activate", owner, sourceId: cardId(source), abilityId: ability.id });'
new = '    for (const source of permanentUnits(entry)) for (const ability of source.abilities || []) if (ability.trigger === "activated") { const command = completeAIActivationCommand(state, owner, source, ability, difficulty); if (command) candidates.push(command); }'
ai = must_replace(ai, old, new, 'AI activation candidates')
ai_path.write_text(ai)

# Explicit rule count grows by Discípulo + Morcego.
tests_path = Path('tests/rules-engine.test.mjs')
tests = tests_path.read_text()
tests = tests.replace('assert.equal(explicitRuleIds.length, 249);', 'assert.equal(explicitRuleIds.length, 251);')
tests_path.write_text(tests)

# Regression suite for the Saymon decisions above.
Path('tests/saymon-authoritative-regressions.test.mjs').write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";
import { buildAIActionCandidates, canAIPlayLifeCost, chooseAIDecision } from "../app/rules-engine/ai.mjs";

const catalog = cards.map(compileCard);
const byName = (name) => compileCard(cards.find((card) => card.name === name));
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
  const cobra = field(byName("Cobra Dor"), "cobra"); cobra.markers = { action: 3 };
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
''')
