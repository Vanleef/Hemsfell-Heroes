import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { legalPriorityResponses } from "../app/rules-engine/priority.mjs";

const makeState=()=>({
  active:1,phase:"principal",round:3,
  pendingResponse:{responder:1,actor:0,action:"Teste",passes:0},
  players:[
    {energy:0,reserve:0,hand:[],board:[],support:[],terrain:null,abilityUses:{}},
    {energy:3,reserve:3,hand:[],board:[{uid:"u1",id:"u1",name:"Ativavel",type:"Criatura",exhausted:false,summoning:false,enteredRound:1,abilities:[{id:"a1",trigger:"activated",costs:[],effects:[]}]}],support:[],terrain:null,abilityUses:{}}
  ]
});

test("priority response list never exposes activated permanent abilities",()=>{
  const state=makeState();
  assert.deepEqual(legalPriorityResponses(state,1),[]);
});

test("AI response timer is keyed only to the pending priority window",async()=>{
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const marker=page.match(/useEffect\(\(\)=>\{if\(responseWindow\?\.responder!==1[\s\S]*?\},\[responseWindow\?\.actor,responseWindow\?\.responder,responseWindow\?\.passes,responseWindow\?\.action,mode,difficulty\]\);/)?.[0]||"";
  assert.ok(marker);
  assert.match(marker,/currentGameRef\.current/);
  assert.doesNotMatch(marker,/\[game,responseWindow,mode,difficulty\]/);
  assert.doesNotMatch(marker,/command\.type==="activate"/);
});
