import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import cards from '../app/data/catalog/cards.generated.json' with { type: 'json' };
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
 const result=fs.readFileSync(new URL('../app/presentation/match/match-result-overlay.tsx',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(result,/className="match-result-portrait"/);
 assert.match(result,/<RemoteCardArt page=\{heroPage\}/);
 assert.match(result,/<h2 id="match-result-winner-name">\{heroName\}<\/h2>/);
 assert.match(result,/>Vencedor<\/strong>/);
 assert.match(result,/Voltar ao menu/);
 assert.match(result,/Jogar novamente/);
 assert.match(page,/mode==="bot"&&game\?\.winner===1\?"\(IA\) "/);
});

test('match result has responsive dedicated styling in the canonical match stylesheet',()=>{
 const css=fs.readFileSync(new URL('../app/presentation/styles/match-ui.css',import.meta.url),'utf8');
 assert.match(css,/\/\* === MATCH RESULT === \*\//);
 assert.match(css,/\.match-result-card\{/);
 assert.match(css,/\.match-result-portrait\{/);
 assert.match(css,/\.match-result-actions\{/);
 assert.match(css,/@media \(max-width:34rem\),\(max-height:42rem\)/);
});

test('match result overlay remains centered and self-contained above board layout rules',()=>{
 const css=fs.readFileSync(new URL('../app/presentation/styles/match-ui-guard.css',import.meta.url),'utf8');
 assert.match(css,/Canonical match-result seal/);
 assert.match(css,/\.screen-game \.hs-board > \.match-result-overlay/);
 assert.match(css,/position:\s*fixed\s*!important/);
 assert.match(css,/place-items:\s*center\s*!important/);
 assert.match(css,/@media \(max-width: 46rem\), \(max-height: 38rem\)/);
});
