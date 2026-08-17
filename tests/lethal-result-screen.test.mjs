import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import cards from '../app/cards.generated.json' with { type: 'json' };
import { compileCard } from '../app/rules-engine/compiler.mjs';
import { executeCommand } from '../app/rules-engine/engine.mjs';

const catalog=cards.map(compileCard);
const baseState=()=>({active:0,phase:'principal',round:2,winner:null,cardCatalog:catalog,players:[0,1].map(owner=>({heroId:owner?'gimble':'saymon',level:1,heroXP:0,markers:{},abilityUses:{},life:owner?30:2,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0,spellsPlayed:0}))});

test('authoritative engine declares defeat immediately when own action leaves hero at zero',()=>{
 const game=baseState();
 const result=executeCommand(game,{type:'activateHero',owner:0,abilityId:'saymon-level-1',targetIds:['enemy-hero']},{priority:false}).state;
 assert.equal(result.players[0].life,0);
 assert.equal(result.winner,1);
 assert.equal(result.pendingDecision,null);
 assert.equal(result.pendingResponse,null);
 assert.equal(result.combatAction,null);
});

test('result screen renders winner hero art and menu actions',()=>{
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/match-result-art/);
 assert.match(page,/RemoteCardArt page=\{deckById\(game\.players\[game\.winner\]\.heroId\)\.heroPage\}/);
 assert.match(page,/FIM DA PARTIDA/);
 assert.match(page,/>Menu<\/button>/);
});

test('match result has responsive dedicated styling',()=>{
 const css=fs.readFileSync(new URL('../app/match-result.css',import.meta.url),'utf8');
 assert.match(css,/grid-template-columns:minmax\(12rem,19rem\) minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:680px\)/);
});
