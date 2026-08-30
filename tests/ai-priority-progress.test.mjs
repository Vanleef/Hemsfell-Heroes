import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { chooseAIResponse } from "../app/rules-engine/priority.mjs";

test("AI passes when priority returns to the actor after the first pass",()=>{
  const state={pendingResponse:{responder:1,actor:1,passes:1,action:"resposta da IA"},players:[{hand:[],board:[],support:[]},{hand:[{id:"fast",name:"Fast",type:"Feitiço",cost:0,tags:["Acelerado"],text:"Acelerado",abilities:[]}],board:[],support:[],heroId:"saymon",level:3,life:30,energy:10,reserve:3,abilityUses:{}}],active:1,round:3};
  assert.deepEqual(chooseAIResponse(state,1,()=>0),{type:"passPriority",owner:1,auto:true});
});

test("bot priority effect contains a stale-window watchdog",()=>{
  const source=fs.readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(source,/Last-resort progress guard/);
  assert.match(source,/setTimeout\(\(\)=>\{const current=currentGameRef\.current,pending=current\?\.pendingResponse/);
});

test("stack indicator is slightly below geometric center",()=>{
  const css=fs.readFileSync(new URL("../app/presentation/styles/base/ui-overrides.css",import.meta.url),"utf8");
  assert.match(css,/priority-stack-indicator\{[^}]*left:50%!important;top:var\(--hh-stack-sector-y,52\.5cqh\)!important/s);
});
