from pathlib import Path
import json

# Catalog removals and canonical text.
path = Path('app/cards.generated.json')
cards = json.loads(path.read_text())
removed = {200, 201, 203, 204, 205, 207, 209, 210}
cards = [card for card in cards if card.get('page') not in removed]
caneca = next(card for card in cards if card.get('page') == 192)
caneca['text'] = 'A criatura equipada recebe +2/-1. Se equipada no “Recruta Pinguço”, ele agora se chama “Pinguço Sortudo” e todo dano causado a ele por Feitiços é reduzido a 0.'
path.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + '\n')

# Explicit Quarion rules.
path = Path('app/rules-engine/card-rules.mjs')
text = path.read_text()
text = text.replace('distinctFirstActNamesAtLeast: 2', 'distinctCreatureNamesAtLeast: 2').replace('distinctFirstActNamesAtLeast: 4', 'distinctCreatureNamesAtLeast: 4')
text = text.replace('p182: [ability("static", [effect("doubleRecruitFirstAct")])],', 'p182: [ability("static", [effect("doubleRecruitEffects")])],')
needle = '  p186: [ability("onEnter", [effect("modifyStats", { target: "allyCreature", attack: 2, health: 0, duration: "turn" })])],\n'
assert needle in text
if '  p187:' not in text:
    text = text.replace(needle, needle + '  p187: [ability("onEnter", [effect("damage", { amount: 2, target: "anyCreature", selections: 1 })])],\n')
old192 = '  p192: [ability("static", [effect("modifyStats", { attack: 2, health: -1, duration: "attached" }), effect("attachedConditionalKeyword", { attachedName: "Recruta Pinguço", keyword: "Barreira Mágica", duration: "attached" })])],'
new192 = '  p192: [ability("static", [effect("modifyStats", { attack: 2, health: -1, duration: "attached" }), effect("attachedSpellDamageImmunity", { requiredPage: 189 })])],'
assert old192 in text
text = text.replace(old192, new192)
text = text.replace('  p203: [ability("onPlay", [effect("optionalSacrificeThenFillRecruits", { subtype: "Recruta", shuffle: true })])],', '  p203: { ignored: true, reason: "removed-from-catalog" },')
text = text.replace('  p209: [ability("onPlay", [effect("purgeSpellsAndCreateImage", { name: "Tessália, a Mão de Ferro", oncePerGame: true })])],', '  p209: { ignored: true, reason: "removed-from-catalog" },')
text = text.replace('  p210: [ability("onTargetedByOpponent", [effect("controllerChoice", { choices: [[effect("counterEvent")], [effect("damage", { amount: 4, target: "enemyHero" })]] })])],', '  p210: { ignored: true, reason: "removed-from-catalog" },')
path.write_text(text)

# Caneca: spell damage becomes zero, without granting Magic Barrier.
path = Path('app/rules-engine/effects.mjs')
text = path.read_text()
text = text.replace('doubleRecruitFirstAct(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push({ type: "doubleRecruitFirstAct" }); } },', 'doubleRecruitEffects(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push({ type: "doubleRecruitEffects" }); } },')
anchor = '  attachedConditionalKeyword(state, effect, context) {'
assert anchor in text
handler = '  attachedSpellDamageImmunity(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "attachedSpellDamageImmunity" && item.requiredPage === effect.requiredPage)) source.staticModifiers.push({ type: "attachedSpellDamageImmunity", requiredPage: effect.requiredPage }); },\n'
if 'attachedSpellDamageImmunity(state' not in text:
    text = text.replace(anchor, handler + anchor)
old = '      const robust = hasKeyword(target, /robusto/i) ? 1 : 0;\n      const amount = Math.max(0, printedAmount + (effect.additionalIfExhausted && target.exhausted ? effect.additionalIfExhausted : 0) - robust - shieldReduction);'
new = '      const robust = hasKeyword(target, /robusto/i) ? 1 : 0;\n      const spellDamageImmune = context.effectSource?.type === "Feitiço" && targetOwner >= 0 && (player(state, targetOwner).support || []).some((attachment) => attachment.attachedTo === (target.uid || target.id) && !attachment.suffocated && (attachment.staticModifiers || []).some((modifier) => modifier.type === "attachedSpellDamageImmunity" && (modifier.requiredPage == null || target.page === modifier.requiredPage)));\n      const amount = spellDamageImmune ? 0 : Math.max(0, printedAmount + (effect.additionalIfExhausted && target.exhausted ? effect.additionalIfExhausted : 0) - robust - shieldReduction);'
assert old in text
text = text.replace(old, new)
path.write_text(text)

