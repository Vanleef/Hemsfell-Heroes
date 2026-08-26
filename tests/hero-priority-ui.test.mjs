import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("human priority UI exposes hero abilities and assisted mode does not auto-pass them after extraction",async()=>{
 const [page,priorityUi,policy]=await Promise.all([
  readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/match/priority-ui.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/match/priority-control-policy.mjs",import.meta.url),"utf8"),
 ]);
 assert.match(page,/heroPriorityResponses/);
 assert.match(page,/hasUsablePriorityResponse/);
 assert.match(page,/onHeroAbility=\{chooseHeroResponse\}/);
 assert.match(priorityUi,/Habilidade ativa do Herói/);
 assert.match(policy,/mode === PRIORITY_CONTROL_ASSISTED/);
 assert.match(policy,/&& !hasUsableResponse/);
 assert.doesNotMatch(page,/priorityControl==="full-control"\|\|hasUsableAcceleratedResponse\(game,0\)/);
});
