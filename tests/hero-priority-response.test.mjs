import assert from "node:assert/strict";
import test from "node:test";
import { legalPriorityResponses, chooseAIResponse } from "../app/rules-engine/priority.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const unit=(uid="ally-1")=>({id:uid,uid,name:"Aliado",type:"Criatura",subtypes:[],tags:[],abilities:[],cost:1,atk:1,hp:1,damage:0,slot:0,exhausted:false,summoning:false,defenseUses:0,markers:0});
const player=(heroId, level, extra={})=>({heroId,level,life:20,energy:3,reserve:3,hand:[],deck:[],grave:[],obscuro:[],board:[],support:[],terrain:null,abilityUses:{},markers:{clue:10},heroXP:10,...extra});
const baseState=()=>({active:0,phase:"combate",round:4,pendingAction:{type:"attack",owner:0},pendingResponse:{responder:1,actor:0,action:"ataque",passes:0},players:[player("saymon",3),player("saymon",3)]});

test("activated hero abilities are legal priority responses even off turn",()=>{
  const state=baseState();
  const legal=legalPriorityResponses(state,1);
  assert.ok(legal.some(command=>command.type==="activateHero"&&command.abilityId==="saymon-level-1"));
  assert.equal(chooseAIResponse(state,1,()=>0).type,"activateHero");
});

test("hero priority response is stacked and cannot be offered twice before resolution",()=>{
  const state=baseState();
  const command=legalPriorityResponses(state,1).find(item=>item.type==="activateHero"&&item.abilityId==="saymon-level-1");
  const stacked=executeCommand(state,command,{priority:true}).state;
  assert.equal(stacked.priorityStack.at(-1).command.type,"activateHero");
  assert.equal(stacked.pendingResponse.responder,0);
  const pretendTurnBack={...stacked,pendingResponse:{...stacked.pendingResponse,responder:1}};
  assert.ok(!legalPriorityResponses(pretendTurnBack,1).some(item=>item.type==="activateHero"&&item.abilityId==="saymon-level-1"));
});

test("hero response reaches its target decision after both players pass",()=>{
  let state=baseState();
  const command=legalPriorityResponses(state,1).find(item=>item.type==="activateHero"&&item.abilityId==="saymon-level-1");
  state=executeCommand(state,command,{priority:true}).state;
  state=executeCommand(state,{type:"passPriority",owner:0},{priority:true}).state;
  assert.equal(state.pendingResponse.responder,1);
  state=executeCommand(state,{type:"passPriority",owner:1},{priority:true}).state;
  assert.equal(state.pendingDecision?.owner,1);
  assert.equal(state.pendingDecision?.kind,"activation-targets");
});

test("Ngoro hero responses respect clue costs and target legality before AI can choose them",()=>{
  const state={...baseState(),players:[player("saymon",3),player("ngoro",3,{markers:{clue:1},heroXP:1,board:[unit()]})]};
  assert.equal(legalPriorityResponses(state,1).some(command=>command.type==="activateHero"),false);
  state.players[1].markers={clue:3};
  state.players[1].heroXP=3;
  const legal=legalPriorityResponses(state,1);
  assert.ok(legal.some(command=>command.type==="activateHero"&&command.abilityId==="ngoro-level-2"));
  assert.ok(legal.some(command=>command.type==="activateHero"&&command.abilityId==="ngoro-level-3"));
  state.players[1].board=[];
  assert.ok(!legalPriorityResponses(state,1).some(command=>command.type==="activateHero"&&command.abilityId==="ngoro-level-3"));
});