# UI evolution progress counts all distinct controlled creature names.
path = Path('app/page.tsx')
text = path.read_text()
text = text.replace('const removedCatalogPages=new Set([149,200,201,204,205,207]);', 'const removedCatalogPages=new Set([149,200,201,203,204,205,207,209,210]);')
old = 'if(player.heroId==="quarion")return new Set(player.board.filter(hasFirstAct).map(unit=>cleanName(effectiveCreatureName(player,unit)))).size;'
new = 'if(player.heroId==="quarion")return new Set(player.board.map(unit=>cleanName(effectiveCreatureName(player,unit))).filter(Boolean)).size;'
assert old in text
text = text.replace(old, new)
text = text.replace('cards.filter(card=>![84,85,93,99,101,178,207].includes(card.page)).length} cartas ativas', 'cards.length} cartas ativas')
path.write_text(text)

# Chefe da Guarda: repeat effects whose source is a Recruit, never attached artifacts.
path = Path('app/rules-engine/engine-base.mjs')
text = path.read_text()
old_block = '''  if (["onDestroyed", "onPermanentLeaves", "onCreatureEnter"].includes(event.type) && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
    for (const source of permanentUnits(entry)) {
      const modifiers = source.staticModifiers || [];
      const active = event.owner === owner && (((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && modifiers.some((modifier) => modifier.type === "recruitFirstActOnLeave")) || (event.type === "onCreatureEnter" && event.sourceId !== source.uid && modifiers.some((modifier) => modifier.type === "doubleRecruitFirstAct")));
      if (active) { const effects = (event.card.abilities || []).filter((ability) => ability.trigger === "onEnter").flatMap((ability) => ability.effects || []); if (effects.length) result.push({ source, owner, ability: { id: `${source.uid}-recruit-passive`, effects, replaySourceId: event.card.uid || event.card.id } }); }
    }
  });'''
new_block = '''  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
    if (event.owner !== owner) return;
    const saideiras = permanentUnits(entry).filter((source) => !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "recruitFirstActOnLeave"));
    if (!saideiras.length) return;
    const effects = (event.card.abilities || []).filter((ability) => ability.trigger === "onEnter").flatMap((ability) => ability.effects || []);
    if (!effects.length) return;
    const chiefCopies = permanentUnits(entry).some((source) => source.page === 182 && !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1;
    for (const source of saideiras) for (let copy = 0; copy < chiefCopies; copy++) result.push({ source, owner, ability: { id: `${source.uid}-recruit-leave-${copy}`, effects, replaySourceId: event.card.uid || event.card.id } });
  });'''
