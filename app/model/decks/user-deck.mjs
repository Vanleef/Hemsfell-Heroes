export const USER_DECK_VERSION = 1;
export const USER_DECK_STORAGE_KEY = "hemsfell-user-decks:v1";
export const MAIN_DECK_SIZE = 49;
export const MAX_COPIES = 3;

export const deckRanges = Object.freeze({
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
});

export const suppliedDeckPages = Object.freeze({
  gimble: [[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,2],[10,2],[11,2],[12,3],[13,3],[14,2],[15,3],[17,3],[18,2],[16,2],[20,3],[21,2],[22,2]],
  goblin: [[28,2],[29,3],[27,3],[30,2],[33,2],[32,2],[31,3],[34,3],[35,3],[36,3],[48,3],[42,3],[43,3],[44,3],[45,3],[46,3],[47,2],[41,3]],
  uruk: [[77,3],[78,3],[76,2],[80,2],[79,3],[64,2],[69,2],[55,3],[56,3],[68,3],[67,2],[63,2],[61,3],[65,2],[57,2],[75,2],[62,2],[58,1],[66,1],[60,2],[70,2],[59,2]],
  tifon: [[111,3],[112,3],[114,3],[113,3],[115,3],[116,3],[117,3],[118,3],[119,2],[120,2],[125,3],[122,3],[123,3],[121,3],[124,3],[127,2],[126,2],[128,2]],
  saymon: [[130,3],[131,3],[132,3],[133,3],[135,2],[134,3],[136,3],[138,2],[137,3],[140,3],[139,3],[145,3],[146,2],[143,2],[144,3],[142,2],[147,2],[141,2],[148,2]],
  tessalia: [[164,2],[165,2],[166,2],[167,3],[171,3],[169,2],[168,2],[172,3],[173,2],[174,2],[175,2],[176,2],[158,2],[161,2],[157,2],[160,2],[162,2],[159,2],[156,2],[154,2],[153,2],[155,2],[163,2]],
  quarion: [[184,3],[189,3],[186,3],[188,3],[183,3],[190,3],[187,3],[185,3],[182,2],[193,2],[197,2],[194,2],[196,2],[195,2],[192,2],[153,2],[150,2],[151,3],[191,2],[181,2]],
  rasmus: [[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[234,3],[254,2],[212,1],[229,3],[251,2],[235,2]],
  ngoro: [[256,3],[257,3],[260,3],[259,3],[262,3],[258,3],[261,3],[264,3],[263,3],[266,3],[265,3],[269,3],[267,3],[268,3],[270,3],[271,2],[272,2]],
});

export const removedCatalogPages = new Set([149, 200, 201, 203, 204, 205, 207, 209, 210]);
export const disabledDeckCardIds = new Set(["p200", "p201", "p203", "p206", "p207", "p209", "p210"]);
const urukExtraPages = new Set([71, 72, 73, 74, 81]);
export const deckIds = Object.freeze(Object.keys(deckRanges));

export function isDeckId(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(deckRanges, value);
}

function cleanCatalog(catalog) {
  return Array.isArray(catalog)
    ? catalog.filter((card) => card && typeof card.id === "string" && Number.isInteger(Number(card.page)) && !removedCatalogPages.has(Number(card.page)))
    : [];
}

function suppliedMainPages(heroId) {
  return new Set((suppliedDeckPages[heroId] || []).map(([page]) => page));
}

export function cardAllowedInDeckZone(heroId, card, zone) {
  if (!isDeckId(heroId) || !card || card.hero || disabledDeckCardIds.has(card.id) || removedCatalogPages.has(Number(card.page))) return false;
  const range = deckRanges[heroId];
  const inRange = Number(card.page) >= range.start && Number(card.page) <= range.end;
  if (zone === "extra") {
    if (!card.imageCard || !inRange) return false;
    return heroId !== "uruk" || urukExtraPages.has(Number(card.page));
  }
  if (zone !== "main" || card.imageCard) return false;
  return inRange || suppliedMainPages(heroId).has(Number(card.page));
}

export function defaultUserDeck(heroId, catalog, name) {
  if (!isDeckId(heroId)) throw new Error("invalid hero id");
  const activeCatalog = cleanCatalog(catalog);
  const byPage = new Map(activeCatalog.map((card) => [Number(card.page), card]));
  const supplied = suppliedDeckPages[heroId];
  let main;
  if (supplied) {
    main = supplied.map(([page, quantity]) => {
      const card = byPage.get(page);
      if (!card || !cardAllowedInDeckZone(heroId, card, "main")) throw new Error("canonical deck references an unavailable card: " + page);
      return { cardId: card.id, quantity };
    });
  } else {
    const pool = activeCatalog.filter((card) => cardAllowedInDeckZone(heroId, card, "main"));
    if (!pool.length) throw new Error("deck has no legal cards");
    const base = Math.floor(MAIN_DECK_SIZE / pool.length);
    const remainder = MAIN_DECK_SIZE % pool.length;
    main = pool.map((card, index) => ({ cardId: card.id, quantity: base + (index < remainder ? 1 : 0) }));
  }
  const extra = activeCatalog.filter((card) => cardAllowedInDeckZone(heroId, card, "extra")).map((card) => card.id);
  const deck = { version: USER_DECK_VERSION, name: typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : heroId, heroId, main, extra };
  const validated = validateUserDeck(deck, activeCatalog);
  if (!validated.ok || !validated.deck) throw new Error("canonical deck is invalid: " + validated.errors.join("; "));
  return validated.deck;
}

function validateUserDeckInput(input, catalog, { allowIncomplete = false } = {}) {
  const errors = [];
  const record = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!record) return { ok: false, errors: ["deck payload must be an object"], deck: null, mainCount: 0 };
  const heroId = typeof record.heroId === "string" ? record.heroId : "";
  if (!isDeckId(heroId)) errors.push("invalid hero identity");
  const version = Number(record.version);
  if (version !== USER_DECK_VERSION) errors.push("unsupported deck version");
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 60) : "";
  if (!name) errors.push("deck name is required");

  const activeCatalog = cleanCatalog(catalog);
  const byId = new Map(activeCatalog.map((card) => [card.id, card]));
  const rawMain = Array.isArray(record.main) ? record.main : [];
  if (!Array.isArray(record.main)) errors.push("main deck must be an array");
  const seenMain = new Set();
  const main = [];
  let mainCount = 0;
  for (const item of rawMain.slice(0, 128)) {
    const cardId = item && typeof item === "object" && typeof item.cardId === "string" ? item.cardId : "";
    const quantity = item && typeof item === "object" ? Number(item.quantity) : NaN;
    if (!cardId || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_COPIES) {
      errors.push("main deck contains an invalid card entry");
      continue;
    }
    if (seenMain.has(cardId)) {
      errors.push("main deck contains duplicate card entries");
      continue;
    }
    seenMain.add(cardId);
    const card = byId.get(cardId);
    if (!card) errors.push("main deck references an unavailable card: " + cardId);
    else if (isDeckId(heroId) && !cardAllowedInDeckZone(heroId, card, "main")) errors.push("card is outside this hero identity: " + cardId);
    main.push({ cardId, quantity });
    mainCount += quantity;
  }
  if (rawMain.length > 128) errors.push("main deck has too many unique entries");
  if (!allowIncomplete && mainCount !== MAIN_DECK_SIZE) errors.push("main deck must contain exactly " + MAIN_DECK_SIZE + " cards");

  const rawExtra = Array.isArray(record.extra) ? record.extra : [];
  if (!Array.isArray(record.extra)) errors.push("extra deck must be an array");
  const extra = [];
  const seenExtra = new Set();
  for (const value of rawExtra.slice(0, 64)) {
    const cardId = typeof value === "string" ? value : "";
    if (!cardId) {
      errors.push("extra deck contains an invalid card id");
      continue;
    }
    if (seenExtra.has(cardId)) {
      errors.push("extra deck contains duplicate cards");
      continue;
    }
    seenExtra.add(cardId);
    const card = byId.get(cardId);
    if (!card) errors.push("extra deck references an unavailable card: " + cardId);
    else if (isDeckId(heroId) && !cardAllowedInDeckZone(heroId, card, "extra")) errors.push("extra deck contains a card outside this hero identity: " + cardId);
    extra.push(cardId);
  }
  if (rawExtra.length > 64) errors.push("extra deck is too large");

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    mainCount,
    deck: errors.length === 0 ? { version: USER_DECK_VERSION, name, heroId, main, extra } : null,
  };
}

