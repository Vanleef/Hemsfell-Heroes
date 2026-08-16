from pathlib import Path
import json


def replace(path, old, new, label):
    p=Path(path); text=p.read_text()
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    p.write_text(text.replace(old,new,1))

# Card text corrections.
replace('app/cards.generated.json',
'"text": "Veja suas criaturas morrer     3 criaturas→ Nível 2 para poder upar de nivel       7 criaturas→ Nível 3 Durante o seu turno, quando uma criatura sua morrer, você pode comprar 1 carta. (Max 3 por turno) I Sempre que uma criatura sua com Último II    Suspiro morrer, cause 1 de dano ao herói inimigo. Criaturas ativam seu Último Suspiro duas vezes.                                           III"',
'"text": "Veja suas criaturas morrer     3 criaturas→ Nível 2 para poder upar de nivel       7 criaturas→ Nível 3 Durante o seu turno, quando uma criatura sua morrer, compre 1 carta. (Máx. 1 por turno) I Sempre que uma criatura sua com Último II    Suspiro morrer, cause 1 de dano ao herói inimigo. Criaturas ativam seu Último Suspiro duas vezes.                                           III"',
'Tifon I printed text')
replace('app/cards.generated.json',
'Último Suspiro: Você pode sacrificar uma outra criatura aliada para manter \\"O Primordial\\" em campo.',
'Último Suspiro: Você pode destruir uma outra criatura aliada para manter \\"O Primordial\\" em campo.',
'Primordial printed wording')

# Every creature in Tifon deck is Malorga.
replace('app/rules-engine/subtypes.mjs',
'  "Fênix": [82, 83],\n',
'  "Fênix": [82, 83],\n  Malorga: [111, 112, 113, 114, 115, 116, 117, 118, 119, 120],\n',
'Malorga subtype')

# Canonical Tifon/card rules.
replace('app/rules-engine/card-rules.mjs',
'  p116: [ability("onDestroyed", [effect("gainEnergy", { amount: 1, destination: "reserve" })])],\n',
'''  p110: { hero: true, evolution: [{ level: 2, condition: { alliedDeathsAtLeast: 3 } }, { level: 3, condition: { alliedDeathsAtLeast: 7 } }], levels: {
    1: [ability("onCreatureDestroyed", [effect("draw", { amount: 1 })], [], { id: "tifon-level-1", condition: { eventOwnerIsController: true, controllerTurn: true }, usageLimit: { count: 1, period: "turn" } })],
    2: [ability("onCreatureDestroyed", [effect("damageEnemyHero", { amount: 1 })], [], { id: "tifon-level-2", condition: { eventOwnerIsController: true, eventCardHasTrigger: "onDestroyed" } })],
    3: [ability("static", [effect("doubleLastBreath")], [], { id: "tifon-level-3" })]
  } },
  p116: [ability("onDestroyed", [effect("gainEnergy", { amount: 1, destination: "reserve" })])],
  p118: [ability("onDestroyed", [effect("resurrect", { zone: "grave", cardType: "Criatura", maxCost: 2, destination: "field", choose: true, optionalIfNoChoices: true })], [], { condition: { controllerGraveHasCreatureMaxCost: 2 } })],
''',
'Tifon hero and Reanimador rules')
replace('app/rules-engine/card-rules.mjs',
'  p119: [ability("onDestroyed", [effect("damageHeroFromTurnDeaths", { target: "enemyHero" })])],\n',
'  p119: [ability("onDestroyed", [effect("damageHeroFromTurnDeaths", { target: "enemyHero", global: true })])],\n',
'Explosivo global deaths')
replace('app/rules-engine/card-rules.mjs',
'  p127: [ability("activated", [effect("replayTopGraveAbility", { trigger: "onDestroyed", requireType: "Criatura" })], [], { uiActivation: true, usageLimit: { count: 1, period: "turn" }, availability: { topGraveHasTrigger: "onDestroyed" } })],\n',
'''  p127: [ability("activated", [effect("replayTopGraveAbility", { trigger: "onDestroyed", requireType: "Criatura", doubledByTifon: true })], [], { uiActivation: true, usageLimit: { count: 1, period: "turn" }, availability: { topGraveHasTrigger: "onDestroyed" } })],
  p128: [ability("onCreatureDestroyed", [effect("grantKeyword", { target: "allyCreature", keyword: "Toque da Morte", duration: "turn", selections: 1, minimumSelections: 0 })], [], { condition: { eventOwnerIsController: true }, usageLimit: { count: 1, period: "turn" } })],
''',
'Estandarte and Altar rules')

