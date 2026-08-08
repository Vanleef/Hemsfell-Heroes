import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/lab.css",import.meta.url),"utf8");
const roomApi=await readFile(new URL("../app/api/rooms/[id]/route.ts",import.meta.url),"utf8");
const hosting=JSON.parse(await readFile(new URL("../.openai/hosting.json",import.meta.url),"utf8"));

test("rulebook resource and turn invariants stay automated",()=>{
 assert.match(page,/life:30/);
 assert.match(page,/Math\.min\(10,p\.maxEnergy\+1\)/);
 assert.match(page,/Math\.min\(3,p\.reserve\+p\.energy\)/);
 assert.match(page,/levelUpsThisTurn>0/);
 assert.match(page,/iniciou a Manutenção com o Deck vazio e perdeu/);
});

test("combat excludes turned defenders and preserves simultaneous resolution",()=>{
 assert.match(page,/defenderPlayer\.board\.filter\(defender=>!defender\.exhausted/);
 assert.match(page,/liveDefender\.damage\+=attackDamage/);
 assert.match(page,/liveAttacker\.damage\+=counterDamage/);
});

test("graveyards expose their complete public card list",()=>{
 assert.match(page,/title:`Cemitério de/);
 assert.match(page,/title:"Seu Cemitério",cards:me\.grave/);
 assert.match(page,/className="extra-card-grid"/);
});

test("targeted effects are serialized and visually identify both cards",()=>{
 assert.match(page,/showTargetEffect\("EFEITO DE DANO",target\)/);
 assert.match(page,/fx\.card\?\.name\|\|"Efeito"} afeta/);
 assert.match(css,/\.visual-effect\.fx-targeted/);
});

test("multiplayer uses durable shared state and authenticated room participants",()=>{
 assert.equal(hosting.d1,"DB");
 assert.match(roomApi,/action === "sync"/);
 assert.match(roomApi,/invalid participant/);
 assert.match(page,/mirrorOnlineGame/);
 assert.match(page,/setInterval\(fn,850\)/);
});
