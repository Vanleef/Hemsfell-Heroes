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

test("Accelerated cards remain legal priority responses",()=>{
  const state=makeState();
  state.players[1].hand=[{id:"fast-1",name:"Resposta Acelerada",type:"Feitiço",cost:1,tags:["Acelerado"],text:"",abilities:[]}];
  const legal=legalPriorityResponses(state,1);
  assert.equal(legal.length,1);
  assert.equal(legal[0].type,"playCard");
  assert.equal(legal[0].cardId,"fast-1");
});

test("AI response timer is keyed only to the authoritative pending priority window",async()=>{
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const marker=page.match(/useEffect\(\(\)=>\{const authoritativePending=game\?\.pendingResponse[\s\S]*?\},\[game\?\.pendingResponse\?\.actor,game\?\.pendingResponse\?\.responder,game\?\.pendingResponse\?\.passes,game\?\.pendingResponse\?\.action,mode,difficulty\]\);/)?.[0]||"";
  assert.ok(marker);
  assert.match(marker,/currentGameRef\.current/);
  assert.match(marker,/chooseAdvancedAIResponse/);
  assert.match(marker,/latestKey!==pendingKey/);
  assert.match(marker,/command\.type==="passPriority"/);
  assert.match(marker,/runRulesCommand\(command,1\)/);
  assert.match(marker,/watchdog/);
  assert.doesNotMatch(marker,/\[game,responseWindow,mode,difficulty\]/);
});