assert old_block in text
text = text.replace(old_block, new_block)
old_event = '    const repeats = event.type === "onDestroyed" && state.players[event.owner]?.heroId === "tifon" && (state.players[event.owner]?.level || 1) >= 3 ? 2 : 1;\n    for (let copy = 0; copy < repeats; copy++) result.push({ source: event.card, owner: event.owner, ability: copy ? { ...ability, id: `${ability.id}:tifon-copy-${copy}` } : ability });'
new_event = '    const tifonCopies = event.type === "onDestroyed" && state.players[event.owner]?.heroId === "tifon" && (state.players[event.owner]?.level || 1) >= 3 ? 2 : 1;\n    const chiefCopies = subtype(event.card, "Recruta") && permanentUnits(state.players[event.owner]).some((source) => source.page === 182 && !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1;\n    const repeats = tifonCopies * chiefCopies;\n    for (let copy = 0; copy < repeats; copy++) result.push({ source: event.card, owner: event.owner, ability: copy ? { ...ability, id: `${ability.id}:repeat-${copy}` } : ability });'
assert old_event in text
text = text.replace(old_event, new_event)
old_loop = '      for (const ability of source.abilities || []) if (!(source.page === 165 && event.type === "onDamageTaken" && ability.trigger === "onDamageTaken") && ability.trigger === event.type && eventAppliesToSource(event, source, owner) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) result.push({ source, owner, ability });'
new_loop = '      for (const ability of source.abilities || []) if (!(source.page === 165 && event.type === "onDamageTaken" && ability.trigger === "onDamageTaken") && ability.trigger === event.type && eventAppliesToSource(event, source, owner) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) { const copies = subtype(source, "Recruta") && permanentUnits(entry).some((chief) => chief.page === 182 && !chief.suffocated && (chief.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1; for (let copy = 0; copy < copies; copy++) result.push({ source, owner, ability: copy ? { ...ability, id: `${ability.id}:chief-copy-${copy}` } : ability }); }'
assert old_loop in text
text = text.replace(old_loop, new_loop)
old_activate = '        [...otherEffects, ...selfDestruction].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));'
new_activate = '        const recruitCopies = subtype(source, "Recruta") && permanentUnits(entry).some((chief) => chief.page === 182 && !chief.suffocated && (chief.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1; const repeatedEffects = Array.from({ length: recruitCopies }, () => otherEffects).flat(); [...repeatedEffects, ...selfDestruction].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));'
assert old_activate in text
text = text.replace(old_activate, new_activate)
path.write_text(text)

# Regression suite.
Path('tests/quarion-authoritative.test.mjs').write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { getExplicitCardRule } from "../app/rules-engine/card-rules.mjs";

const catalog = cards.map(compileCard);
const state = (level = 1) => ({ active:0, phase:"principal", round:1, cardCatalog:catalog, players:[0,1].map((owner)=>({heroId:owner?"gimble":"quarion",level:owner?1:level,heroXP:0,levelUpsThisTurn:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:20,maxEnergy:10,reserve:3,deck:[],extraDeck:[],hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0})) });
const printed = (page, overrides={}) => ({...compileCard(cards.find((card)=>card.page===page)),...overrides});
const unit = (id,overrides={}) => ({uid:id,id,name:id,type:"Criatura",cost:1,atk:1,hp:4,text:"",tags:[],subtypes:[],abilities:[],slot:0,damage:0,modifiers:[],exhausted:false,summoning:false,...overrides});

