import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [runtime, layout, css, machine, clock, page, packageJson] = await Promise.all([
  readFile(new URL("../app/online-match-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/online-match-runtime.css", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/online-clock.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

test("staged Online runtime is syntactically valid TypeScript", () => {
  const result = ts.transpileModule(runtime, {
    fileName: "online-match-runtime.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});

test("root layout mounts the Online HUD after the canonical match UI runtime", () => {
  assert.match(layout, /import OnlineMatchRuntime from "\.\/online-match-runtime"/);
  assert.match(layout, /import "\.\/online-match-runtime\.css"/);
  assert.match(layout, /<MatchUiRuntime \/>[\s\S]*?<OnlineMatchRuntime \/>/);
});

test("Online runtime consumes canonical guest orientation instead of duplicating mirror logic", () => {
  assert.match(runtime, /orientOnlineGameForRole/);
  assert.match(runtime, /currentSession\.isHost \? "host" : "guest"/);
  assert.doesNotMatch(runtime, /mirrored\.players\s*=/);
});

test("grouped combat declaration UI and commands are gone", () => {
  assert.doesNotMatch(runtime, /Escolha todos os atacantes/);
  assert.doesNotMatch(runtime, /DECLARAÇÃO EM GRUPO/);
  assert.doesNotMatch(runtime, /declareAttackers/);
  assert.doesNotMatch(runtime, /declareBlockers/);
  assert.doesNotMatch(runtime, /AttackerDeclaration/);
  assert.doesNotMatch(runtime, /BlockerDeclaration/);
  assert.doesNotMatch(runtime, /online-combat-blocker/);
  assert.doesNotMatch(machine, /"declareAttackers"\s*,/);
  assert.doesNotMatch(machine, /"declareBlockers"\s*,/);
});

test("canonical board UI keeps per-creature attacker, blocker and no-block actions", () => {
  assert.match(page, /const chooseAttacker=\(uid:string\)=>/);
  assert.match(page, /type:"declareAttack",attackerId:action\.attackerUid/);
  assert.match(page, /type:"selectDefender",attackerId:combatAction\.attackerUid,defenderId:uid,targetHero:false/);
  assert.match(page, /type:"selectDefender",attackerId:combatAction\.attackerUid,targetHero:true/);
  assert.match(page, /combat-attack-ready/);
  assert.match(page, /const finishCombat=\(\)=>/);
  assert.match(page, /mandatoryIndomitableAttacker/);
});

test("canonical priority HUD reports the current single attack without replacing board interaction", () => {
  assert.match(runtime, /game\.combatAction/);
  assert.match(runtime, /Defenda-se de/);
  assert.match(runtime, /Aguardando o oponente escolher o bloqueio/);
  assert.match(runtime, /Escolha um ataque ou encerre o combate/);
  assert.match(runtime, /ONLINE · PRIORIDADE/);
  assert.match(runtime, /game\.stack/);
});

test("unitary blocker choice owns a response deadline without consuming attacker action time", () => {
  assert.match(clock, /const blockerOwnsInput = \(game\) => interactionState\(game\) === OnlineInteractionState\.AWAITING_BLOCKER/);
  assert.match(clock, /after\.combatAction\.deadline = now \+ settings\.responseSeconds \* 1000/);
  assert.match(machine, /combatAction\?\.stage === "choosing"/);
  assert.match(machine, /type: "selectDefender", owner, targetHero: true, auto: true/);
});

test("final impact command is server-bound to the blocker selection already stored in combatAction", () => {
  assert.match(machine, /AUTHORITATIVE_COMMANDS[\s\S]*"attack"/);
  assert.match(machine, /combat\.stage !== "charging"/);
  assert.match(machine, /combat\.attackerUid !== command\.attackerId/);
  assert.match(machine, /combat state mismatch/);
  assert.match(machine, /command\.skipPriority = true/);
});

test("room discovery still prefers URL room and recovers from stale finished sessions", () => {
  assert.match(runtime, /const DISCOVERY_MS = 3_500/);
  assert.match(runtime, /statusRank: Record<string, number> = \{ started: 3, mulligan: 2, finished: 1 \}/);
  assert.match(runtime, /found\.session\.id === preferred/);
  assert.match(runtime, /currentRoom\?\.status === "finished"/);
  assert.match(runtime, /game\.winner != null/);
});

test("strict Online typecheck remains in every validation path", () => {
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts["typecheck:online"], "tsc -p tsconfig.online.json --noEmit");
  assert.match(pkg.scripts["vercel-build"], /typecheck:online/);
  assert.match(pkg.scripts["test:rules"], /typecheck:online/);
});

test("remaining Online HUD CSS is responsive and contains no fixed board coordinates", () => {
  assert.match(css, /online-priority-hud/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:left|top):\s*\d+px/m);
});
