import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getExplicitCardRule } from "../app/rules-engine/card-rules.mjs";

test("Bafo de Fumaça excludes itself on enter and repeat", () => {
  const rule=getExplicitCardRule("p34");
  assert.equal(rule.length,2);
  for(const ability of rule){
    const effect=ability.effects.find(item=>item.type==="damageAndMarkRepeat");
    assert.ok(effect);
    assert.equal(effect.excludeSource,true);
  }
});

test("target plumbing propagates and validates source exclusion", () => {
  const engine=readFileSync(new URL("../app/rules-engine/engine-base.mjs",import.meta.url),"utf8");
  const effects=readFileSync(new URL("../app/rules-engine/effects.mjs",import.meta.url),"utf8");
  assert.match(engine,/function abilityTargetSteps\(ability, sourceId = null\)/);
  assert.match(engine,/effect\.excludeSource && sourceId \? \[sourceId\] : \[\]/);
  assert.match(engine,/abilityTargetSteps\(ability, unit\.uid \|\| unit\.id\)/);
  assert.match(engine,/abilityTargetSteps\(trigger\.ability, trigger\.source\.uid \|\| trigger\.source\.id\)/);
  assert.match(effects,/effect\.excludeSource && \(target\.uid \|\| target\.id\) === context\.sourceId/);
});
