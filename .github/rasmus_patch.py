from pathlib import Path
import json

cards_path = Path('app/cards.generated.json')
cards = json.loads(cards_path.read_text())
cards = [card for card in cards if card.get('page') not in {233, 234}]
cards_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + '\n')

rules_path = Path('app/rules-engine/card-rules.mjs')
rules = rules_path.read_text()
replacements = {
'  p229: [ability("activated", [effect("createImage", { name: "Café Expresso", destination: "hand" })], [{ type: "tap", amount: 1 }], { usageLimit: { count: 1, period: "turn" } })],':'  p229: [ability("activated", [effect("createImage", { name: "Café Expresso", destination: "hand" })], [{ type: "tap", amount: 1 }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } })],',
'  p232: [ability("activated", [effect("grantKeyword", { target: "anyPermanent", keyword: "Barreira Mágica", duration: "turn" })], [{ type: "tap", amount: 1 }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } })],':'  p232: [ability("activated", [effect("grantKeyword", { target: "anyPermanent", keyword: "Barreira Mágica", duration: "permanent" })], [{ type: "tap", amount: 1 }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } })],',
'  p233: [ability("static", [effect("cannotDefend"), effect("cannotBeDestroyedForSpace")]), ability("onEnter", [effect("loseLife", { amount: 1, target: "controllerHero" })]), ability("activated", [effect("moveSelf", { destination: "obscuro" })], [{ type: "energy", amount: 1 }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } }), ability("onTurnEnd", [effect("loseLife", { amount: 1, target: "controllerHero" })], [], { condition: { controllerSubtypeEnteredThisTurn: { subtype: "Gato", count: 0 } } })],':'  p233: { ignored: true, reason: "removed-from-catalog" },',
'  p234: [ability("onPlay", [effect("ready", { target: "anyCreature" }), effect("modifyStats", { target: "anyCreature", attack: 1, health: 1, duration: "turn" })])],':'  p234: { ignored: true, reason: "removed-from-catalog" },',
'  p241: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", attack: 5, health: 5, duration: "untilNextTurn" }), effect("immobilize", { target: "anyCreature" })])],':'  p241: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", attack: 5, health: 5, duration: "untilNextTurn" }), effect("skipNextUntap", { target: "anyCreature" })])],',
'  p249: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", attack: 5, health: 5, duration: "untilNextTurn" }), effect("immobilize", { target: "anyCreature" })])],':'  p249: [ability("onPlay", [effect("modifyStats", { target: "anyCreature", attack: 5, health: 5, duration: "untilNextTurn" }), effect("skipNextUntap", { target: "anyCreature" })])],',
}
for old,new in replacements.items():
    if old not in rules: raise SystemExit('missing card-rules pattern: '+old[:100])
    rules = rules.replace(old,new)
anchor='  p218: [ability("static", [effect("subtypeAura", { subtype: "Gato", attack: 1, health: 1 })])],\n'
if '  p220:' not in rules:
    if anchor not in rules: raise SystemExit('missing p218 anchor')
    rules=rules.replace(anchor,anchor+'  p220: [ability("static", [effect("keyword", { keyword: "Barreira Mágica" }), effect("supportAura", { keyword: "Barreira Mágica" })])],\n')
rules_path.write_text(rules)

effects_path=Path('app/rules-engine/effects.mjs')
effects=effects_path.read_text()
if 'skipNextUntap(state, effect, context)' not in effects:
    anchor='  grantDamageShield(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damageShields ||= []; target.damageShields.push({ uses: effect.uses ?? 1, sourceId: context.sourceId, expires: effect.duration }); },\n'
    if anchor not in effects: raise SystemExit('missing effects anchor')
    effects=effects.replace(anchor,anchor+'  skipNextUntap(state, effect, context) { for (const target of effectTargets(state, effect, context)) { if (!target) throw new RulesViolation("target-required"); target.skipNextUntap = true; } },\n')
effects=effects.replace('"effectAppliedRound", "effectAppliedSourceId", "staysExhaustedUntilSpellEffect"','"effectAppliedRound", "effectAppliedSourceId", "staysExhaustedUntilSpellEffect", "skipNextUntap"')
effects_path.write_text(effects)

engine_path=Path('app/rules-engine/engine-base.mjs')
engine=engine_path.read_text()
old='const immobilized = unit.immobilized || hasKeyword(unit, /imobilizado/i); if (immobilized) { unit.immobilized = false; unit.tags = (unit.tags || []).filter((tag) => !/imobilizado/i.test(String(tag))); } else unit.exhausted = false;'
new='const skipNextUntap = !!unit.skipNextUntap; const immobilized = unit.immobilized || hasKeyword(unit, /imobilizado/i); if (skipNextUntap) { unit.skipNextUntap = false; unit.exhausted = true; } else if (immobilized) { unit.immobilized = false; unit.tags = (unit.tags || []).filter((tag) => !/imobilizado/i.test(String(tag))); } else unit.exhausted = false;'
if old not in engine: raise SystemExit('missing maintenance pattern')
engine=engine.replace(old,new)
start=engine.find('function refreshSupportAuras(state){')
end=engine.find('\n\nfunction requiredBlockerKeyword',start)
if start<0 or end<0: raise SystemExit('missing refreshSupportAuras')
replacement='''function refreshSupportAuras(state){
  for(const entry of state.players) for(const unit of [...(entry.board||[]), ...(entry.support||[])]) {
    unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:")&&!String(value).startsWith("duelist:"));
    unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");
    unit.staticModifiers=(unit.staticModifiers||[]).filter(value=>value.type!=="supportAura"||!value.sourceId||!!findPermanent(state,value.sourceId));
  }
  state.players.forEach((entry)=>{
    const zones=[entry.board||[], entry.support||[]];
    for(const zone of zones) for(const source of zone){
      if(source.suffocated) continue;
      if(zone===entry.support && source.type!=="Criatura") continue;
      const sourceId=source.uid||source.id;
      for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){
        const externalSource=aura.sourceId?findPermanent(state,aura.sourceId):null;
        if(aura.sourceId&&(!externalSource||externalSource.suffocated)) continue;
        for(const target of zone.filter(unit=>unit.type==="Criatura"&&!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){
          if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(`support:${sourceId}:${aura.keyword}`);}
          if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId:aura.sourceId||sourceId});}
        }
      }
    }
    const female=entry.board.find(unit=>unit.page===171&&!unit.suffocated),male=entry.board.find(unit=>unit.page===172&&!unit.suffocated);
    if(female&&male){for(const target of [female,male]){target.grantedKeywords||=[];target.grantedKeywords.push("duelist:pair:Barreira Mágica","duelist:pair:Robusto");}}
  });
}'''
engine=engine[:start]+replacement+engine[end:]
engine_path.write_text(engine)

