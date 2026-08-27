export const USER_DECK_VERSION: 1;
export const USER_DECK_STORAGE_KEY: string;
export const MAIN_DECK_SIZE: 49;
export const MAX_COPIES: 3;

export type DeckId = "gimble" | "goblin" | "uruk" | "tifon" | "saymon" | "tessalia" | "quarion" | "rasmus" | "ngoro" | "zayan" | "natureza";
export type UserDeckEntry = { cardId: string; quantity: number };
export type UserDeck = { version: 1; name: string; heroId: DeckId; main: UserDeckEntry[]; extra: string[] };
export type DeckCatalogCard = { id: string; page: number; hero?: boolean; imageCard?: boolean; [key: string]: unknown };
export type UserDeckValidation = { ok: boolean; errors: string[]; deck: UserDeck | null; mainCount: number };

export const deckRanges: Readonly<Record<DeckId, { start: number; end: number }>>;
export const suppliedDeckPages: Readonly<Partial<Record<DeckId, Array<[number, number]>>>>;
export const removedCatalogPages: Set<number>;
export const disabledDeckCardIds: Set<string>;
export const deckIds: readonly string[];

export function isDeckId(value: unknown): value is DeckId;
export function cardAllowedInDeckZone(heroId: string, card: DeckCatalogCard, zone: "main" | "extra"): boolean;
export function defaultUserDeck(heroId: DeckId, catalog: DeckCatalogCard[], name?: string): UserDeck;
export function validateUserDeck(input: unknown, catalog: DeckCatalogCard[]): UserDeckValidation;
export function validateUserDeckDraft(input: unknown, catalog: DeckCatalogCard[]): UserDeckValidation;
export function expandUserDeckMain<T extends DeckCatalogCard>(userDeck: UserDeck, catalog: T[], idFactory?: (cardId: string, copy: number) => string): T[];
export function resolveUserDeckExtra<T extends DeckCatalogCard>(userDeck: UserDeck, catalog: T[]): T[];