# Engine: Tifon hero registration, conditions, Last Breath duplication, authoritative hero triggers.
replace('app/rules-engine/engine-base.mjs',
'const HERO_RULE_PAGE = Object.freeze({ gimble: 2, saymon: 129, quarion: 180, rasmus: 211, ngoro: 255, zayan: 273, natureza: 291 });',
'const HERO_RULE_PAGE = Object.freeze({ gimble: 2, tifon: 110, saymon: 129, quarion: 180, rasmus: 211, ngoro: 255, zayan: 273, natureza: 291 });',
'Tifon hero rule page')
replace('app/rules-engine/engine-base.mjs',
'  if (condition.controllerControlsSubtype && !permanentUnits(entry).some((card) => subtype(card, condition.controllerControlsSubtype))) return false;\n',
'''  if (condition.controllerControlsSubtype && !permanentUnits(entry).some((card) => subtype(card, condition.controllerControlsSubtype))) return false;
  if (condition.controllerGraveHasCreatureMaxCost != null && !entry.grave.some((card) => card.type === "Criatura" && (card.cost || 0) <= condition.controllerGraveHasCreatureMaxCost)) return false;
''',
'Reanimador grave condition')
replace('app/rules-engine/engine-base.mjs',
'  if (condition.eventCardKeyword) {\n',
'''  if (condition.eventCardHasTrigger && !(eventCard?.abilities || []).some((ability) => ability.trigger === condition.eventCardHasTrigger)) return false;
  if (condition.eventCardKeyword) {
''',
'Tifon II semantic Last Breath check')
replace('app/rules-engine/engine-base.mjs',
'  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && !event.card.suffocated) for (const ability of event.card.abilities || []) if (ability.trigger === event.type && conditionMatches(state, event.card, event.owner, ability.condition, event) && usageAvailable(state, event.card, event.owner, ability)) result.push({ source: event.card, owner: event.owner, ability });',
'''  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && !event.card.suffocated) for (const ability of event.card.abilities || []) if (ability.trigger === event.type && conditionMatches(state, event.card, event.owner, ability.condition, event) && usageAvailable(state, event.card, event.owner, ability)) {
    const repeats = event.type === "onDestroyed" && state.players[event.owner]?.heroId === "tifon" && (state.players[event.owner]?.level || 1) >= 3 ? 2 : 1;
    for (let copy = 0; copy < repeats; copy++) result.push({ source: event.card, owner: event.owner, ability: copy ? { ...ability, id: `${ability.id}:tifon-copy-${copy}` } : ability });
  }''',
'Tifon III authoritative death duplication')
replace('app/rules-engine/engine-base.mjs',
'    if (entry.heroId === "rasmus" && (entry.level || 1) >= 2 && event.type === "onPlayerDamaged"',
'''    if (entry.heroId === "tifon" && event.type === "onCreatureDestroyed" && event.owner === owner) {
      const heroRule = getExplicitCardRule("p110"), heroAbilities = abilitiesForLevel(heroRule, entry.level || 1);
      for (const ability of heroAbilities.filter((candidate) => candidate.trigger === "onCreatureDestroyed" && conditionMatches(state, heroSource, owner, candidate.condition, event) && usageAvailable(state, heroSource, owner, candidate))) result.push({ source: heroSource, owner, ability });
    }
    if (entry.heroId === "rasmus" && (entry.level || 1) >= 2 && event.type === "onPlayerDamaged"''',
'Tifon authoritative hero triggers')

