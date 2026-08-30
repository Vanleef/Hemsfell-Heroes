import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { cardPlayTargetPolicy } from "../app/rules-engine/targeting.mjs";

const catalog=cards.map(compileCard);
const coffee=compileCard(cards.find(card=>card.page===249));
const state=()=>({active:0,phase:"principal",round:2,cardCatalog:catalog,players:[0,1].map(owner=>({heroId:owner?"goblin":"rasmus",level:1,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:owner?[]:[{...coffee,id:"black-coffee",cost:0}],board:owner?[]:[{uid:"target",id:"target",name:"Target",page:999,type:"Criatura",cost:0,atk:2,hp:3,text:"",tags:[],subtypes:[],abilities:[],slot:0,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false,enteredRound:0}],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0}))});

test("Café Preto Sem Açúcar asks for exactly one target",()=>{
  const policy=cardPlayTargetPolicy(coffee);
  assert.equal(policy.selections,1);
  assert.equal(policy.steps.length,1);
  assert.equal(coffee.abilities[0].effects[1].type,"skipNextUntap");
  assert.equal(coffee.abilities[0].effects[1].reusePreviousTarget,true);
});

test("Café Preto applies +5/+5 and skipNextUntap to the same target",()=>{
  const next=executeCommand(state(),{type:"playCard",owner:0,cardId:"black-coffee",targetIds:["target"],skipPriority:true}).state;
  const target=next.players[0].board.find(card=>card.uid==="target");
  assert.ok(target);
  assert.equal((target.modifiers||[]).reduce((sum,mod)=>sum+(mod.attack||0),0),5);
  assert.equal((target.modifiers||[]).reduce((sum,mod)=>sum+(mod.health||0),0),5);
  assert.equal(target.skipNextUntap,true);
});