test("removed Quarion cards are absent from canonical catalog",()=>{for(const page of [200,201,203,204,205,207,209,210])assert.equal(cards.some((card)=>card.page===page),false,`page ${page}`)});
test("Quarion evolution rule counts distinct creature names regardless of First Act",()=>{const rule=getExplicitCardRule("p180");assert.equal(rule.evolution[0].condition.distinctCreatureNamesAtLeast,2);assert.equal(rule.evolution[1].condition.distinctCreatureNamesAtLeast,4);assert.equal("distinctFirstActNamesAtLeast" in rule.evolution[0].condition,false)});
test("Recruta Bom de Briga has explicit 2 damage First Act",()=>{const rule=getExplicitCardRule("p187");assert.equal(rule[0].trigger,"onEnter");assert.deepEqual(rule[0].effects[0],{type:"damage",amount:2,target:"anyCreature",selections:1})});
test("Caneca makes spell damage zero but does not prevent creature effect damage",()=>{let game=state();const host={...printed(189),uid:"ping",slot:0,damage:0,modifiers:[],staticModifiers:[],exhausted:false,summoning:false};const mug={...printed(192),uid:"mug",slot:0,attachedTo:"ping",enteredRound:0,damage:0,modifiers:[],staticModifiers:[],exhausted:false,summoning:false};game.players[0].board.push(host);game.players[0].support.push(mug);game=executeCommand(game,{type:"emit",owner:0,event:{type:"noop",owner:0}}).state;game.active=1;game.players[1].hand.push({id:"spell",name:"Spell",type:"Feitiço",cost:0,tags:[],abilities:[{id:"spell-hit",trigger:"onPlay",costs:[],effects:[{type:"damage",amount:3,target:"anyCreature",selections:1}]}]});game=executeCommand(game,{type:"playCard",owner:1,cardId:"spell",targetIds:["ping"],skipPriority:true}).state;assert.equal(game.players[0].board.find((card)=>card.uid==="ping").damage,0);game.players[1].hand.push(unit("creature-effect",{abilities:[{id:"ping",trigger:"onEnter",costs:[],effects:[{type:"damage",amount:2,target:"anyCreature",selections:1}]}]}));game=executeCommand(game,{type:"playCard",owner:1,cardId:"creature-effect",slot:0,targetIds:["ping"],skipPriority:true}).state;assert.equal(game.players[0].board.find((card)=>card.uid==="ping").damage,2)});
test("Chefe doubles a triggered effect from a Recruit",()=>{const game=state();game.players[0].board.push(unit("chief",{page:182,slot:0,subtypes:["Recruta"],staticModifiers:[{type:"doubleRecruitEffects"}]}),unit("recruit",{slot:1,subtypes:["Recruta"],abilities:[{id:"hurt-draw",trigger:"onDamageTaken",costs:[],effects:[{type:"draw",amount:1}]}]}));game.players[0].deck.push({id:"a"},{id:"b"},{id:"c"});const result=executeCommand(game,{type:"emit",owner:0,event:{type:"onDamageTaken",owner:0,targetId:"recruit",amount:1}}).state;assert.equal(result.players[0].hand.length,2)});
test("Chefe does not double an attached artifact effect",()=>{const game=state();game.players[0].board.push(unit("chief",{page:182,slot:0,subtypes:["Recruta"],staticModifiers:[{type:"doubleRecruitEffects"}]}),unit("recruit",{slot:1,subtypes:["Recruta"]}));game.players[0].support.push({uid:"artifact",id:"artifact",name:"Artifact",page:999,type:"Artefato",slot:1,attachedTo:"recruit",suffocated:false,abilities:[{id:"artifact-draw",trigger:"onAttachedCreatureTargeted",costs:[],effects:[{type:"draw",amount:1}]}],staticModifiers:[]});game.players[0].deck.push({id:"a"},{id:"b"});const result=executeCommand(game,{type:"emit",owner:0,event:{type:"onAttachedCreatureTargeted",owner:1,sourceId:"enemy",targetIds:["recruit"]}}).state;assert.equal(result.players[0].hand.length,1)});
for(const destination of ["hand","obscuro","grave"])test(`Saideira replays First Act on leave to ${destination}`,()=>{const game=state();game.players[0].terrain={uid:"saideira",id:"saideira",name:"Saideira",page:181,type:"Terreno",slot:0,suffocated:false,staticModifiers:[{type:"recruitFirstActOnLeave"}],abilities:[]};const recruit=unit("leaver",{subtypes:["Recruta"],tags:["Primeiro Ato"],abilities:[{id:"first",trigger:"onEnter",costs:[],effects:[{type:"draw",amount:1}]}]});game.players[0].deck.push({id:"draw"});const result=executeCommand(game,{type:"emit",owner:0,event:{type:"onPermanentLeaves",owner:0,sourceId:"leaver",card:recruit,zone:"board",destination}}).state;assert.equal(result.players[0].hand.length,1)});
test("Saideira replay is doubled by Chefe without looping",()=>{const game=state(3);game.players[0].terrain={uid:"saideira",id:"saideira",name:"Saideira",page:181,type:"Terreno",slot:0,suffocated:false,staticModifiers:[{type:"recruitFirstActOnLeave"}],abilities:[]};game.players[0].board.push(unit("chief",{page:182,slot:0,subtypes:["Recruta"],staticModifiers:[{type:"doubleRecruitEffects"}]}));const recruit=unit("leaver",{slot:1,subtypes:["Recruta"],tags:["Primeiro Ato"],abilities:[{id:"first",trigger:"onEnter",costs:[],effects:[{type:"draw",amount:1}]}]});game.players[0].deck.push({id:"a"},{id:"b"},{id:"c"});const result=executeCommand(game,{type:"emit",owner:0,event:{type:"onPermanentLeaves",owner:0,sourceId:"leaver",card:recruit,zone:"board",destination:"hand"}}).state;assert.equal(result.players[0].hand.length,2)});
''')
