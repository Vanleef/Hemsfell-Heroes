import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  await writeFile(path, after);
}

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(search, replacement);
}

await patch("app/api/rooms/machine.ts", (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'import { logOnlineDiagnostic } from "./online-diagnostics.mjs";\n',
    'import { logOnlineDiagnostic } from "./online-diagnostics.mjs";\nimport type { UserDeck } from "../../user-deck.mjs";\n',
    "machine UserDeck type import",
  );
  source = replaceOnce(
    source,
    '  deckLocked: boolean;\n  mulliganDone: boolean;\n',
    '  deckLocked: boolean;\n  /** Private deck payload validated server-side. roomView never exposes it. */\n  userDeck?: UserDeck | null;\n  mulliganDone: boolean;\n',
    "participant private user deck",
  );
  source = replaceOnce(
    source,
    '  return { heroId: null, token, accepted, deckLocked: false, mulliganDone: false, mulliganCount: 0, disconnectedAt: null, lastSeenAt: Date.now(), recentCommandIds: [], turnHadAction: false, noActionTimeouts: 0, lastNoActionTimeoutRound: null, probationRound: null, disconnectAfterOpponentMaintenance: false };',
    '  return { heroId: null, token, accepted, deckLocked: false, userDeck: null, mulliganDone: false, mulliganCount: 0, disconnectedAt: null, lastSeenAt: Date.now(), recentCommandIds: [], turnHadAction: false, noActionTimeouts: 0, lastNoActionTimeoutRound: null, probationRound: null, disconnectAfterOpponentMaintenance: false };',
    "participant initializes user deck",
  );
  return source;
});

await patch("app/api/rooms/initial-game.ts", (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'import { compileCard } from "../../rules-engine/compiler.mjs";\n',
    'import { compileCard } from "../../rules-engine/compiler.mjs";\nimport { deckRanges, disabledDeckCardIds, expandUserDeckMain, removedCatalogPages, resolveUserDeckExtra, suppliedDeckPages, validateUserDeck } from "../../user-deck.mjs";\nimport type { UserDeck } from "../../user-deck.mjs";\n',
    "initial game shared deck imports",
  );
  source = source.replace(
    /type DeckId = "gimble"[\s\S]*?const suppliedDeckPages: Partial<Record<DeckId, Array<\[number, number\]>>> = \{[\s\S]*?\n\};\n\n/,
    'type DeckId = keyof typeof deckRanges;\n\n',
  );
  if (!source.includes('type DeckId = keyof typeof deckRanges;')) throw new Error("Could not remove duplicated server deck configuration");

  const buildStart = source.indexOf('const buildDeck = (id: DeckId) => {');
  const makePlayerStart = source.indexOf('const makePlayer = (heroId: DeckId, startingLife: number) => {');
  if (buildStart < 0 || makePlayerStart < 0 || makePlayerStart <= buildStart) throw new Error("Initial game deck builder boundaries not found");
  const beforeBuild = source.slice(0, buildStart);
  const afterMakeMarker = source.slice(makePlayerStart);
  const makePlayerEnd = afterMakeMarker.indexOf('\n};\n\nexport function createInitialOnlineGame');
  if (makePlayerEnd < 0) throw new Error("Initial game makePlayer boundary not found");
  const tail = afterMakeMarker.slice(makePlayerEnd + 4);
  const replacement = `const resolveConfiguredDeck = (id: DeckId, candidate?: UserDeck | null): UserDeck | null => {\n  if (!candidate) return null;\n  const validation = validateUserDeck(candidate, cards);\n  if (!validation.ok || !validation.deck || validation.deck.heroId !== id) throw new Error("invalid deck");\n  return validation.deck;\n};\nconst buildDeck = (id: DeckId, configured: UserDeck | null = null) => {\n  if (configured) return expandUserDeckMain(configured, cards, (cardId, copy) => \`${'${cardId}'}-${'${id}'}-${'${copy}'}-${'${uid()}'}\`) as Card[];\n  const supplied = suppliedDeckPages[id];\n  if (supplied) return supplied.flatMap(([page, quantity]) => {\n    const card = cards.find((candidate) => candidate.page === page);\n    return card && !disabledDeckCardIds.has(card.id)\n      ? Array.from({ length: quantity }, (_, copy) => ({ ...structuredClone(card), id: \`${'${card.id}'}-${'${id}'}-${'${copy}'}-${'${uid()}'}\` }))\n      : [];\n  });\n  const pool = poolFor(id), output: Card[] = [];\n  let copy = 0;\n  while (output.length < 49) {\n    for (const card of pool) {\n      if (output.length === 49) break;\n      output.push({ ...structuredClone(card), id: \`${'${card.id}'}-${'${copy}'}-${'${uid()}'}\` });\n    }\n    copy++;\n  }\n  return output;\n};\n\nconst makePlayer = (heroId: DeckId, startingLife: number, userDeck?: UserDeck | null) => {\n  const configured = resolveConfiguredDeck(heroId, userDeck);\n  const deck = shuffle(buildDeck(heroId, configured));\n  return {\n    heroId,\n    level: 1,\n    heroXP: 0,\n    levelUpsThisTurn: 0,\n    life: startingLife,\n    lifeLostThisTurn: 0,\n    lifeLossEvents: 0,\n    maxEnergy: 0,\n    energy: 0,\n    reserve: 0,\n    deck: deck.slice(7),\n    extraDeck: configured ? resolveUserDeckExtra(configured, cards) : structuredClone(extraFor(heroId)),\n    hand: deck.slice(0, 7),\n    board: [],\n    support: [],\n    terrain: null,\n    grave: [],\n    obscuro: [],\n    cardsPlayed: 0,\n    turnCardsPlayed: 0,\n    goblinTurnCardsPlayed: 0,\n    turnSpellsPlayed: 0,\n    spellsPlayed: 0,\n    coffeeSpells: 0,\n    damageDealt: 0,\n    turnDeaths: 0,\n    abilityUses: {},\n    pendingTranqueira: false,\n    nextCardDiscount: 0,\n    nextNonCreatureDiscount: 0,\n    nextSpellDiscount: 0,\n    nextSummonPaysLife: false,\n    nextCreaturePaysLife: false,\n    catsEnteredThisTurn: 0,\n  };\n};\n`;
  source = beforeBuild + replacement + tail;
  source = replaceOnce(
    source,
    'export function createInitialOnlineGame(hostHeroId: string, guestHeroId: string, active: 0 | 1, startingLife: number) {',
    'export function createInitialOnlineGame(hostHeroId: string, guestHeroId: string, active: 0 | 1, startingLife: number, hostDeck?: UserDeck | null, guestDeck?: UserDeck | null) {',
    "custom deck bootstrap signature",
  );
  source = replaceOnce(
    source,
    '    players: [makePlayer(hostHeroId as DeckId, life), makePlayer(guestHeroId as DeckId, life)],',
    '    players: [makePlayer(hostHeroId as DeckId, life, hostDeck), makePlayer(guestHeroId as DeckId, life, guestDeck)],',
    "custom decks passed to players",
  );
  return source;
});

