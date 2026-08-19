from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"pattern missing in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) Client: Online maintenance must be an authoritative command, not a legacy snapshot sync.
replace_once(
    "app/page.tsx",
    ''' const doMaintenance=(two=false)=>{\n  if(!game||game.active!==0||game.phase!=="manutencao"||game.winner!==null)return;\n  update(g=>{''',
    ''' const doMaintenance=(two=false)=>{\n  if(!game||game.active!==0||game.phase!=="manutencao"||game.winner!==null)return;\n  if(mode==="online"){void runRulesCommand({type:"maintenanceChoice",drawTwo:two},0).then(accepted=>{if(accepted)setMaintenanceOpen(false)});return}\n  update(g=>{''',
)

# 2) Authoritative rules: model the resource choice and draw before entering Principal.
replace_once(
    "app/rules-engine/engine-base.mjs",
    '''    if (entry.heroId === "ngoro" && event.type === "onMaintenance" && event.owner === owner && event.afterResourceChoice === true) result.push({ source: heroSource, owner, ability: { id: "ngoro-level-1-maintenance", trigger: "onMaintenance", effects: [{ type: "chooseDeckAndInvestigate", amount: 1 }] } });''',
    '''    if (entry.heroId === "ngoro" && event.type === "onMaintenanceResourceChoice" && event.owner === owner) result.push({ source: heroSource, owner, ability: { id: "ngoro-level-1-maintenance", trigger: "onMaintenanceResourceChoice", effects: [{ type: "chooseDeckAndInvestigate", amount: 1 }] } });''',
)

replace_once(
    "app/rules-engine/engine-base.mjs",
    '''      } else if (item.command.type === "emit") stack.push({ kind: "event", event: item.command.event });''',
    '''      } else if (item.command.type === "maintenanceChoice") {\n        if (state.phase !== "manutencao" || state.active !== item.command.owner) throw new RulesViolation("maintenance-choice-unavailable");\n        if (state.pendingResponse || state.pendingAction || state.pendingDecision || state.pendingReposition || state.combatAction) throw new RulesViolation("interaction-pending");\n        const entry = state.players[item.command.owner];\n        if (!entry.deck?.length) {\n          entry.life = 0;\n          state.winner = 1 - item.command.owner;\n          state.pendingResponse = null;\n          delete state.pendingAction;\n          state.pendingDecision = null;\n          state.pendingReposition = null;\n          state.combatAction = null;\n          continue;\n        }\n        const drawTwo = !!item.command.drawTwo && state.round > 1;\n        if (!drawTwo) entry.maxEnergy = Math.min(10, Number(entry.maxEnergy || 0) + 1);\n        entry.energy = entry.maxEnergy;\n        stack.push({ kind: "command", command: { type: "completeMaintenanceChoice", owner: item.command.owner } });\n        stack.push({ kind: "effect", effect: { type: "draw", amount: drawTwo ? 2 : 1 }, context: { owner: item.command.owner, sourceId: `maintenance-${state.round}` } });\n      } else if (item.command.type === "completeMaintenanceChoice") {\n        if (state.phase !== "manutencao" || state.active !== item.command.owner) throw new RulesViolation("maintenance-choice-unavailable");\n        state.phase = "principal";\n        stack.push({ kind: "event", event: { type: "onMaintenanceExit", owner: item.command.owner } });\n        stack.push({ kind: "event", event: { type: "onMaintenanceResourceChoice", owner: item.command.owner, afterResourceChoice: true } });\n      } else if (item.command.type === "emit") stack.push({ kind: "event", event: item.command.event });''',
)

# 3) Room command allowlist: client may only express the choice; server still owns owner/revision/state.
replace_once(
    "app/api/rooms/machine.ts",
    '''const AUTHORITATIVE_COMMANDS = new Set(["playCard", "activate", "activateHero", "declareAttack", "selectDefender", "attack", "advancePhase", "resolveDecision", "reposition", "confirmReposition", "passPriority"]);''',
    '''const AUTHORITATIVE_COMMANDS = new Set(["playCard", "activate", "activateHero", "maintenanceChoice", "declareAttack", "selectDefender", "attack", "advancePhase", "resolveDecision", "reposition", "confirmReposition", "passPriority"]);''',
)

# 4) Regression coverage: both maintenance choices, first-turn normalization, ownership and static client contract.
test = r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";

