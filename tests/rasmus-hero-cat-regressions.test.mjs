import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import cards from '../app/cards.generated.json' with { type: 'json' };
import { compileCard } from '../app/rules-engine/compiler.mjs';
import { executeCommand } from '../app/rules-engine/engine.mjs';

const catalog=cards.map(compileCard);
const printed=(page,overrides={})=>({...compileCard(cards.find(card=>card.page===page)),...overrides});
const state=()=>({active:0,phase:'principal',round:1,cardCatalog:catalog,players:[0,1].map(owner=>({heroId:owner?'gimble':'rasmus',level:1,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:10,maxEnergy:10,reserve:0,deck:[],extraDeck:[],hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0,spellsPlayed:0}))});
const unit=(page,uid,slot=0,overrides={})=>({...printed(page),uid,slot,enteredRound:0,damage:0,exhausted:false,summoning:false,attackedThisTurn:false,defenseUses:0,modifiers:[],markers:0,...overrides});

test('Rasmus evolution counts Cats across both players fields in engine and UI',()=>{
 const engine=fs.readFileSync(new URL('../app/rules-engine/engine-base.mjs',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(engine,/catsInAllFieldsAtLeast[^\n]+flatMap\(\(candidate\) => permanentUnits\(candidate\)\)/);
 assert.match(page,/heroEvolutionProgress=\(player:Player,allPlayers:Player\[\]=\[player\]\)/);
 assert.match(page,/somando os campos dos dois jogadores/);
});

test('Gato Cachorro uses names for separate Gato attack and Cachorro health bonuses',()=>{
 const rules=fs.readFileSync(new URL('../app/rules-engine/card-rules.mjs',import.meta.url),'utf8');
 const engine=fs.readFileSync(new URL('../app/rules-engine/engine-base.mjs',import.meta.url),'utf8');
 assert.match(rules,/p245:[^\n]+attackNameIncludes: "Gato", healthNameIncludes: "Cachorro"/);
 assert.match(engine,/dynamicStats\?\.attackNameIncludes/);
 assert.match(engine,/dynamicStats\?\.healthNameIncludes/);
});

test('Gato Afeiçoado creates a symmetric connection',()=>{
 let g=state();
 g.players[0].hand=[{...printed(221),id:'affectionate-card',cost:0}];
 g.players[0].board=[unit(214,'partner',1)];
 g=executeCommand(g,{type:'playCard',owner:0,cardId:'affectionate-card',slot:0,targetIds:['partner'],skipPriority:true}).state;
 const linked=g.players[0].board.find(card=>card.page===221);
 assert.equal(linked.linkedDestroyId,'partner');
 assert.deepEqual(new Set(linked.linkedCreatures),new Set([linked.uid,'partner']));
});

test('Café Descafeinado applies real Sufocado state',()=>{
 let g=state();
 g.players[0].hand=[{...printed(225),id:'decaf',cost:0}];
 g.players[1].board=[unit(214,'victim',0,{abilities:[{id:'dummy',trigger:'activated',effects:[]}],tags:['Voar']})];
 g=executeCommand(g,{type:'playCard',owner:0,cardId:'decaf',targetIds:['victim'],skipPriority:true}).state;
 assert.equal(g.players[1].board[0].suffocated,true);
 assert.equal(g.players[1].board[0].suffocatedUntilTurnEnd,true);
});

test('Rasmus level 1 creates Café Especial on the tenth Café spell event',()=>{
 let g=state();
 g.players[0].extraDeck=[printed(231,{id:'special-image'})];
 for(let i=0;i<10;i++) g=executeCommand(g,{type:'emit',event:{type:'onSpellCast',owner:0,card:{name:`Café Teste ${i}`,type:'Feitiço'}}}).state;
 assert.equal(Number(g.players[0].markers?.coffee||0),0);
 assert.ok(g.players[0].hand.some(card=>card.page===231||card.name==='Café Especial'));
});

test('Café Especial keeps its four canonical choices',()=>{
 const special=printed(231);
 const choice=special.abilities.find(ability=>ability.trigger==='onPlay')?.effects?.find(effect=>effect.type==='controllerChoice');
 assert.equal(choice?.choices?.length,4);
 assert.equal(choice.choices[0][0].type,'createImagesAcrossFields');
 assert.equal(choice.choices[1][0].type,'heal');
 assert.equal(choice.choices[2][0].type,'draw');
 assert.equal(choice.choices[3][0].type,'levelHero');
});

test('Gato Multidimensional cannot be replaced by another played creature',()=>{
 const g=state();
 g.players[0].board=[unit(213,'multi-cat',2,{cannotBeDestroyedForSpace:true,generatedImage:true,imageCard:true})];
 g.players[0].hand=[{...printed(214),id:'new-cat',cost:0}];
 assert.throws(()=>executeCommand(g,{type:'playCard',owner:0,cardId:'new-cat',slot:2,skipPriority:true}),/protected-space-occupant/);
 assert.equal(g.players[0].board[0].uid,'multi-cat');
});

test('hero inspector uses one normal-flow structured guide for all heroes',()=>{
 const css=fs.readFileSync(new URL('../app/hero-inspector-fix.css',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(css,/hero-abilities-guide>div:last-child/);
 assert.match(css,/grid-template-columns:1fr!important/);
 assert.match(page,/showInspector\.hero&&deckByHeroPage\(showInspector\.page\)/);
});