# Track global deaths/evolution from the canonical destruction event in engine cleanup.
replace('app/rules-engine/engine-base.mjs',
'      stack.push({ kind: "event", event: { type: "onCreatureDestroyed", owner, cardId: unit.uid, card: unit, destroyedBySourceId: unit.lastDamagedBy?.sourceId, destroyedByOwner: unit.lastDamagedBy?.sourceOwner } });',
'''      entry.turnDeaths = (entry.turnDeaths || 0) + 1;
      if (entry.heroId === "tifon") entry.heroXP = (entry.heroXP || 0) + 1;
      stack.push({ kind: "event", event: { type: "onCreatureDestroyed", owner, cardId: unit.uid, card: unit, destroyedBySourceId: unit.lastDamagedBy?.sourceId, destroyedByOwner: unit.lastDamagedBy?.sourceOwner } });''',
'cleanup death accounting')
replace('app/rules-engine/engine-base.mjs',
'    const entry = state.players[state.active]; entry.lifeLostThisTurn = 0; entry.lifeLossEvents = 0; entry.cardsDrawnThisTurn = 0; entry.cardsMilledThisTurn = 0; entry.namedCardsPlayedThisTurn = {}; if (entry.heroId === "saymon") entry.heroXP = 0;',
'    const entry = state.players[state.active]; state.players.forEach((playerEntry) => { playerEntry.turnDeaths = 0; }); entry.lifeLostThisTurn = 0; entry.lifeLossEvents = 0; entry.cardsDrawnThisTurn = 0; entry.cardsMilledThisTurn = 0; entry.namedCardsPlayedThisTurn = {}; if (entry.heroId === "saymon") entry.heroXP = 0;',
'global death counter reset')

