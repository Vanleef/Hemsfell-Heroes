import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("human priority UI exposes hero abilities and assisted mode does not auto-pass them",async()=>{
 const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(page,/heroPriorityResponses/);
 assert.match(page,/hasUsablePriorityResponse/);
 assert.match(page,/onHeroAbility=\{chooseHeroResponse\}/);
 assert.match(page,/Habilidade ativa do Herói/);
 assert.doesNotMatch(page,/priorityControl==="full-control"\|\|hasUsableAcceleratedResponse\(game,0\)/);
});
