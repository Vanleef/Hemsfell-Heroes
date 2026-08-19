import rawCards from "../../cards.generated.json";
import { compileCard } from "../../rules-engine/compiler.mjs";

/**
 * Server-owned Online match bootstrap.
 *
 * The browser may choose a hero, but it must never manufacture the shuffled
 * decks, hands or Deck Extra for either participant. Keeping this constructor
 * beside the room machine prevents the host from learning or replacing the
 * guest's private opening state through a client supplied snapshot.
 */
type Card = {
  page: number;
  id: string;
  name: string;
  type: string;
  cost: number;
  tags: string[];
  hero: boolean;
  imageCard: boolean;
  [key: string]: unknown;
};

type DeckId = "gimble" | "goblin" | "uruk" | "tifon" | "saymon" | "tessalia" | "quarion" | "rasmus" | "ngoro" | "zayan" | "natureza";

const removedCatalogPages = new Set([149, 200, 201, 203, 204, 205, 207, 209, 210]);
const disabledDeckCardIds = new Set(["p200", "p201", "p203", "p206", "p207", "p209", "p210"]);
const cards = (rawCards as Card[])
  .filter((card) => !removedCatalogPages.has(card.page))
  .map((card) => compileCard(card.page === 252
    ? { ...card, type: "Feitiço", tags: [...new Set([...(card.tags || []), "Acelerado"])] }
    : card) as Card);

const deckRanges: Record<DeckId, { start: number; end: number }> = {
  gimble: { start: 3, end: 25 },
  goblin: { start: 27, end: 49 },
  uruk: { start: 55, end: 109 },
  tifon: { start: 111, end: 128 },
  saymon: { start: 130, end: 151 },
  tessalia: { start: 153, end: 179 },
  quarion: { start: 181, end: 210 },
  rasmus: { start: 212, end: 254 },
  ngoro: { start: 256, end: 272 },
  zayan: { start: 274, end: 290 },
  natureza: { start: 292, end: 309 },
};

/* Canonical testing/gameplay lists. These mirror the deck definitions used by
 * the client collection, but the randomization itself happens only here. */
