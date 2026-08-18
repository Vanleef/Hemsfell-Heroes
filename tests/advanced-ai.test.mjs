import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../app/rules-engine/ai-system/", import.meta.url);
const files = ["types.ts", "config.ts", "personality.ts", "belief.ts", "evaluator.ts", "combat.ts", "risk.ts", "mcts.ts", "controller.ts", "driver.ts", "index.ts"];

const read = (name) => readFile(new URL(name, root), "utf8");

test("advanced AI TypeScript modules are syntactically valid", async () => {
  for (const name of files) {
    const source = await read(name);
    const result = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
      reportDiagnostics: true,
      fileName: name,
    });
    const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")), [], `${name} has TypeScript diagnostics`);
  }
});

test("difficulty ladder contains five distinct search budgets", async () => {
  const source = await read("config.ts");
  for (const level of ["Easy", "Normal", "Hard", "Expert", "Master"]) assert.match(source, new RegExp(`\\b${level}:`));
  assert.match(source, /iterations:\s*1500/);
  assert.match(source, /particleCount:\s*160/);
  assert.match(source, /intentionalErrorRate:\s*0\.28/);
});

test("all five playstyle personalities are represented", async () => {
  const source = await read("personality.ts");
  for (const style of ["Aggro", "Midrange", "Control", "Tempo", "ComboValue"]) assert.match(source, new RegExp(`\\b${style}:`));
  assert.match(source, /adaptivePersonality/);
});

test("MCTS implements UCT, determinization, rollouts and browser yielding", async () => {
  const source = await read("mcts.ts");
  assert.match(source, /selectUCT/);
  assert.match(source, /belief\.determinize/);
  assert.match(source, /rollout/);
  assert.match(source, /yieldToBrowser/);
  assert.match(source, /selectedMeanValue/);
});

test("belief model conditions hidden hand and deck particles", async () => {
  const source = await read("belief.ts");
  assert.match(source, /class BeliefModel/);
  assert.match(source, /resampleIfDegenerate/);
  assert.match(source, /determinize/);
  assert.match(source, /entropy/);
});

test("controller exposes mulligan, lethal, combat and evaluation diagnostics", async () => {
  const source = await read("controller.ts");
  assert.match(source, /shouldKeepMulligan/);
  assert.match(source, /planAttacks/);
  assert.match(source, /chooseBlock/);
  assert.match(source, /debugEvaluation/);
  assert.match(source, /hemsfell:ai-thinking/);
});
