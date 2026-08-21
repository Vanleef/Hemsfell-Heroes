import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../app/rules-engine/ai-system/", import.meta.url);
const files = ["types.ts", "config.ts", "personality.ts", "belief.ts", "evaluator.ts", "combat.ts", "risk.ts", "mcts.ts", "controller.ts", "driver.ts", "runtime.ts", "telemetry.ts", "calibration.ts", "calibration-runner.ts", "selfplay.ts", "index.ts"];

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
  assert.match(source, /Easy:[\s\S]*?intentionalErrorRate:\s*0\.28/);
  assert.match(source, /Normal:[\s\S]*?intentionalErrorRate:\s*0\.1/);
  assert.match(source, /Hard:[\s\S]*?intentionalErrorRate:\s*0\.035/);
});

test("all five playstyle personalities are represented and smoothly adaptive", async () => {
  const source = await read("personality.ts");
  for (const style of ["Aggro", "Midrange", "Control", "Tempo", "ComboValue"]) assert.match(source, new RegExp(`\\b${style}:`));
  assert.match(source, /adaptivePersonality/);
  assert.match(source, /blendPersonality/);
  assert.match(source, /OpponentMemory/);
});

test("MCTS implements UCT, determinization, rollouts, risk priors and browser yielding", async () => {
  const source = await read("mcts.ts");
  assert.match(source, /selectUCT/);
  assert.match(source, /belief\.determinize/);
  assert.match(source, /rollout/);
  assert.match(source, /yieldToBrowser/);
  assert.match(source, /selectedMeanValue/);
  assert.match(source, /risk\.actionBias/);
  assert.match(source, /priorBias/);
});

test("belief model uses archetype priors, draw likelihood and diagnostics", async () => {
  const source = await read("belief.ts");
  assert.match(source, /class BeliefModel/);
  assert.match(source, /HERO_PRIORS/);
  assert.match(source, /applyDrawLikelihood/);
  assert.match(source, /resampleIfDegenerate/);
  assert.match(source, /determinize/);
  assert.match(source, /entropy/);
  assert.match(source, /diagnostics/);
  assert.match(source, /remainingPool/);
});

test("controller exposes mulligan, lethal, combat, memory and evaluation diagnostics", async () => {
  const source = await read("controller.ts");
  assert.match(source, /shouldKeepMulligan/);
  assert.match(source, /planAttacks/);
  assert.match(source, /chooseBlock/);
  assert.match(source, /debugEvaluation/);
  assert.match(source, /hemsfell:ai-thinking/);
  assert.match(source, /hemsfell:ai-debug/);
  assert.match(source, /chooseAIHeroAbility/);
  assert.match(source, /findRobustForcedLethal/);
  assert.match(source, /opponentMemory/);
  assert.match(source, /riskManager:\s*this\.risk/);
  assert.doesNotMatch(source, /applyRiskPolicy/);
});

test("lower difficulties keep human-like errors without catastrophic tactical punts", async () => {
  const controller = await read("controller.ts");
  const risk = await read("risk.ts");
  assert.match(controller, /plausibleMistakes/);
  assert.match(controller, /recklessOverextension/);
  assert.match(controller, /plausibilityScore/);
  assert.match(controller, /ownLife <= 8 \? 2\.75 : 5\.5/);
  assert.match(risk, /stabilizes/);
  assert.match(risk, /pureGreed/);
  assert.match(risk, /ownLife <= 8/);
});

test("calibration corpus contains 48 fixed scenarios across strategic categories", async () => {
  const source = await read("calibration.ts");
  for (const category of ["lethal", "trade", "overextension", "hold-response", "development", "low-life", "resources", "hand-cap"]) assert.match(source, new RegExp(`"${category}"`));
  assert.match(source, /CALIBRATION_CORPUS\.length !== 48/);
  assert.match(source, /calibrationAdapter/);
  const runner = await read("calibration-runner.ts");
  assert.match(runner, /accuracyByDifficulty/);
  assert.match(runner, /accuracyByCategory/);
  assert.match(runner, /AITelemetryCollector/);
});

test("self-play and telemetry record performance and strategic diagnostics", async () => {
  const telemetry = await read("telemetry.ts");
  const selfplay = await read("selfplay.ts");
  for (const metric of ["beliefEntropy", "iterationsPerSecond", "energyUnused", "reserveUnused", "responseCardsHeld", "overkill"]) assert.match(telemetry, new RegExp(metric));
  assert.match(telemetry, /toCSV/);
  assert.match(selfplay, /runSelfPlayBatch/);
  assert.match(selfplay, /AIController/);
  assert.match(selfplay, /recordMatch/);
});

test("runtime bridge covers main decisions, combat, responses and mulligan", async () => {
  const source = await read("runtime.ts");
  for (const symbol of ["chooseAdvancedAIAction", "chooseAdvancedAIDecision", "planAdvancedAIAttacks", "chooseAdvancedAIBlock", "chooseAdvancedAIResponse", "shouldKeepAdvancedMulligan"]) {
    assert.match(source, new RegExp(`export (?:async )?function ${symbol}`));
  }
  assert.match(source, /data-hemsfell-ai-thinking/);
  assert.match(source, /chooseAdvancedAIAction\(state, owner, difficulty\)/);
  assert.doesNotMatch(source, /new Evaluator\(\)/);
});

test("game client routes rules and bot decisions through authoritative advanced runtime", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /canExecuteCard\(snapshot\)/);
  assert.match(page, /roomAction\("command"/);
  assert.match(page, /executeCommand\(current,\{\.\.\.command,owner\},\{priority:true\}\)/);
  assert.match(page, /role!=="attachment"/);
  assert.match(page, /dragged!\.type!=="Artefato"\|\|!!creature/);
  assert.match(page, /rules-engine\/ai-system\/runtime/);
  assert.match(page, /chooseAdvancedAIAction/);
  assert.match(page, /chooseAdvancedAIDecision/);
  assert.match(page, /chooseAdvancedAIResponse/);
  assert.match(page, /chooseAdvancedAIBlock/);
  assert.match(page, /planAdvancedAIAttacks/);
  assert.match(page, /resetAdvancedAI\(1\)/);
  assert.match(page, /legalPriorityResponses/);
  assert.match(page, /hasUsablePriorityResponse/);
  assert.doesNotMatch(page, /\bbuildAIActionCandidates\b/);
  assert.doesNotMatch(page, /\bchooseAIHeroAbility\b/);
  assert.doesNotMatch(page, /\bchooseAIDecision\b/);
});
