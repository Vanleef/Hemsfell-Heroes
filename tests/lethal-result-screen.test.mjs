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

test('result screen renders winner hero art and menu actions through consolidated UI runtime',()=>{
 const runtime=fs.readFileSync(new URL('../app/match-ui-runtime.tsx',import.meta.url),'utf8');
 const guard=fs.readFileSync(new URL('../app/match-ui-guard.tsx',import.meta.url),'utf8');
 assert.match(runtime,/const RESULT_HEROES/);
 assert.match(runtime,/className="match-result-hero-art"/);
 assert.match(runtime,/<RemoteCardArt page=\{result\.page\} name=\{result\.name\} priority/);
 assert.match(runtime,/enhanced-match-result/);
 assert.match(guard,/result-menu-button/);
 assert.match(guard,/Voltar ao menu/);
});

test('match result has responsive dedicated styling',()=>{
 const css=fs.readFileSync(new URL('../app/match-result-enhancer.css',import.meta.url),'utf8');
 assert.match(css,/\.enhanced-match-result\{/);
 assert.match(css,/\.match-result-hero-art\{/);
 assert.match(css,/@media \(max-width:760px\),\(max-height:620px\)/);
});

test('match result overlay remains centered and self-contained above board layout rules',()=>{
 const css=fs.readFileSync(new URL('../app/match-ui-guard.css',import.meta.url),'utf8');
 assert.match(css,/Canonical match-result seal/);
 assert.match(css,/\.screen-game \.hs-board > \.match-result-overlay/);
 assert.match(css,/position:\s*fixed\s*!important/);
 assert.match(css,/place-items:\s*center\s*!important/);
 assert.match(css,/grid-template-areas:[\s\S]*"art eyebrow"[\s\S]*"art actions"/);
 assert.match(css,/@media \(max-width: 46rem\), \(max-height: 38rem\)/);
});
