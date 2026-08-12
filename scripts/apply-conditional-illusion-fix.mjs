import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, value) => writeFile(path, value);

function replaceRequired(text, search, replacement, label) {
  const next = typeof search === "string" ? text.replace(search, replacement) : text.replace(search, replacement);
  if (next === text) throw new Error(`Patch point not found: ${label}`);
  return next;
}

function replaceTest(text, name, replacement) {
  const marker = `test(\"${name}\"`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Test not found: ${name}`);
  const next = text.indexOf('\ntest("', start + marker.length);
  const end = next < 0 ? text.length : next + 1;
  return `${text.slice(0, start)}${replacement.trim()}\n\n${text.slice(end)}`;
}

// ---------------------------------------------------------------------------
// Canonical conditional Image replacement.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = replaceRequired(
    source,
    /  replaceImage\(state, effect, context\) \{[^\n]*\},/,
`  replaceImage(state, effect, context) {
    const entry = player(state, context.owner);
    const candidates = (entry.board || []).filter((card) =>
      (card.generatedImage || card.imageCard) && normalizedName(card.name) === normalizedName(effect.oldName)
    );
    const chosenId = selectedIds(context)[0];

    // The printed condition is optional: without the smaller Image, the spell
    // still resolves at its normal cost and simply creates the upgraded Image.
    if (!candidates.length) {
      defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.newName, destination: "field" }, context);
      return;
    }

    // When one or more eligible Images exist, the controller must decide which
    // physical Image is replaced. This is authoritative and therefore mirrors
    // correctly in multiplayer instead of letting the client silently pick one.
    if (!chosenId) {
      if (state.pendingDecision) throw new RulesViolation("decision-pending");
      state.pendingDecision = {
        kind: "targets",
        owner: context.owner,
        effect: { replayEffects: [{ ...effect }] },
        context: { ...context, targetIds: [] },
        targetSteps: [{ scope: "allyCreature", role: "effect", requiredName: effect.oldName, imageOnly: true }],
        sourceName: context.effectSource?.name || `Substituir ${effect.oldName}`,
      };
      return;
    }

    const old = candidates.find((card) => (card.uid || card.id) === chosenId);
    if (!old) throw new RulesViolation("invalid-target", `Escolha uma Imagem de ${effect.oldName} que você controla.`);
    const slot = old.slot;
    removeFromZones(state, old.uid || old.id);
    defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.newName, destination: "field" }, { ...context, slot, targetIds: [] });
  },`,
    "replaceImage handler",
  );
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Client decision filtering + target metadata.
// ---------------------------------------------------------------------------
{
  const path = "app/page.tsx";
  let source = await read(path);
  source = replaceRequired(
    source,
    'targetSteps?:Array<{scope:string;role?:string}>',
    'targetSteps?:Array<{scope:string;role?:string;requiredSubtype?:string;requiredName?:string;imageOnly?:boolean}>',
    "PendingDecision target metadata",
  );
  source = replaceRequired(
    source,
    'isValidTarget(engineTargetStep,0,targetOwner,option.kind)&&!engineTargetSelection.includes(option.id)',
    'isValidTarget(engineTargetStep,0,targetOwner,option.kind)&&(!engineTargetStep.requiredSubtype||hasSubtype(option.card,engineTargetStep.requiredSubtype))&&(!engineTargetStep.requiredName||cleanName(option.card.name)===cleanName(engineTargetStep.requiredName))&&(!engineTargetStep.imageOnly||!!(option.card as any).generatedImage||!!(option.card as any).imageCard)&&!engineTargetSelection.includes(option.id)',
    "engine target option constraints",
  );
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Match viewport remains a fixed game canvas; browser zoom cannot mutate the
// logical board composition. The board itself remains responsive to viewport.
// ---------------------------------------------------------------------------
{
  const path = "app/layout.tsx";
  let source = await read(path);
  source = replaceRequired(source, "  userScalable: true,", "  maximumScale: 1,\n  userScalable: false,", "viewport zoom policy");
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Audit: the previously confirmed p13/p14 issue is now covered by executable
// rules and regression tests, so it must not remain reported as an open defect.
// ---------------------------------------------------------------------------
{
  const path = "scripts/export-card-implementation-audit.mjs";
  let source = await read(path);
  source = replaceRequired(
    source,
    /\n  if \(card\.page === 13\) \{[\s\S]*?\n  \}\n  if \(card\.page === 14\) \{[\s\S]*?\n  \}\n/,
    '\n  // Conditional Draconic Image upgrades are implemented by replaceImage: the\n  // engine creates the larger Image normally when no eligible smaller Image\n  // exists, and opens an authoritative target decision when one does.\n',
    "resolved illusion audit finding",
  );
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Dedicated regression coverage for p13 and p14. The regular rules script now
// runs every rules test file so future regressions cannot bypass this scenario.
// ---------------------------------------------------------------------------
{
  const path = "package.json";
  const pkg = JSON.parse(await read(path));
  pkg.scripts["test:rules"] = "node --test tests/*.test.mjs";
  await write(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

await write("tests/illusion-rules.test.mjs", `import assert from "node:assert/strict";
import test from "node:test";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const baseState = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [0, 1].map(() => ({
    heroId: "gimble", level: 1, life: 30, maxLife: 30,
    energy: 10, maxEnergy: 10, reserve: 0,
    deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null,
    grave: [], obscuro: [], cardsPlayed: 0, turnCardsPlayed: 0,
    turnSpellsPlayed: 0, spellsPlayed: 0, abilityUses: {},
  })),
});

