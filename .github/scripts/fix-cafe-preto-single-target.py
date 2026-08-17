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
new = '''  const effectSteps = abilities.flatMap((ability) => (ability.effects || []).flatMap((effect) => {\n    const scope = effectScope(effect.target);\n    /* Some compound effects apply multiple consequences to the same chosen target.\n       Those follow-up effects reuse the prior target and must not create another UI selection step. */\n    if (scope === TargetScope.NONE || effect.global || effect.reusePreviousTarget) return [];'''
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

old_test = Path('tests/rasmus-authoritative.test.mjs')
s = old_test.read_text(encoding='utf-8')
old = 'test("filtered coffee uses skipNextUntap",()=>{assert.equal(printed(241).abilities[0].effects[1].type,"skipNextUntap");'
new = 'test("filtered coffees use skipNextUntap",()=>{for(const page of [241,249])assert.equal(printed(page).abilities[0].effects[1].type,"skipNextUntap");'
if old in s:
    s = s.replace(old, new, 1)
else:
    old2 = 'test("filtered coffees use skipNextUntap",()=>{for(const page of [241])assert.equal(printed(page).abilities[0].effects[1].type,"skipNextUntap");'
    if old2 in s:
        s = s.replace(old2, new, 1)
old_test.write_text(s, encoding='utf-8')

Path('tests/cafe-preto-single-target.test.mjs').write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport cards from "../app/cards.generated.json" with { type: "json" };\nimport { compileCard } from "../app/rules-engine/compiler.mjs";\nimport { executeCommand } from "../app/rules-engine/engine.mjs";\nimport { cardPlayTargetPolicy } from "../app/rules-engine/targeting.mjs";\n\nconst catalog=cards.map(compileCard);\nconst coffee=compileCard(cards.find(card=>card.page===249));\nconst state=()=>({active:0,phase:"principal",round:2,cardCatalog:catalog,players:[0,1].map(owner=>({heroId:owner?"goblin":"rasmus",level:1,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:owner?[]:[{...coffee,id:"black-coffee",cost:0}],board:owner?[]:[{uid:"target",id:"target",name:"Target",page:999,type:"Criatura",cost:0,atk:2,hp:3,text:"",tags:[],subtypes:[],abilities:[],slot:0,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false,enteredRound:0}],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0}))});\n\ntest("Café Preto Sem Açúcar asks for exactly one target",()=>{\n  const policy=cardPlayTargetPolicy(coffee);\n  assert.equal(policy.selections,1);\n  assert.equal(policy.steps.length,1);\n  assert.equal(coffee.abilities[0].effects[1].type,"skipNextUntap");\n  assert.equal(coffee.abilities[0].effects[1].reusePreviousTarget,true);\n});\n\ntest("Café Preto applies +5/+5 and skipNextUntap to the same target",()=>{\n  const next=executeCommand(state(),{type:"playCard",owner:0,cardId:"black-coffee",targetIds:["target"],skipPriority:true}).state;\n  const target=next.players[0].board.find(card=>card.uid==="target");\n  assert.ok(target);\n  assert.equal((target.modifiers||[]).reduce((sum,mod)=>sum+(mod.attack||0),0),5);\n  assert.equal((target.modifiers||[]).reduce((sum,mod)=>sum+(mod.health||0),0),5);\n  assert.equal(target.skipNextUntap,true);\n});\n''', encoding='utf-8')
