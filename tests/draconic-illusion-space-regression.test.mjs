import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const byPage=(page)=>compileCard(cards.find(card=>Number(card.page)===page));
const creature=(n)=>({...compileCard({page:800+n,id:`c${n}`,name:`Criatura ${n}`,type:"Criatura",cost:0,atk:1,hp:1,text:"",tags:[],subtypes:[]}),uid:`u${n}`,slot:n,damage:0,exhausted:false,summoning:false,modifiers:[]});
const state=()=>({active:0,phase:"principal",round:1,players:[0,1].map((_,i)=>({heroId:i?"goblin":"gimble",level:1,life:30,maxLife:30,energy:20,maxEnergy:20,reserve:0,deck:[],extraDeck:[byPage(23),byPage(24),byPage(25)].filter(Boolean),hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],cardsPlayed:0,turnCardsPlayed:0,turnSpellsPlayed:0,spellsPlayed:0,abilityUses:{}})),rulesEvents:[],pendingDecision:null,pendingResponse:null,combatAction:null});

for (const page of [12,13,14]) test(`Ilusão Dracônica p${page} não pode ser jogada sem espaço de criatura`,()=>{
  const g=state(); g.players[0].board=[0,1,2,3,4].map(creature); g.players[0].hand=[{...byPage(page),id:`illusion-${page}`}];
  assert.throws(()=>executeCommand(g,{type:"playCard",owner:0,cardId:`illusion-${page}`,skipPriority:true}),/play-condition-not-met/);
});