export function validateUserDeck(input, catalog) {
  return validateUserDeckInput(input, catalog);
}

/* Deck building is an incremental flow. A safe draft may contain fewer than
   49 cards while the player edits it, but it must still obey every identity,
   availability, copy-limit and Extra Deck rule. Match entry points continue
   to use validateUserDeck(), which requires the authoritative 49-card total. */
export function validateUserDeckDraft(input, catalog) {
  return validateUserDeckInput(input, catalog, { allowIncomplete: true });
}

export function expandUserDeckMain(userDeck, catalog, idFactory = (cardId, copy) => cardId + "-" + copy) {
  const validated = validateUserDeck(userDeck, catalog);
  if (!validated.ok || !validated.deck) throw new Error("invalid user deck: " + validated.errors.join("; "));
  const byId = new Map(cleanCatalog(catalog).map((card) => [card.id, card]));
  return validated.deck.main.flatMap(({ cardId, quantity }) => {
    const card = byId.get(cardId);
    return Array.from({ length: quantity }, (_, copy) => ({ ...structuredClone(card), id: idFactory(cardId, copy) }));
  });
}

export function resolveUserDeckExtra(userDeck, catalog) {
  const validated = validateUserDeck(userDeck, catalog);
  if (!validated.ok || !validated.deck) throw new Error("invalid user deck: " + validated.errors.join("; "));
  const byId = new Map(cleanCatalog(catalog).map((card) => [card.id, card]));
  return validated.deck.extra.map((cardId) => structuredClone(byId.get(cardId))).filter(Boolean);
}