Path('tests/rasmus-authoritative.test.mjs').write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";
const catalog=cards.map(compileCard);
const printed=(page,overrides={})=>({...compileCard(cards.find(card=>card.page===page)),...overrides});
const state=(heroId="rasmus",level=3)=>({active:0,phase:"principal",round:2,cardCatalog:catalog,players:[0,1].map(owner=>({heroId:owner?"gimble":heroId,level:owner?1:level,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0}))});
const unit=(uid,overrides={})=>({uid,id:uid,name:uid,page:999,type:"Criatura",cost:0,atk:1,hp:3,text:"",tags:[],subtypes:[],abilities:[],slot:0,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false,enteredRound:0,...overrides});
test("canonical Rasmus duplicate cards are removed",()=>{assert.equal(cards.some(card=>card.page===233),false);assert.equal(cards.some(card=>card.page===234),false);assert.equal(cards.find(card=>card.page===213)?.name,"Gato Multidimensional");assert.equal(cards.find(card=>card.page===230)?.imageCard,true);});
test("image creation resolves canonical Rasmus versions",()=>{const game=state();defaultEffectHandlers.createImage(game,{type:"createImage",name:"Gato Multidimensional",destination:"field"},{owner:0,sourceId:"test"});defaultEffectHandlers.createImage(game,{type:"createImage",name:"Café Expresso",destination:"hand"},{owner:0,sourceId:"test"});assert.equal(game.players[0].board[0].page,213);assert.equal(game.players[0].hand[0].page,230);});
test("Máquina de Expresso is UI activatable",()=>{const game=state(),machine={...printed(229),uid:"machine",slot:0,enteredRound:0,exhausted:false,summoning:false};game.players[0].support.push(machine);const ability=machine.abilities.find(a=>a.trigger==="activated");assert.equal(ability.uiActivation,true);const resolved=executeCommand(game,{type:"activate",owner:0,sourceId:"machine",abilityId:ability.id}).state;assert.equal(resolved.players[0].support[0].exhausted,true);assert.equal(resolved.players[0].hand.at(-1).page,230);});
test("Infusão de Café grants permanent barrier",()=>{assert.equal(printed(232).abilities.find(a=>a.trigger==="activated").effects[0].duration,"permanent");});
test("filtered coffees use skipNextUntap",()=>{for(const page of [241,249])assert.equal(printed(page).abilities[0].effects[1].type,"skipNextUntap");const game=state();game.phase="fim";game.active=0;game.players[1].board.push(unit("sleepy",{exhausted:true,skipNextUntap:true}));const next=executeCommand(game,{type:"advancePhase",owner:0,handLimitSatisfied:true}).state;assert.equal(next.players[1].board[0].exhausted,true);assert.equal(next.players[1].board[0].skipNextUntap,false);});
test("witch cat supports adjacent auxiliary creatures",()=>{const game=state(),witch={...printed(220),uid:"witch",slot:1,enteredRound:0,exhausted:false,summoning:false},left=unit("left",{slot:0}),right=unit("right",{slot:2});game.players[0].support.push(witch,left,right);const refreshed=executeCommand(game,{type:"emit",owner:0,event:{type:"noop",owner:0}}).state;for(const id of ["left","right"])assert.ok(refreshed.players[0].support.find(card=>card.uid===id).grantedKeywords.some(tag=>String(tag).includes("Barreira Mágica")));});
test("Gato Viciado copies any Café effect applied to another creature",()=>{const game=state(),addict={...printed(247),uid:"addict",slot:0,enteredRound:0,exhausted:false,summoning:false,modifiers:[],grantedKeywords:[]},target=unit("target",{slot:1});game.players[0].board.push(addict,target);game.players[0].hand.push({...printed(252),id:"double",uid:"double",cost:0});const resolved=executeCommand(game,{type:"playCard",owner:0,cardId:"double",targetIds:["target"],skipPriority:true}).state;const bonus=card=>(card.modifiers||[]).reduce((sum,mod)=>sum+(mod.health||0),0);assert.equal(bonus(resolved.players[0].board.find(card=>card.uid==="target")),2);assert.equal(bonus(resolved.players[0].board.find(card=>card.uid==="addict")),2);});
''')