const card = (id) => ({ id, uid: id, name: id, type: "Criatura", cost: 1, atk: 1, hp: 1, text: "", tags: [], subtypes: [], abilities: [], modifiers: [] });
const player = () => ({
  heroId: "saymon", level: 1, life: 30, maxLife: 30,
  energy: 0, maxEnergy: 2, reserve: 0,
  hand: [], deck: [card("a"), card("b"), card("c")], extraDeck: [], grave: [], obscuro: [],
  board: [], support: [], terrain: null, abilityUses: {}, markers: {}, heroXP: 0,
  turnCardsPlayed: 0, turnSpellsPlayed: 0,
});
const state = (round = 2) => ({ active: 0, phase: "manutencao", round, events: 0, winner: null, players: [player(), player()] });

test("Online maintenance +energy choice is authoritative and enters Principal", () => {
  const result = executeOnlineCommand(state(), { type: "maintenanceChoice", owner: 0, drawTwo: false }).state;
  assert.equal(result.phase, "principal");
  assert.equal(result.players[0].maxEnergy, 3);
  assert.equal(result.players[0].energy, 3);
  assert.equal(result.players[0].hand.length, 1);
  assert.equal(result.players[0].deck.length, 2);
});

test("Online maintenance draw-two choice keeps max energy and draws two after round one", () => {
  const result = executeOnlineCommand(state(), { type: "maintenanceChoice", owner: 0, drawTwo: true }).state;
  assert.equal(result.phase, "principal");
  assert.equal(result.players[0].maxEnergy, 2);
  assert.equal(result.players[0].energy, 2);
  assert.equal(result.players[0].hand.length, 2);
  assert.equal(result.players[0].deck.length, 1);
});

test("first maintenance always uses +energy/draw-one even if drawTwo is requested", () => {
  const result = executeOnlineCommand(state(1), { type: "maintenanceChoice", owner: 0, drawTwo: true }).state;
  assert.equal(result.players[0].maxEnergy, 3);
  assert.equal(result.players[0].hand.length, 1);
});

test("non-active player cannot resolve the maintenance choice", () => {
  assert.throws(() => executeOnlineCommand(state(), { type: "maintenanceChoice", owner: 1, drawTwo: false }), /maintenance-choice-unavailable/);
});

test("empty deck at maintenance is an authoritative defeat", () => {
  const game = state();
  game.players[0].deck = [];
  const result = executeOnlineCommand(game, { type: "maintenanceChoice", owner: 0, drawTwo: false }).state;
  assert.equal(result.winner, 1);
  assert.equal(result.players[0].life, 0);
});

test("Online client sends maintenanceChoice instead of relying on legacy sync", async () => {
  const [page, machine, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /mode==="online"\)\{void runRulesCommand\(\{type:"maintenanceChoice",drawTwo:two\},0\)/);
  assert.match(machine, /"maintenanceChoice"/);
  assert.match(route, /legacy state sync disabled; use authoritative commands/);
});
'''
Path("tests/online-maintenance-choice.test.mjs").write_text(test, encoding="utf-8")

# Restore the normal CI workflow in the functional commit produced by the runner.
ci = '''name: CI

on:
  push:
    branches:
      - main
      - fix/cards_mechanics
      - optimization-cleanup
      - ai/advanced-opponent-system
      - fix/response-uruk-priority-rules
      - refactor/consolidate-scripts
      - refactor/consolidate-css
      - codex/optimization-cleanup
      - ui/fixed-board-composition
  pull_request:
    branches:
      - main

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  test-and-build:
    name: Rules, lint, types, card audit and Next.js build
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22.13.0
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Validate canonical project state
        run: npm run prepare:project

      - name: Run rules tests
        run: npm run test:rules

      - name: Run AI strategic benchmark
        run: npm run ai:calibrate:benchmark

      - name: Lint advanced AI surfaces
        # The AI adapter deliberately bridges the typed controller to the legacy
        # JS card engine, whose card payloads are not yet modeled end-to-end.
        # Strict TypeScript remains mandatory; only explicit-any style warnings
        # at that boundary are relaxed here.
        run: npx eslint app/rules-engine/ai-system/*.ts scripts/ai-calibration.ts scripts/ai-selfplay.ts tests/advanced-ai.test.mjs --rule '@typescript-eslint/no-explicit-any: off'

      - name: Report repository-wide legacy lint debt
        continue-on-error: true
        run: npm run lint

      - name: Report repository-wide legacy type debt
        continue-on-error: true
        run: npx tsc --noEmit

      - name: Export full card implementation audit
        run: npm run audit:cards:full

      - name: Upload card implementation audit JSON
        uses: actions/upload-artifact@v4
        with:
          name: card-implementation-audit
          path: docs/card-implementation-audit.json
          if-no-files-found: error

      - name: Build Next.js application
        run: npm run vercel-build
'''
Path(".github/workflows/ci.yml").write_text(ci, encoding="utf-8")
