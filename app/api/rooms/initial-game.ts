import rawCards from "../../data/catalog/generated-card-catalog";
import { compileCard } from "../../rules-engine/compiler.mjs";
import { deckRanges, disabledDeckCardIds, expandUserDeckMain, removedCatalogPages, resolveUserDeckExtra, suppliedDeckPages, validateUserDeck } from "../../user-deck.mjs";
import type { UserDeck } from "../../user-deck.mjs";

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

type DeckId = keyof typeof deckRanges;

const cards = (rawCards as Card[])
  .filter((card) => !removedCatalogPages.has(card.page))
  .map((card) => compileCard(card.page === 252
    ? { ...card, type: "Feitiço", tags: [...new Set([...(card.tags || []), "Acelerado"])] }
    : card) as Card);

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
const resolveConfiguredDeck = (id: DeckId, candidate?: UserDeck | null): UserDeck | null => {
  if (!candidate) return null;
  const validation = validateUserDeck(candidate, cards);
  if (!validation.ok || !validation.deck || validation.deck.heroId !== id) throw new Error("invalid deck");
  return validation.deck;
};
const buildDeck = (id: DeckId, configured: UserDeck | null = null) => {
  if (configured) return expandUserDeckMain(configured, cards, (cardId, copy) => `${cardId}-${id}-${copy}-${uid()}`) as Card[];
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

const makePlayer = (heroId: DeckId, startingLife: number, userDeck?: UserDeck | null) => {
  const configured = resolveConfiguredDeck(heroId, userDeck);
  const deck = shuffle(buildDeck(heroId, configured));
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
    extraDeck: configured ? resolveUserDeckExtra(configured, cards) : structuredClone(extraFor(heroId)),
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

export function createInitialOnlineGame(hostHeroId: string, guestHeroId: string, active: 0 | 1, startingLife: number, hostDeck?: UserDeck | null, guestDeck?: UserDeck | null) {
  if (!(hostHeroId in deckRanges) || !(guestHeroId in deckRanges)) throw new Error("invalid deck");
  const life = Math.max(1, Math.round(Number(startingLife) || 30));
  return {
    players: [makePlayer(hostHeroId as DeckId, life, hostDeck), makePlayer(guestHeroId as DeckId, life, guestDeck)],
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
