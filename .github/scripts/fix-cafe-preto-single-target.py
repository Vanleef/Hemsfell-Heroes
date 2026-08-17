from pathlib import Path

rules = Path('app/rules-engine/card-rules.mjs')
s = rules.read_text(encoding='utf-8')
old = '  p249: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", selections: 1, attack: 5, health: 5, duration: "untilNextTurn" })])],'
new = '  p249: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", selections: 1, attack: 5, health: 5, duration: "untilNextTurn" }), effect("skipNextUntap", { target: "anyCreature", reusePreviousTarget: true })])],'
if old not in s:
    raise SystemExit('p249 anchor not found')
rules.write_text(s.replace(old, new, 1), encoding='utf-8')

targeting = Path('app/rules-engine/targeting.mjs')
s = targeting.read_text(encoding='utf-8')
old = '''  const effectSteps = abilities.flatMap((ability) => (ability.effects || []).flatMap((effect) => {\n    const scope = effectScope(effect.target);\n    if (scope === TargetScope.NONE || effect.global) return [];'''
new = '''  const effectSteps = abilities.flatMap((ability) => (ability.effects || []).flatMap((effect) => {\n    const scope = effectScope(effect.target);\n    /* Compound effects may apply multiple consequences to one chosen target.\n       Follow-up effects marked reusePreviousTarget do not create another UI target step. */\n    if (scope === TargetScope.NONE || effect.global || effect.reusePreviousTarget) return [];'''
if old not in s:
    raise SystemExit('targeting anchor not found')
targeting.write_text(s.replace(old, new, 1), encoding='utf-8')

effects = Path('app/rules-engine/effects.mjs')
s = effects.read_text(encoding='utf-8')
old = '''const targetStepsForEffects = (effects = []) => effects.flatMap((nested) => {\n  const scope = targetScopeForEffect(nested.target);\n  if (!scope) return [];'''
new = '''const targetStepsForEffects = (effects = []) => effects.flatMap((nested) => {\n  const scope = targetScopeForEffect(nested.target);\n  if (!scope || nested.reusePreviousTarget) return [];'''
if old not in s:
    raise SystemExit('replay targeting anchor not found')
effects.write_text(s.replace(old, new, 1), encoding='utf-8')

engine = Path('app/rules-engine/engine-base.mjs')
s = engine.read_text(encoding='utf-8')
old = '''  return (ability.effects || []).flatMap((effect) => {\n    const scope = targetScope(effect.target);\n    const selections = effect.selections ?? (scope === TargetScope.NONE ? 0 : 1);'''
new = '''  return (ability.effects || []).flatMap((effect) => {\n    const scope = targetScope(effect.target);\n    if (effect.reusePreviousTarget) return [];\n    const selections = effect.selections ?? (scope === TargetScope.NONE ? 0 : 1);'''
if old not in s:
    raise SystemExit('engine target-step anchor not found')
engine.write_text(s.replace(old, new, 1), encoding='utf-8')

old_test = Path('tests/rasmus-authoritative.test.mjs')
s = old_test.read_text(encoding='utf-8')
old = 'test("Café Filtrado skips the next untap, while Café Preto Sem Açúcar does not",()=>{assert.equal(printed(241).abilities[0].effects[1].type,"skipNextUntap");assert.equal(printed(249).abilities[0].effects.some(effect=>effect.type==="skipNextUntap"),false);assert.equal(printed(249).abilities[0].effects[0].selections,1);const game=state();game.phase="fim";game.active=0;game.players[1].board.push(unit("sleepy",{exhausted:true,skipNextUntap:true}));const next=executeCommand(game,{type:"advancePhase",owner:0,handLimitSatisfied:true}).state;assert.equal(next.players[1].board[0].exhausted,true);assert.equal(next.players[1].board[0].skipNextUntap,false);});'
new = 'test("Café Filtrado and Café Preto Sem Açúcar skip the next untap",()=>{for(const page of [241,249])assert.equal(printed(page).abilities[0].effects[1].type,"skipNextUntap");assert.equal(printed(249).abilities[0].effects[1].reusePreviousTarget,true);assert.equal(printed(249).abilities[0].effects[0].selections,1);const game=state();game.phase="fim";game.active=0;game.players[1].board.push(unit("sleepy",{exhausted:true,skipNextUntap:true}));const next=executeCommand(game,{type:"advancePhase",owner:0,handLimitSatisfied:true}).state;assert.equal(next.players[1].board[0].exhausted,true);assert.equal(next.players[1].board[0].skipNextUntap,false);});'
if old not in s:
    raise SystemExit('rasmus test anchor not found')
old_test.write_text(s.replace(old, new, 1), encoding='utf-8')

Path('tests/cafe-preto-single-target.test.mjs').write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport cards from "../app/cards.generated.json" with { type: "json" };\nimport { compileCard } from "../app/rules-engine/compiler.mjs";\nimport { executeCommand } from "../app/rules-engine/engine.mjs";\nimport { cardPlayTargetPolicy } from "../app/rules-engine/targeting.mjs";\n\nconst catalog=cards.map(compileCard);\nconst coffee=compileCard(cards.find(card=>card.page===249));\nconst state=()=>({active:0,phase:"principal",round:2,cardCatalog:catalog,players:[0,1].map(owner=>({heroId:owner?"goblin":"rasmus",level:1,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:owner?[]:[{...coffee,id:"black-coffee",cost:0}],board:owner?[]:[{uid:"target",id:"target",name:"Target",page:999,type:"Criatura",cost:0,atk:2,hp:3,text:"",tags:[],subtypes:[],abilities:[],slot:0,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false,enteredRound:0}],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0}))});\n\ntest("Café Preto Sem Açúcar asks for exactly one target",()=>{\n  const policy=cardPlayTargetPolicy(coffee);\n  assert.equal(policy.selections,1);\n  assert.equal(policy.steps.length,1);\n  assert.equal(coffee.abilities[0].effects[1].type,"skipNextUntap");\n  assert.equal(coffee.abilities[0].effects[1].reusePreviousTarget,true);\n});\n\ntest("Café Preto applies +5/+5 and skipNextUntap to the same target",()=>{\n  const next=executeCommand(state(),{type:"playCard",owner:0,cardId:"black-coffee",targetIds:["target"],skipPriority:true}).state;\n  const target=next.players[0].board.find(card=>card.uid==="target");\n  assert.ok(target);\n  assert.equal((target.modifiers||[]).reduce((sum,mod)=>sum+(mod.attack||0),0),5);\n  assert.equal((target.modifiers||[]).reduce((sum,mod)=>sum+(mod.health||0),0),5);\n  assert.equal(target.skipNextUntap,true);\n});\n''', encoding='utf-8')
