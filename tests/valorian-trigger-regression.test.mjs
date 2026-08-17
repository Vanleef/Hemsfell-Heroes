import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const byPage=(page)=>compileCard(cards.find(card=>Number(card.page)===page));
const base=()=>({active:0,phase:"principal",round:1,players:[0,1].map((_,i)=>({heroId:i?"goblin":"gimble",level:1,life:30,maxLife:30,energy:20,maxEnergy:20,reserve:0,deck:[],extraDeck:[],hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],cardsPlayed:0,turnCardsPlayed:0,turnSpellsPlayed:0,spellsPlayed:0,abilityUses:{}})),rulesEvents:[],pendingDecision:null,pendingResponse:null,combatAction:null});

test("Valorian custo 7 não ativa na própria entrada",()=>{
  const g=base(); const valorian=byPage(11); g.players[0].hand.push({...valorian,id:"valorian-hand"});
  const r=executeCommand(g,{type:"playCard",owner:0,cardId:"valorian-hand",slot:0,skipPriority:true}).state;
  assert.equal(r.players[1].life,30);
});

test("Valorian custo 7 ignora criatura aliada que não é Dragão",()=>{
  let g=base(); const valorian=byPage(11); g.players[0].hand.push({...valorian,id:"valorian-hand"});
  g=executeCommand(g,{type:"playCard",owner:0,cardId:"valorian-hand",slot:0,skipPriority:true}).state;
  const nonDragon=compileCard({page:999,id:"non-dragon",name:"Soldado",type:"Criatura",cost:0,atk:1,hp:1,text:"",tags:[],subtypes:[]});
  g.players[0].hand.push(nonDragon);
  g=executeCommand(g,{type:"playCard",owner:0,cardId:"non-dragon",slot:1,skipPriority:true}).state;
  assert.equal(g.players[1].life,30);
});

test("Valorian custo 7 ativa quando outro Dragão aliado entra",()=>{
  let g=base(); const valorian=byPage(11); g.players[0].hand.push({...valorian,id:"valorian-hand"});
  g=executeCommand(g,{type:"playCard",owner:0,cardId:"valorian-hand",slot:0,skipPriority:true}).state;
  const dragon=compileCard({page:998,id:"dragon",name:"Outro Dragão",type:"Criatura",cost:0,atk:1,hp:1,text:"",tags:["Dragão"],subtypes:["Dragão"]});
  g.players[0].hand.push(dragon);
  g=executeCommand(g,{type:"playCard",owner:0,cardId:"dragon",slot:1,skipPriority:true}).state;
  assert.equal(g.players[1].life,28);
});