const spell = (page, name, cost) => compileCard({ id: \`p\${page}\`, page, name, type: "Feitiço", cost, text: "", tags: [] });
const image = (page, name, slot, uid = \`image-\${page}-\${slot}\`) => ({
  id: \`p\${page}\`, uid, page, name, type: "Criatura", cost: 0,
  atk: page === 23 ? 2 : page === 24 ? 4 : 6,
  hp: page === 23 ? 1 : page === 24 ? 2 : 3,
  tags: [], abilities: [], imageCard: true, generatedImage: true,
  slot, damage: 0, exhausted: false, summoning: false, modifiers: [],
});
const extra = (page, name) => ({ id: \`p\${page}\`, page, name, type: "Criatura", cost: 0, atk: page === 24 ? 4 : 6, hp: page === 24 ? 2 : 3, tags: [], abilities: [], imageCard: true });

test("Ilusão Dracônica without Dragão Filhote costs four and creates Dragão Jovem without a target", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  assert.equal(result.players[0].energy, 0);
  assert.equal(result.pendingDecision ?? null, null);
  assert.equal(result.players[0].board.filter((card) => card.name === "Dragão Jovem").length, 1);
});

test("Ilusão Dracônica with Dragão Filhote costs two and waits for the controller to choose it", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].board.push(image(23, "Dragão Filhote", 3, "hatchling"));
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  assert.equal(pending.players[0].energy, 2);
  assert.equal(pending.pendingDecision?.kind, "targets");
  assert.equal(pending.pendingDecision?.targetSteps?.[0]?.requiredName, "Dragão Filhote");
  assert.equal(pending.players[0].board.some((card) => card.uid === "hatchling"), true);
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["hatchling"] }).state;
  assert.equal(result.pendingDecision ?? null, null);
  assert.equal(result.players[0].board.some((card) => card.uid === "hatchling"), false);
  assert.equal(result.players[0].board.find((card) => card.name === "Dragão Jovem")?.slot, 3);
});

test("Ilusão Dracônica replaces exactly the chosen Dragão Filhote when several exist", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].board.push(image(23, "Dragão Filhote", 1, "first"), image(23, "Dragão Filhote", 4, "chosen"));
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["chosen"] }).state;
  assert.equal(result.players[0].board.some((card) => card.uid === "first"), true);
  assert.equal(result.players[0].board.some((card) => card.uid === "chosen"), false);
  assert.equal(result.players[0].board.find((card) => card.name === "Dragão Jovem")?.slot, 4);
});

test("conditional Image decision rejects an unrelated allied creature", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].board.push(image(23, "Dragão Filhote", 0, "hatchling"), { uid: "other", name: "Outra Criatura", type: "Criatura", slot: 2, atk: 1, hp: 1, tags: [], abilities: [], exhausted: false, summoning: false, modifiers: [] });
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  assert.throws(() => executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["other"] }), /invalid-target/);
  assert.equal(pending.pendingDecision?.kind, "targets");
});

test("Ilusão Dracônica Maior follows the same conditional-choice rule for Dragão Jovem", () => {
  const game = baseState();
  game.players[0].energy = 6;
  game.players[0].board.push(image(24, "Dragão Jovem", 2, "young"));
  game.players[0].hand.push(spell(14, "Ilusão Dracônica Maior", 6));
  game.players[0].extraDeck.push(extra(25, "Dragão Ancião"));
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p14", skipPriority: true }).state;
  assert.equal(pending.players[0].energy, 3);
  assert.equal(pending.pendingDecision?.targetSteps?.[0]?.requiredName, "Dragão Jovem");
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["young"] }).state;
  assert.equal(result.players[0].board.find((card) => card.name === "Dragão Ancião")?.slot, 2);
});
`);

// ---------------------------------------------------------------------------
// The CSS architecture was split into canonical geometry + interaction layers.
// Update regression tests so they inspect the real owning file instead of a
// removed monolithic lab.css snapshot.
// ---------------------------------------------------------------------------
{
  const path = "tests/rules-engine.test.mjs";
  let source = await read(path);

  source = replaceTest(source, "game client routes migrated cards through the command engine", `
test("game client routes migrated cards through the command engine", async () => {
  const [page, lab, legacy, board, tuning, interaction] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lab.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab-legacy.css", import.meta.url), "utf8"),
    readFile(new URL("../app/board-layout.css", import.meta.url), "utf8"),
    readFile(new URL("../app/board-tuning.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab-interaction-responsive.css", import.meta.url), "utf8"),
  ]);
  const css = [lab, legacy, board, tuning, interaction].join("\\n");
  assert.match(page, /canExecuteCard\\(snapshot\\)/);
  assert.match(page, /roomAction\\("command"/);
  assert.match(page, /executeCommand\\(current,\\{\\.\\.\\.command,owner\\},\\{priority:true\\}\\)/);
  assert.match(page, /role!=="attachment"/);
  assert.match(page, /dragged!\\.type!=="Artefato"\\|\\|!!creature/);
  assert.match(page, /chooseAIResponse/);
  assert.match(page, /legalPriorityResponses/);
  assert.match(page, /shouldAutoPass/);
  assert.match(page, /Resposta: Full Control/);
  assert.match(page, /priority-stack-indicator/);
  assert.match(page, /cardPlayTargetPolicy/);
  assert.match(page, /canChooseAllTargets/);
  assert.match(page, /setResponseWindow\\(next\\.pendingResponse\\?\\?null\\)/);
  assert.match(page, /passPriorityWindow/);
  assert.match(page, /heroEvolutionProgress\\(p\\)/);
  assert.match(page, /effectiveCreatureName/);
  assert.match(page, /game\\.active!==0/);
  assert.match(page, /canEvolveThisTurn=\\{game\\.active===0\\}/);
  assert.match(page, /modifier\\.duration!=="turn"/);
  assert.match(page, /combat-attack-ready/);
  assert.match(page, /summoning-sickness-badge/);
  assert.match(page, /displayName=unit&&controller\\?effectiveCreatureName/);
  assert.match(css, /combat-attack-ready-pulse/);
  assert.match(css, /original-card\\.summoning-sick/);
  assert.match(css, /auxiliary-slot \\.card-tooltip/);
  assert.match(css, /z-index:9020!important/);
  assert.doesNotMatch(page, /className="card-frame-inspect"/);
  assert.match(page, /requestCardInspection\\(card\\)/);
  assert.match(page, /hero-command-bar/);
  assert.match(page, /card-focus-layer/);
  assert.match(page, /hemsfell-heroes-logo\\.png/);
  assert.match(css, /fx-summon-arrive/);
  assert.match(css, /z-index:30000!important/);
});`);

  source = replaceTest(source, "field keyword icons render outside the card button at its lower edge", `
test("field keyword icons render outside the card button at its lower edge", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/lab-legacy.css", import.meta.url), "utf8");
  const buttonClose = page.indexOf("</button>", page.indexOf("function OriginalCard"));
  const keywordStrip = page.indexOf('className="field-keywords"', page.indexOf("function OriginalCard"));
  assert.ok(keywordStrip > buttonClose);
  assert.match(css, /\\.card-frame>\\.field-keywords\\{[\\s\\S]*bottom:-18px!important/);
});`);

  source = replaceTest(source, "game viewport and stage use the canonical responsive shell", `
test("game viewport and stage use the canonical responsive shell", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(layout, /export const viewport:\\s*Viewport/);
  assert.match(layout, /width:\\s*"device-width"/);
  assert.match(layout, /initialScale:\\s*1/);
  assert.match(layout, /maximumScale:\\s*1/);
  assert.match(layout, /userScalable:\\s*false/);
  assert.match(page, /className="game-stage"/);
  assert.match(page, /className="hs-board game-content"/);
  assert.doesNotMatch(page, /--hand-card-size/);
});`);

  source = replaceTest(source, "board layout preserves the approved 16:9 composition proportionally", `
test("board layout preserves the approved 16:9 composition proportionally", async () => {
  const css = await readFile(new URL("../app/board-layout.css", import.meta.url), "utf8");
  assert.match(css, /\\.screen-game \\.game-stage > \\.game-content\\.hs-board/);
  assert.match(css, /display:\\s*grid\\s*!important/);
  assert.match(css, /aspect-ratio:\\s*16\\s*\\/\\s*9\\s*!important/);
  assert.match(css, /width:\\s*min\\(100dvw,\\s*calc\\(100dvh \\* 16 \\/ 9\\)\\)\\s*!important/);
  assert.match(css, /grid-template-columns:[\\s\\S]*minmax\\(0, 58fr\\)/);
  assert.match(css, /container-type:\\s*size/);
  assert.doesNotMatch(css, /\\d+px/);
});`);

  source = replaceTest(source, "cards, fields, piles and hand remain proportional without coordinate reflow", `
test("cards, fields, piles and hand remain proportional without coordinate reflow", async () => {
  const [board, lab] = await Promise.all([
    readFile(new URL("../app/board-layout.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab.css", import.meta.url), "utf8"),
  ]);
  const css = board + "\\n" + lab;
  assert.match(css, /--hh-slot-w:\\s*clamp\\([^;]*4cqw/);
  assert.match(css, /--hh-card-ratio:\\s*5\\s*\\/\\s*7/);
  assert.match(css, /\\.hs-board > \\.paired-field\\s*\\{[\\s\\S]*grid-template-columns:\\s*repeat\\(5, minmax\\(0, 1fr\\)\\)/);
  assert.match(css, /\\.hs-board > \\.side-piles\\s*\\{[\\s\\S]*grid-template-columns:\\s*repeat\\(2, minmax\\(0,1fr\\)\\)/);
  assert.match(css, /\\.hs-board > \\.player-hand\\s*\\{[\\s\\S]*overflow-x:\\s*auto\\s*!important/);
  assert.match(css, /@container hemsfell-board \\(max-height: 44rem\\)/);
  assert.doesNotMatch(board, /grid-template-columns:minmax\\(7\\.5rem/);
});`);

  source = replaceTest(source, "final stage seal outranks legacy fixed-position board rules", `
test("final stage seal outranks legacy fixed-position board rules", async () => {
  const [lab, board, interaction] = await Promise.all([
    readFile(new URL("../app/lab.css", import.meta.url), "utf8"),
    readFile(new URL("../app/board-layout.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab-interaction-responsive.css", import.meta.url), "utf8"),
  ]);
  assert.match(lab, /@import "\\.\\/board-layout\\.css"/);
  assert.match(lab, /@import "\\.\\/board-tuning\\.css"/);
  assert.match(lab, /@import "\\.\\/lab-interaction-responsive\\.css"/);
  assert.match(lab, /\\.screen-game \\.game-stage > \\.game-content\\.hs-board > \\.side-piles\\s*\\{[\\s\\S]*position:\\s*relative\\s*!important/);
  assert.match(lab, /left:\\s*auto\\s*!important/);
  assert.match(lab, /transform:\\s*none\\s*!important/);
  assert.match(board, /\\.screen-game \\.hs-board > \\.paired-field/);
  assert.match(interaction, /\\.visual-effect[\\s\\S]*z-index:\\s*62\\s*!important/);
  assert.doesNotMatch(board, /\\d+px/);
});`);

  await write(path, source);
}

console.log("Conditional Draconic Image patch applied successfully.");