const suppliedDeckPages: Partial<Record<DeckId, Array<[number, number]>>> = {
  gimble: [[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,2],[10,2],[11,2],[12,3],[13,3],[14,2],[15,3],[17,3],[18,2],[16,2],[20,3],[21,2],[22,2]],
  goblin: [[28,2],[29,3],[27,3],[30,2],[33,2],[32,2],[31,3],[34,3],[35,3],[36,3],[48,3],[42,3],[43,3],[44,3],[45,3],[46,3],[47,2],[41,3]],
  uruk: [[77,3],[78,3],[76,2],[80,2],[79,3],[64,2],[69,2],[55,3],[56,3],[68,3],[67,2],[63,2],[61,3],[65,2],[57,2],[75,2],[62,2],[58,1],[66,1],[60,2],[70,2],[59,2]],
  tifon: [[111,3],[112,3],[114,3],[113,3],[115,3],[116,3],[117,3],[118,3],[119,2],[120,2],[125,3],[122,3],[123,3],[121,3],[124,3],[127,2],[126,2],[128,2]],
  saymon: [[130,3],[131,3],[132,3],[133,3],[135,2],[134,3],[136,3],[138,2],[137,3],[140,3],[139,3],[145,3],[146,2],[143,2],[144,3],[142,2],[147,2],[141,2],[148,2]],
  tessalia: [[164,2],[165,2],[166,2],[167,3],[171,3],[169,2],[168,2],[172,3],[173,2],[174,2],[175,2],[176,2],[158,2],[161,2],[157,2],[160,2],[162,2],[159,2],[156,2],[154,2],[153,2],[155,2],[163,2]],
  quarion: [[184,3],[189,3],[186,3],[188,3],[183,3],[190,3],[187,3],[185,3],[182,2],[193,2],[197,2],[194,2],[196,2],[195,2],[192,2],[153,2],[150,2],[151,3],[191,2],[181,2]],
  rasmus: [[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[234,3],[254,2],[212,1],[229,3],[251,2],[235,2]],
  ngoro: [[256,3],[257,3],[260,3],[259,3],[262,3],[258,3],[261,3],[264,3],[263,3],[266,3],[265,3],[269,3],[267,3],[268,3],[270,3],[271,2],[272,2]],
};

const uid = () => globalThis.crypto.randomUUID();
const secureIndex = (maxExclusive: number) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) return 0;
  const range = 0x1_0000_0000;
  const limit = range - (range % maxExclusive);
  const value = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % maxExclusive;
};
const shuffle = <T,>(source: T[]) => {
  const output = [...source];
  for (let index = output.length - 1; index > 0; index--) {
    const swap = secureIndex(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
};
const allFor = (id: DeckId) => {
  const range = deckRanges[id];
  return cards.filter((card) => card.page >= range.start && card.page <= range.end && !card.hero);
};
const poolFor = (id: DeckId) => {
  const supplied = suppliedDeckPages[id];
  return supplied
    ? supplied.map(([page]) => cards.find((card) => card.page === page)).filter((card): card is Card => !!card && !card.imageCard && !disabledDeckCardIds.has(card.id))
    : allFor(id).filter((card) => !card.imageCard && !disabledDeckCardIds.has(card.id));
};
const extraFor = (id: DeckId) => allFor(id).filter((card) => card.imageCard && !disabledDeckCardIds.has(card.id) && (id !== "uruk" || [71,72,73,74,81].includes(card.page)));
const buildDeck = (id: DeckId) => {
  const supplied = suppliedDeckPages[id];
  if (supplied) return supplied.flatMap(([page, quantity]) => {
    const card = cards.find((candidate) => candidate.page === page);
    return card && !disabledDeckCardIds.has(card.id)
      ? Array.from({ length: quantity }, (_, copy) => ({ ...structuredClone(card), id: `${card.id}-${id}-${copy}-${uid()}` }))
      : [];
  });
  const pool = poolFor(id), output: Card[] = [];
  let copy = 0;
  while (output.length < 49) {
    for (const card of pool) {
      if (output.length === 49) break;
      output.push({ ...structuredClone(card), id: `${card.id}-${copy}-${uid()}` });
    }
    copy++;
  }
  return output;
};

const makePlayer = (heroId: DeckId, startingLife: number) => {
  const deck = shuffle(buildDeck(heroId));
  return {
    heroId,
    level: 1,
    heroXP: 0,
    levelUpsThisTurn: 0,
    life: startingLife,
    lifeLostThisTurn: 0,
    lifeLossEvents: 0,
    maxEnergy: 0,
    energy: 0,
    reserve: 0,
    deck: deck.slice(7),
    extraDeck: structuredClone(extraFor(heroId)),
    hand: deck.slice(0, 7),
    board: [],
    support: [],
    terrain: null,
    grave: [],
    obscuro: [],
    cardsPlayed: 0,
    turnCardsPlayed: 0,
    goblinTurnCardsPlayed: 0,
    turnSpellsPlayed: 0,
    spellsPlayed: 0,
    coffeeSpells: 0,
    damageDealt: 0,
    turnDeaths: 0,
    abilityUses: {},
    pendingTranqueira: false,
    nextCardDiscount: 0,
    nextNonCreatureDiscount: 0,
    nextSpellDiscount: 0,
    nextSummonPaysLife: false,
    nextCreaturePaysLife: false,
    catsEnteredThisTurn: 0,
  };
};

export function createInitialOnlineGame(hostHeroId: string, guestHeroId: string, active: 0 | 1, startingLife: number) {
  if (!(hostHeroId in deckRanges) || !(guestHeroId in deckRanges)) throw new Error("invalid deck");
  const life = Math.max(1, Math.round(Number(startingLife) || 30));
  return {
    players: [makePlayer(hostHeroId as DeckId, life), makePlayer(guestHeroId as DeckId, life)],
    active,
    phase: "manutencao",
    round: 1,
    log: [{ id: "start", text: "A batalha por Hemsfell começou.", tone: "system" }],
    winner: null,
    selectedAttackers: [],
    events: 1,
    combatAction: null,
    pendingResponse: null,
    turnDeadline: null,
  };
}
