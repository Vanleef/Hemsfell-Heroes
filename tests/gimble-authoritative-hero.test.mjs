import assert from "node:assert/strict";
import test from "node:test";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { legalPriorityResponses } from "../app/rules-engine/priority.mjs";

const dragon=(exhausted=true)=>({id:"dragon",uid:"dragon-1",name:"Dragão Teste",type:"Criatura",subtypes:["Dragão"],tags:[],abilities:[],cost:2,atk:2,hp:2,damage:0,slot:0,exhausted,summoning:false,defenseUses:0,markers:0});
const player=(heroId="gimble",level=2,board=[])=>({heroId,level,life:30,energy:3,reserve:3,hand:[],deck:[],grave:[],obscuro:[],support:[],terrain:null,board,abilityUses:{},markers:0,heroXP:0});
const state=(board=[dragon(true)])=>({active:0,phase:"principal",round:5,players:[player("gimble",2,board),player("saymon",1,[])]});

test("Gimble II is resolved by authoritative activateHero and readies an exhausted Dragon",()=>{
 const before=state();
 const after=executeCommand(before,{type:"activateHero",owner:0,abilityId:"gimble-level-2",targetIds:["dragon-1"]},{priority:true}).state;
 assert.equal(after.players[0].board[0].exhausted,false);
 assert.equal(after.players[0].abilityUses["gimble-hero-0:gimble-level-2"],1);
});

test("Gimble II enters priority off-turn only when an exhausted allied Dragon exists",()=>{
 const withDragon=state(); withDragon.active=1; withDragon.phase="combate"; withDragon.pendingAction={type:"attack",owner:1}; withDragon.pendingResponse={responder:0,actor:1,action:"ataque",passes:0};
 assert.ok(legalPriorityResponses(withDragon,0).some(c=>c.type==="activateHero"&&c.abilityId==="gimble-level-2"));
 const withoutTarget=structuredClone(withDragon); withoutTarget.players[0].board[0].exhausted=false;
 assert.ok(!legalPriorityResponses(withoutTarget,0).some(c=>c.type==="activateHero"&&c.abilityId==="gimble-level-2"));
});

test("Gimble II cannot be used twice in the same turn",()=>{
 const first=executeCommand(state(),{type:"activateHero",owner:0,abilityId:"gimble-level-2",targetIds:["dragon-1"]},{priority:true}).state;
 first.players[0].board[0].exhausted=true;
 assert.throws(()=>executeCommand(first,{type:"activateHero",owner:0,abilityId:"gimble-level-2",targetIds:["dragon-1"]},{priority:true}),/ability-not-available/);
});