# Effects queued outside cleanup also account for destruction before their triggers resolve.
replace('app/rules-engine/effects.mjs',
'const queueEvent = (state, event) => { state.rulesEvents ||= []; state.rulesEvents.push(event); };',
'''const queueEvent = (state, event) => {
  if (event?.type === "onCreatureDestroyed" && !event.deathCountRecorded) {
    const entry = state.players[event.owner];
    if (entry) { entry.turnDeaths = (entry.turnDeaths || 0) + 1; if (entry.heroId === "tifon") entry.heroXP = (entry.heroXP || 0) + 1; }
    event = { ...event, deathCountRecorded: true };
  }
  state.rulesEvents ||= []; state.rulesEvents.push(event);
};''',
'queued death accounting')
replace('app/rules-engine/effects.mjs',
'  damageHeroFromTurnDeaths(state, effect, context) { const amount = player(state, context.owner).turnDeaths || 0; defaultEffectHandlers.damage(state, { type: "damage", amount }, { ...context, targetIds: ["enemy-hero"] }); },',
'''  damageEnemyHero(state, effect, context) { defaultEffectHandlers.damage(state, { type: "damage", amount: effect.amount || 0 }, { ...context, targetIds: ["enemy-hero"] }); },
  doubleLastBreath() {},
  damageHeroFromTurnDeaths(state, effect, context) { const amount = effect.global ? state.players.reduce((sum, entry) => sum + Number(entry.turnDeaths || 0), 0) : (player(state, context.owner).turnDeaths || 0); defaultEffectHandlers.damage(state, { type: "damage", amount }, { ...context, targetIds: ["enemy-hero"] }); },''',
'Tifon damage helpers and global Explosivo')
replace('app/rules-engine/effects.mjs',
'  resurrect(state, effect, context) { const entry = player(state, context.owner); if (effect.choose && !context.selectedCardId) { const choices = entry.grave.filter((card) => card.type === effect.cardType && (effect.maxCost == null || card.cost <= effect.maxCost) && (!effect.subtype || hasSubtype(card, effect.subtype))).map((card) => card.uid || card.id); if (!choices.length) throw new RulesViolation("card-choice-required"); queueDecision(state, { ...effect, choices }, context, "zone-card"); return; }',
'  resurrect(state, effect, context) { const entry = player(state, context.owner); if (effect.choose && !context.selectedCardId) { const choices = entry.grave.filter((card) => card.type === effect.cardType && (effect.maxCost == null || card.cost <= effect.maxCost) && (!effect.subtype || hasSubtype(card, effect.subtype))).map((card) => card.uid || card.id); if (!choices.length) { if (effect.optionalIfNoChoices) return; throw new RulesViolation("card-choice-required"); } queueDecision(state, { ...effect, choices }, context, "zone-card"); return; }',
'Reanimador second-copy empty grave handling')
replace('app/rules-engine/effects.mjs',
'  replayTopGraveAbility(state, effect, context) { const entry = player(state, context.owner); const top = entry.grave.at(-1); const found = top?.abilities?.find((candidate) => candidate.trigger === effect.trigger); if (!found || top.type !== effect.requireType) throw new RulesViolation("ability-not-available"); for (const nested of found.effects || []) applyEffect(state, nested, { ...context, sourceId: top.uid || top.id, effectSource: top }); },',
'''  replayTopGraveAbility(state, effect, context) { const entry = player(state, context.owner); const top = entry.grave.at(-1); const found = top?.abilities?.find((candidate) => candidate.trigger === effect.trigger); if (!found || top.type !== effect.requireType) throw new RulesViolation("ability-not-available"); const replayContext = { ...context, sourceId: top.uid || top.id, effectSource: top }; const copies = effect.doubledByTifon && entry.heroId === "tifon" && (entry.level || 1) >= 3 ? 2 : 1; const sequence = Array.from({ length: copies }, () => found.effects || []).flat(); for (let index = 0; index < sequence.length; index++) { applyEffect(state, sequence[index], replayContext); if (state.pendingDecision) { state.pendingDecision.continuation = [...(state.pendingDecision.continuation || []), ...sequence.slice(index + 1).reverse().map((nested) => ({ kind: "effect", effect: nested, context: replayContext }))]; break; } } },''',
'Estandarte doubled by Tifon III')
replace('app/rules-engine/effects.mjs',
'  grantKeyword(state, effect, context) { const targets = effectTargets(state, effect, context);',
'  grantKeyword(state, effect, context) { if ((effect.minimumSelections ?? 1) === 0 && !selectedIds(context).length && effect.target) return; const targets = effectTargets(state, effect, context);',
'optional Altar target')

# Legacy/local UI path: keep the displayed Tifon behavior aligned and semantic Last Breath detection.
replace('app/page.tsx',
'const remaining=Math.max(0,1-(p.abilityUses["tifon-draws"]||0))',
'const remaining=Math.max(0,1-(p.abilityUses["tifon-draws"]||0))',
'legacy Tifon I limit remains one')
replace('app/page.tsx',
'if(deckById(p.heroId).id==="tifon"&&p.level>=2){enemy.life-=1;log(g,`Tifon II causou 1 de dano ao herói inimigo pelo Último Suspiro de ${u.name}.`,"damage")}',
'''if(deckById(p.heroId).id==="tifon"&&p.level>=2){const before:[number,number]=[g.players[0].life,g.players[1].life];enemy.life-=1;resolveLifeLossTriggers(g,before);log(g,`Tifon II causou 1 de dano ao herói inimigo pelo Último Suspiro de ${u.name}.`,"damage")}''',
'legacy Tifon II unified life-loss')
replace('app/page.tsx',
'if(hasKeyword(p,u,"Último Suspiro")){',
'if(hasKeyword(p,u,"Último Suspiro")||(u.abilities||[]).some(ability=>ability.trigger==="onDestroyed")){',
'Conjurador semantic Last Breath in legacy path')

# New focused regression suite.
Path('tests/tifon-authoritative.test.mjs').write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import cardsJson from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { getExplicitCardRule, abilitiesForLevel } from "../app/rules-engine/card-rules.mjs";
import { hasSubtype } from "../app/rules-engine/subtypes.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";

