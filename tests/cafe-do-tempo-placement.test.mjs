import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { chooseAIDecision } from "../app/rules-engine/ai.mjs";

const catalog=cards.map(compileCard);
const printed=page=>compileCard(cards.find(card=>card.page===page));
const player=(heroId,level=1)=>({heroId,level,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:5,maxEnergy:5,reserve:0,deck:[],extraDeck:catalog.filter(card=>card.imageCard),hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0});
const state=(active=0,level=1)=>({active,phase:"manutencao",round:3,cardCatalog:catalog,players:[player("rasmus",level),player("goblin",1)]});
const installCafe=(game,owner=0)=>{game.players[owner].terrain={...printed(212),uid:`cafe-time-${owner}`,slot:0,enteredRound:1,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false};};

test("Café do Tempo waits until maintenance is left and its controller chooses on own turn",()=>{
 const game=state(0);installCafe(game,0);
 const next=executeCommand(game,{type:"advancePhase",owner:0}).state;
 assert.equal(next.phase,"principal");
 assert.equal(next.pendingDecision?.kind,"image-placement");
 assert.equal(next.pendingDecision?.owner,0);
 assert.equal(next.pendingDecision?.effect.targetOwner,0);
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:2,placementZone:"creature"}).state;
 const cat=placed.players[0].board.find(card=>card.name==="Gato Multidimensional");
 assert.ok(cat);assert.equal(cat.slot,2);assert.equal(placed.players[1].board.length,0);
 assert.equal(cat.exhausted,false,"Gato Multidimensional deve entrar desvirado");
 assert.equal(cat.revealed,true,"Gato Multidimensional criado em campo deve ficar com a face pública");
 assert.deepEqual(cat.revealedTo,[0,1],"ambos os jogadores devem enxergar o Gato Multidimensional em campo");
});

test("Café do Tempo controller chooses placement on the opponent active field",()=>{
 const game=state(1);installCafe(game,0);
 const next=executeCommand(game,{type:"advancePhase",owner:1}).state;
 assert.equal(next.pendingDecision?.owner,0);
 assert.equal(next.pendingDecision?.effect.targetOwner,1);
 assert.throws(()=>executeCommand(next,{type:"resolveDecision",owner:1,slot:1,placementZone:"creature"}),/decision-not-owned/);
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:3,placementZone:"creature"}).state;
 assert.equal(placed.players[0].board.length,0);
 const cat=placed.players[1].board.find(card=>card.name==="Gato Multidimensional");assert.ok(cat);assert.equal(cat.slot,3);assert.equal(cat.exhausted,false);assert.equal(cat.revealed,true);assert.deepEqual(cat.revealedTo,[0,1]);
});

test("Rasmus level 3 may place Café do Tempo cat in an available auxiliary slot of the active player",()=>{
 const game=state(1,3);installCafe(game,0);game.players[1].support.push({...printed(229),uid:"occupied",slot:0,enteredRound:1,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false});
 const next=executeCommand(game,{type:"advancePhase",owner:1}).state;
 assert.ok(next.pendingDecision.effect.supportSlots.includes(1));
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:1,placementZone:"support"}).state;
 const cat=placed.players[1].support.find(card=>card.name==="Gato Multidimensional");assert.ok(cat);assert.equal(cat.slot,1);assert.equal(cat.exhausted,false);assert.equal(cat.revealed,true);assert.deepEqual(cat.revealedTo,[0,1]);
});

test("AI resolves its own Café do Tempo placement through the same decision",()=>{
 const game=state(0);installCafe(game,1);game.players[1].heroId="rasmus";
 const next=executeCommand(game,{type:"advancePhase",owner:0}).state;
 assert.equal(next.pendingDecision.owner,1);
 const command=chooseAIDecision(next,1,"Normal");assert.equal(command.type,"resolveDecision");assert.equal(command.owner,1);assert.ok(Number.isInteger(command.slot));
 const placed=executeCommand(next,command).state;const cat=placed.players[0].board.find(card=>card.name==="Gato Multidimensional");assert.ok(cat);assert.equal(cat.revealed,true);assert.deepEqual(cat.revealedTo,[0,1]);
});
