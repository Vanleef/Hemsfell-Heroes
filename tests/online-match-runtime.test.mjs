import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [runtime, layout, screenGate, gate, css, machine, clock, page, packageJson] = await Promise.all([
  readFile(new URL("../app/application/online/online-match-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/runtime/screen-runtime-gate.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/runtime/match-runtime-gate.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/online-match-runtime.css", import.meta.url), "utf8"),
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

test("Online HUD is screen-gated after the canonical match runtime instead of mounted globally", () => {
  assert.match(layout, /<ScreenRuntimeGate \/>/);
  assert.match(screenGate, /import\("\.\.\/\.\.\/application\/online\/online-match-runtime"\)/);
  assert.match(screenGate, /screen === "game"[\s\S]*?<MatchRuntimeGate \/>[\s\S]*?<OnlineMatchRuntime \/>/);
  assert.match(gate, /<MatchUiRuntime \/>/);
  assert.doesNotMatch(layout, /<OnlineMatchRuntime \/>/);
});

test("Online HUD orients only its tiny public subset and never clones the full game snapshot", () => {
  assert.match(runtime, /function orientHudGame\(game: OnlineGame, isHost: boolean\)/);
  assert.match(runtime, /active: game\.active === 0 \? 1 : 0/);
  assert.match(runtime, /priority: game\.priority \? \{ \.\.\.game\.priority, owner: flipOwner/);
  assert.match(runtime, /stack: game\.stack\?\.map/);
  assert.match(runtime, /combatAction: game\.combatAction \?/);
  assert.doesNotMatch(runtime, /structuredClone/);
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
  assert.match(page, /type:"declareAttack",attackerId:attackerUid/);
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

test("Online HUD reuses the board snapshot instead of opening a second polling loop", () => {
  assert.match(runtime, /const ONLINE_ROOM_SNAPSHOT_EVENT = "hemsfell:online-room-snapshot"/);
  assert.match(runtime, /window\.addEventListener\(ONLINE_ROOM_SNAPSHOT_EVENT, consume\)/);
  assert.match(page, /announceOnlineSnapshot/);
  assert.match(page, /window\.setTimeout\(fn,nextDelay\(\)\)/);
  assert.doesNotMatch(runtime, /fetch\(`\/api\/rooms/);
  assert.doesNotMatch(runtime, /POLL_MS|DISCOVERY_MS|setInterval|setTimeout\(poll/);
});

test("unchanged online HUD snapshots do not trigger React work", () => {
  assert.match(runtime, /const signature = hudSignature\(snapshot\.status, snapshot\.game \|\| null, nextSession\.isHost\)/);
  assert.match(runtime, /if \(current\?\.signature === signature && current\.session\.id === nextSession\.id && current\.session\.isHost === nextSession\.isHost\) return current/);
});

test("confirmed Online snapshots use one canonical presentation owner for milestones too", () => {
  assert.match(page, /const queueOnlineSnapshotFx=\(_previous:Game\|null,_next:Game\)=>\{\};/);
  assert.match(page, /applyRoomSnapshot=[\s\S]*?queueOnlineSnapshotFx\(previous,next\)/);
  assert.match(page, /pollRoom[\s\S]*?queueOnlineSnapshotFx\(previous,oriented\)/);
  assert.match(page, /announceOnlineSnapshot/);
});

test("strict Online typecheck remains in every validation path", () => {
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts["typecheck:online"], "tsc -p tsconfig.online.json --noEmit");
  assert.match(pkg.scripts["vercel-build"], /npm run test:rules/);
  assert.match(pkg.scripts["test:rules"], /typecheck:online/);
});

test("remaining Online HUD CSS is responsive and contains no fixed board coordinates", () => {
  assert.match(css, /online-priority-hud/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:left|top):\s*\d+px/m);
});
