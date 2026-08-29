import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";
import { chooseAIDecision } from "../app/rules-engine/ai.mjs";

const catalog=cards.map(compileCard);
const printed=page=>compileCard(cards.find(card=>card.page===page));
const player=(heroId,level=1)=>({heroId,level,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:5,maxEnergy:5,reserve:0,deck:[],extraDeck:catalog.filter(card=>card.imageCard),hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0});
const state=(active=0,level=1)=>({active,phase:"manutencao",round:3,cardCatalog:catalog,players:[player("rasmus",level),player("goblin",1)]});
const installCafe=(game,owner=0)=>{game.players[owner].terrain={...printed(212),uid:`cafe-time-${owner}`,slot:0,enteredRound:1,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false};};
const assertBattlefieldCat=(cat,slot)=>{assert.ok(cat);assert.equal(cat.slot,slot);assert.equal(cat.page,213);assert.equal(cat.atk,0);assert.equal(cat.hp,1);assert.equal(cat.exhausted,false);assert.equal(cat.revealed,undefined);assert.equal(cat.revealedTo,undefined);};

test("Café do Tempo waits until maintenance is left and its controller chooses on own turn",()=>{
 const game=state(0);installCafe(game,0);
 const next=executeCommand(game,{type:"advancePhase",owner:0}).state;
 assert.equal(next.phase,"principal");
 assert.equal(next.pendingDecision?.kind,"image-placement");
 assert.equal(next.pendingDecision?.owner,0);
 assert.equal(next.pendingDecision?.effect.targetOwner,0);
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:2,placementZone:"creature"}).state;
 const cat=placed.players[0].board.find(card=>card.name==="Gato Multidimensional");
 assertBattlefieldCat(cat,2);assert.equal(placed.players[1].board.length,0);
});

test("Café do Tempo controller chooses placement on the opponent active field",()=>{
 const game=state(1);installCafe(game,0);
 const next=executeCommand(game,{type:"advancePhase",owner:1}).state;
 assert.equal(next.pendingDecision?.owner,0);
 assert.equal(next.pendingDecision?.effect.targetOwner,1);
 assert.throws(()=>executeCommand(next,{type:"resolveDecision",owner:1,slot:1,placementZone:"creature"}),/decision-not-owned/);
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:3,placementZone:"creature"}).state;
 assert.equal(placed.players[0].board.length,0);
 const cat=placed.players[1].board.find(card=>card.name==="Gato Multidimensional");assertBattlefieldCat(cat,3);
 assert.equal(placed.players[0].life,30,"o controlador do Café não paga o Primeiro Ato do Gato colocado no campo rival");
 assert.equal(placed.players[1].life,29,"o Primeiro Ato é aplicado ao jogador que recebeu o Gato em seu campo");
 assert.equal(placed.players[1].subtypesEnteredThisTurn.Gato,1,"a Imagem criada conta como um Gato que entrou no campo rival");
});

test("Gato Multidimensional checks its controller only after that player's combat",()=>{
 const opponentTurn=state(0);opponentTurn.phase="combate";
 opponentTurn.players[1].board.push({...printed(213),uid:"opponent-cat",slot:0,damage:0,exhausted:false,summoning:false,modifiers:[]});
 opponentTurn.players[1].subtypesEnteredThisTurn={};
 const afterOpponentCombat=executeCommand(opponentTurn,{type:"advancePhase",owner:0}).state;
 assert.equal(afterOpponentCombat.phase,"fim");
 assert.equal(afterOpponentCombat.players[1].life,30,"o Gato não cobra sua penalidade no turno do outro jogador");

 const controllerTurn=structuredClone(afterOpponentCombat);controllerTurn.active=1;controllerTurn.phase="combate";
 const afterControllerCombat=executeCommand(controllerTurn,{type:"advancePhase",owner:1}).state;
 assert.equal(afterControllerCombat.phase,"fim");
 assert.equal(afterControllerCombat.players[1].life,29,"sem outro Gato no turno, a penalidade resolve ao sair do combate do controlador");
});