await patch("app/api/rooms/[id]/route.ts", (input) => {
  let source = input;
  source = replaceOnce(
    source,
    'import { isPlainRecord, isRoomId, readSafeJson } from "../validation";\n',
    'import { isPlainRecord, isRoomId, readSafeJson } from "../validation";\nimport rawCards from "../../../cards.generated.json";\nimport { validateUserDeck } from "../../../user-deck.mjs";\n',
    "route user deck imports",
  );
  source = replaceOnce(
    source,
    '      current.heroId = body.heroId;\n      current.deckLocked = !!body.locked;\n',
    '      let selectedUserDeck = null;\n      if (body.userDeck !== undefined && body.userDeck !== null) {\n        const validation = validateUserDeck(body.userDeck, rawCards as any[]);\n        if (!validation.ok || !validation.deck || validation.deck.heroId !== body.heroId) return NextResponse.json({ error: "invalid deck list", details: validation.errors.slice(0, 4) }, { status: 400, ...noStore });\n        selectedUserDeck = validation.deck;\n      }\n      current.heroId = body.heroId;\n      current.userDeck = selectedUserDeck;\n      current.deckLocked = !!body.locked;\n',
    "validate selected custom deck",
  );
  source = replaceOnce(
    source,
    '      room.game = createInitialOnlineGame(room.host.heroId, room.guest.heroId, active, room.settings.startingLife);',
    '      room.game = createInitialOnlineGame(room.host.heroId, room.guest.heroId, active, room.settings.startingLife, room.host.userDeck, room.guest.userDeck);',
    "bootstrap selected custom decks",
  );
  return source;
});

const auditTest = `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport test from "node:test";\n\nconst [machine, route, initial, store] = await Promise.all([\n  readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),\n  readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),\n  readFile(new URL("../app/api/rooms/initial-game.ts", import.meta.url), "utf8"),\n  readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8"),\n]);\n\ntest("online deck selection validates and stores only a private UserDeck", () => {\n  assert.match(machine, /userDeck\\?: UserDeck \\| null/);\n  assert.match(route, /validateUserDeck\\(body\\.userDeck/);\n  assert.match(route, /current\\.userDeck = selectedUserDeck/);\n  assert.doesNotMatch(store, /host: \\{[^}]*userDeck/);\n  assert.doesNotMatch(store, /guest: room\\.guest \\? \\{[^}]*userDeck/);\n});\n\ntest("server-owned bootstrap consumes validated host and guest deck definitions", () => {\n  assert.match(route, /createInitialOnlineGame\\([^;]*room\\.host\\.userDeck, room\\.guest\\.userDeck\\)/);\n  assert.match(initial, /resolveConfiguredDeck/);\n  assert.match(initial, /expandUserDeckMain/);\n  assert.match(initial, /resolveUserDeckExtra/);\n  assert.match(initial, /validation\\.deck\\.heroId !== id/);\n});\n`;
await writeFile("tests/online-user-deck-authority.test.mjs", auditTest);