const card=(page)=>compileCard(cardsJson.find((item)=>item.page===page));
const player=(heroId="tifon",level=1)=>({heroId,level,heroXP:0,life:30,maxLife:30,energy:10,reserve:0,maxEnergy:10,hand:[],deck:[],grave:[],obscuro:[],board:[],support:[],terrain:null,abilityUses:{},turnDeaths:0,turnCardsPlayed:0,turnSpellsPlayed:0,spellsPlayed:0});
const state=(level=1)=>({players:[player("tifon",level),player("saymon",1)],active:0,phase:"principal",round:1,rulesEvents:[]});

test("Tifon is an explicit authoritative hero with 3/7 evolution",()=>{const rule=getExplicitCardRule("p110");assert.equal(rule.hero,true);assert.deepEqual(rule.evolution.map(x=>x.condition.alliedDeathsAtLeast),[3,7]);assert.equal(abilitiesForLevel(rule,3).some(a=>a.id==="tifon-level-3"),true)});
test("Tifon printed level I is automatic and limited to one",()=>{const c=cardsJson.find(x=>x.page===110);assert.match(c.text,/compre 1 carta\. \(Máx\. 1 por turno\)/);assert.doesNotMatch(c.text,/você pode comprar/)});
test("all Tifon creatures are Malorga",()=>{for(let page=111;page<=120;page++)assert.equal(hasSubtype(card(page),"Malorga"),true,`p${page}`)});
test("Conjurador is semantically a Last Breath through onDestroyed",()=>{assert.equal(card(116).abilities.some(a=>a.trigger==="onDestroyed"),true)});
test("Reanimador only offers creatures costing 2 or less",()=>{const g=state(2);g.players[0].grave=[{...card(111),uid:"cheap"},{...card(119),uid:"expensive"}];defaultEffectHandlers.resurrect(g,{type:"resurrect",cardType:"Criatura",maxCost:2,destination:"field",choose:true,optionalIfNoChoices:true},{owner:0,sourceId:"reanimator"});assert.equal(g.pendingDecision.kind,"zone-card");assert.deepEqual(g.pendingDecision.effect.choices,["cheap"])});
test("Reanimador stays silent when there is no eligible creature",()=>{const g=state(3);g.players[0].grave=[{...card(119),uid:"expensive"}];defaultEffectHandlers.resurrect(g,{type:"resurrect",cardType:"Criatura",maxCost:2,destination:"field",choose:true,optionalIfNoChoices:true},{owner:0,sourceId:"reanimator"});assert.equal(g.pendingDecision,undefined)});
test("Explosivo counts deaths from both players",()=>{const g=state(2);g.players[0].turnDeaths=2;g.players[1].turnDeaths=3;defaultEffectHandlers.damageHeroFromTurnDeaths(g,{global:true},{owner:0,sourceId:"explosivo",effectSource:card(119)});assert.equal(g.players[1].life,25)});
test("Altar is optional and once per turn",()=>{const rule=getExplicitCardRule("p128")[0];assert.equal(rule.trigger,"onCreatureDestroyed");assert.equal(rule.usageLimit.count,1);assert.equal(rule.effects[0].minimumSelections,0);assert.equal(rule.effects[0].duration,"turn")});
test("Primordial text now says destroy, not sacrifice",()=>{const c=cardsJson.find(x=>x.page===120);assert.match(c.text,/destruir uma outra criatura aliada/i);assert.doesNotMatch(c.text,/sacrificar uma outra criatura aliada/i)});
test("Estandarte is explicitly doubled by Tifon III",()=>{const rule=getExplicitCardRule("p127")[0];assert.equal(rule.effects[0].doubledByTifon,true)});
test("Totem uses exact double-cost marker selection",()=>{const rule=getExplicitCardRule("p126")[1];assert.equal(rule.effects[0].type,"resurrectByDoubleMarkerCost")});
''')
