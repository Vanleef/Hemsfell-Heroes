import cards from "./cards.generated.json";

export type CatalogCard = (typeof cards)[number];

const canonicalCards = cards as readonly CatalogCard[];

export const cardsByPage = new Map<number, CatalogCard>(
  canonicalCards
    .map((card) => [Number(card.page), card] as const)
    .filter(([page]) => Number.isFinite(page) && page > 0),
);

export const cardsById = new Map<string, CatalogCard>(
  canonicalCards
    .map((card) => [String(card.id || ""), card] as const)
    .filter(([id]) => Boolean(id)),
);

export function catalogCardByPage(page: number | string | null | undefined) {
  const normalized = Number(page);
  return Number.isFinite(normalized) && normalized > 0 ? cardsByPage.get(normalized) ?? null : null;
}

export function catalogCardById(id: string | null | undefined) {
  return id ? cardsById.get(id) ?? null : null;
}

export function catalogCards() {
  return canonicalCards;
}
