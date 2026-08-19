import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [runtime, layout, css, machine, clock, store, packageJson] = await Promise.all([
  readFile(new URL("../app/online-match-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/online-match-runtime.css", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/online-clock.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

test("staged Online runtime and room store are syntactically valid TypeScript", () => {
  for (const [name, source, jsx] of [["runtime", runtime, true], ["store", store, false]]) {
    const result = ts.transpileModule(source, {
      fileName: jsx ? `${name}.tsx` : `${name}.ts`,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), [], `${name} must transpile without syntax errors`);
  }
});

test("root layout mounts the staged Online runtime after the canonical match UI runtime", () => {
  assert.match(layout, /import OnlineMatchRuntime from "\.\/online-match-runtime"/);
  assert.match(layout, /import "\.\/online-match-runtime\.css"/);
  assert.match(layout, /<MatchUiRuntime \/>[\s\S]*?<OnlineMatchRuntime \/>/);
});

test("Online runtime consumes the pure canonical guest orientation instead of duplicating mirror logic", () => {
  assert.match(runtime, /orientOnlineGameForRole/);
  assert.match(runtime, /currentSession\.isHost \? "host" : "guest"/);
  assert.doesNotMatch(runtime, /mirrored\.players\s*=/);
});

test("grouped combat client consumes viewer-scoped authoritative choices and emits only grouped commands", () => {
  assert.match(runtime, /combat\.interaction\?\.attackerOptions/);
  assert.match(runtime, /combat\.interaction\?\.blockerOptions/);
  assert.match(runtime, /authoritativeCapacities/);
  assert.match(store, /onlineCombatInteractionView\(game, viewer\)/);
  assert.match(runtime, /type: "declareAttackers", attackerIds: orderedAttackIds/);
  assert.match(runtime, /type: "declareBlockers", assignments/);
  assert.match(runtime, /combat\?\.stage === "declare-attackers"/);
  assert.match(runtime, /combat\?\.stage === "declare-blockers"/);
});

test("grouped combat overlay blocks the legacy single-lane board while a declaration is pending", () => {
  assert.match(runtime, /online-combat-blocker/);
  assert.match(css, /\.online-combat-blocker\{[\s\S]*?position:fixed[\s\S]*?inset:0[\s\S]*?z-index:9900/);
  assert.match(machine, /grouped combat declaration requires authoritative command/);
});

test("canonical priority HUD renders owner, timing window and readable stack frames", () => {
  assert.match(runtime, /priority\?\.model !== "online-v2"/);
  assert.match(runtime, /game\.stack/);
  assert.match(runtime, /ONLINE · PRIORIDADE/);
  assert.match(runtime, /frame\.controller === 0 \? "VOCÊ"/);
  assert.match(runtime, /WINDOW_NAMES/);
});

test("blocker choice owns a response-sized deadline without consuming the attacker action clock", () => {
  assert.match(clock, /declaringBlockers/);
  assert.match(clock, /after\.onlineCombat\.deadline = now \+ settings\.responseSeconds \* 1000/);
  assert.match(machine, /onlineCombat\?\.stage === "declare-blockers"/);
  assert.match(machine, /type: "declareBlockers", owner, assignments: \[\], auto: true/);
  assert.match(runtime, /combat\.deadline/);
  assert.match(runtime, /Seu relógio de ação permanece pausado/);
});

test("revision-safe client retry uses the server revision instead of replaying stale local state", () => {
  assert.match(runtime, /let baseRevision = roomRef\.current\?\.revision/);
  assert.match(runtime, /response\.status === 409[\s\S]*?baseRevision = result\.revision/);
  assert.match(runtime, /busyRef\.current/);
});

test("room discovery prefers the URL room and can recover from stale finished sessions", () => {
  assert.match(runtime, /const DISCOVERY_MS = 3_500/);
  assert.match(runtime, /statusRank: Record<string, number> = \{ started: 3, mulligan: 2, finished: 1 \}/);
  assert.match(runtime, /found\.session\.id === preferred/);
  assert.match(runtime, /currentRoom\?\.status === "finished"/);
  assert.match(runtime, /game\.winner != null/);
});

test("strict Online client typecheck is part of every validation path", () => {
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts["typecheck:online"], "tsc -p tsconfig.online.json --noEmit");
  assert.match(pkg.scripts["vercel-build"], /typecheck:online/);
  assert.match(pkg.scripts["test:rules"], /typecheck:online/);
});

test("grouped combat UI remains responsive instead of relying on fixed board coordinates", () => {
  assert.match(css, /width:min\(72rem,96vw\)/);
  assert.match(css, /grid-template-columns:repeat\(auto-fit/);
  assert.match(css, /@media\(max-width:48rem\)/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:left|top):\s*\d+px/m);
});
