import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const catalog=cards.map(compileCard);
const printed=page=>compileCard(cards.find(card=>card.page===page));
const player=heroId=>({heroId,level:1,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0});
const state=()=>({active:0,phase:"principal",round:3,cardCatalog:catalog,players:[player("rasmus"),player("goblin")],log:[],winner:null,selectedAttackers:[],events:0});

test("revealed terrain loses hidden-zone reveal metadata when played to field",()=>{
 const game=state();const cafe={...printed(212),revealed:true,revealedTo:[0,1]};game.players[0].hand=[cafe];
 const next=executeCommand(game,{type:"playCard",owner:0,cardId:cafe.id,slot:0}).state;
 assert.ok(next.players[0].terrain);assert.equal(next.players[0].terrain.page,212);
 assert.equal(next.players[0].terrain.revealed,undefined);assert.equal(next.players[0].terrain.revealedTo,undefined);
});

test("revealed creature loses hidden-zone reveal metadata when played to field",()=>{
 const game=state();const creature={...printed(214),revealed:true,revealedTo:[0,1]};game.players[0].hand=[creature];
 const next=executeCommand(game,{type:"playCard",owner:0,cardId:creature.id,slot:0}).state;
 assert.ok(next.players[0].board[0]);assert.equal(next.players[0].board[0].revealed,undefined);assert.equal(next.players[0].board[0].revealedTo,undefined);
});