test("a newly created Gato does not immediately fail its own end-of-turn condition",()=>{
 const game=state(1);installCafe(game,0);
 const placement=executeCommand(game,{type:"advancePhase",owner:1}).state;
 const placed=executeCommand(placement,{type:"resolveDecision",owner:0,slot:2,placementZone:"creature"}).state;
 assert.equal(placed.players[1].life,29,"somente o Primeiro Ato foi pago na entrada");
 const combat=executeCommand(placed,{type:"advancePhase",owner:1}).state;
 assert.equal(combat.phase,"combate");
 const ending=executeCommand(combat,{type:"advancePhase",owner:1}).state;
 assert.equal(ending.phase,"fim");
 assert.equal(ending.players[1].life,29,"o próprio Gato criado satisfaz a condição de entrada neste turno");
});

test("Café do Tempo placement owns Online priority before the active opponent can continue",()=>{
 const game=state(1);installCafe(game,0);
 const next=executeOnlineCommand(game,{type:"advancePhase",owner:1},{priority:true}).state;
 assert.equal(next.phase,"principal");
 assert.equal(next.pendingDecision?.kind,"image-placement");
 assert.equal(next.pendingDecision?.owner,0);
 assert.equal(next.priority?.owner,0,"a prioridade Online deve pertencer ao controlador do Café");
 assert.throws(()=>executeOnlineCommand(next,{type:"advancePhase",owner:1},{priority:true}),/image-placement-priority/);
 assert.throws(()=>executeOnlineCommand(next,{type:"passPriority",owner:1},{priority:true}),/image-placement-priority/);
 const placed=executeOnlineCommand(next,{type:"resolveDecision",owner:0,slot:4,placementZone:"creature"},{priority:true}).state;
 assert.equal(placed.pendingDecision??null,null);
 const cat=placed.players[1].board.find(card=>card.name==="Gato Multidimensional");assertBattlefieldCat(cat,4);
 assert.equal(placed.priority?.owner,1,"após posicionar o Gato, a prioridade normal volta ao jogador ativo");
});

test("Rasmus level 3 may place Café do Tempo cat in an available auxiliary slot of the active player",()=>{
 const game=state(1,3);installCafe(game,0);game.players[1].support.push({...printed(229),uid:"occupied",slot:0,enteredRound:1,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false});
 const next=executeCommand(game,{type:"advancePhase",owner:1}).state;
 assert.ok(next.pendingDecision.effect.supportSlots.includes(1));
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:1,placementZone:"support"}).state;
 const cat=placed.players[1].support.find(card=>card.name==="Gato Multidimensional");assertBattlefieldCat(cat,1);
});

test("AI resolves its own Café do Tempo placement through the same decision",()=>{
 const game=state(0);installCafe(game,1);game.players[1].heroId="rasmus";
 const next=executeCommand(game,{type:"advancePhase",owner:0}).state;
 assert.equal(next.pendingDecision.owner,1);
 const command=chooseAIDecision(next,1,"Normal");assert.equal(command.type,"resolveDecision");assert.equal(command.owner,1);assert.ok(Number.isInteger(command.slot));
 const placed=executeCommand(next,command).state;const cat=placed.players[0].board.find(card=>card.name==="Gato Multidimensional");assertBattlefieldCat(cat,command.slot);
});

test("Café do Tempo hydrates the canonical Gato on an opponent field even without cardCatalog",()=>{
 const game=state(1);delete game.cardCatalog;installCafe(game,0);
 game.players[1].extraDeck=[];
 const next=executeCommand(game,{type:"advancePhase",owner:1}).state;
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:2,placementZone:"creature"}).state;
 const cat=placed.players[1].board.find(card=>card.name==="Gato Multidimensional");assertBattlefieldCat(cat,2);
});
