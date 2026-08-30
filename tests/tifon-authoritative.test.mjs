import test from "node:test";
import assert from "node:assert/strict";
import cardsJson from "../app/data/catalog/cards.generated.json" with { type: "json" };
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
