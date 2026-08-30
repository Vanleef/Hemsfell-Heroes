import assert from 'node:assert/strict';
import test from 'node:test';
import cards from '../app/data/catalog/cards.generated.json' with { type: 'json' };
import { compileCard } from '../app/rules-engine/compiler.mjs';
import { executeCommand } from '../app/rules-engine/engine.mjs';

const catalog=cards.map(compileCard);
const byPage=(page)=>compileCard(cards.find(card=>Number(card.page)===page));
const player=()=>({heroId:'gimble',level:1,heroXP:0,markers:{},levelUpsThisTurn:0,life:30,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0,cardsPlayed:0,spellsPlayed:0,lifeLostThisTurn:0,lifeLossEvents:0,abilityUses:{},turnDeaths:0});
const state=()=>({active:0,phase:'principal',round:2,events:0,cardCatalog:catalog,players:[player(),player()]});
const unit=(card,uid,slot=0)=>({...card,uid,slot,enteredRound:1,summoning:false,exhausted:false,attackedThisTurn:false,attacksThisTurn:0,defenseUses:0,damage:0,modifiers:[],grantedKeywords:[],temporaryTags:[],markers:{}});
const play=(game,card)=>{game.players[0].hand=[card];return executeCommand(game,{type:'playCard',owner:0,cardId:card.id,slot:game.players[0].board.length,skipPriority:true}).state};

test('Xarqiroth does not count itself when resolving its onEnter',()=>{
  let game=state();
  game.players[0].deck=[byPage(15),byPage(16),byPage(17)];
  game=play(game,byPage(7));
  assert.equal(game.players[0].hand.length,0,'Xarqiroth alone must not draw');

  game=state();
  game.players[0].board.push(unit(byPage(3),'other-dragon',0));
  game.players[0].deck=[byPage(15),byPage(16),byPage(17)];
  game=play(game,byPage(7));
  assert.equal(game.players[0].hand.length,2,'Xarqiroth draws exactly 2 with another allied Dragon already in play');
});
