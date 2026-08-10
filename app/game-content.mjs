export const CARD_TYPES = new Set(["Criatura", "Feitiço", "Artefato", "Encanto", "Terreno", "Herói"]);

export const slugify = (value = "") => String(value).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const stableCardId = (setId, page, name) =>
  `${setId}-${String(page).padStart(3, "0")}-${slugify(name)}`;

export function adaptCatalogCard(row, pdfFileId = "1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC") {
  const page = row.legacy_page ?? row.art_page ?? 0;
  return {
    id: row.id,
    setId: row.set_id,
    page,
    name: row.name,
    type: row.card_type,
    faction: row.faction ?? undefined,
    cost: row.cost,
    atk: row.attack ?? undefined,
    hp: row.health ?? undefined,
    text: row.rules_text,
    tags: Array.isArray(row.tags) ? row.tags : [],
    effects: Array.isArray(row.effects) ? row.effects : [],
    image: `drive://${pdfFileId}/page/${String(page || 1).padStart(3, "0")}`,
    hero: row.card_type === "Herói",
    imageCard: Boolean(row.is_image_card),
  };
}

export function deckEntriesFromPages(entries, cardsByPage) {
  const errors = [];
  const byCardId = new Map();
  for (const entry of entries) {
    const card = cardsByPage.get(entry.page);
    if (!card) {
      errors.push(`unknown card page: ${entry.page}`);
      continue;
    }
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1) {
      errors.push(`invalid quantity on page: ${entry.page}`);
      continue;
    }
    byCardId.set(card.id, (byCardId.get(card.id) || 0) + entry.quantity);
  }
  return { entries: [...byCardId].map(([cardId, quantity]) => ({ cardId, quantity })), errors };
}

/**
 * Validates the transport shape used by the content database. Effects are data
 * owned by the catalogue; the game engine decides which effect kinds it supports.
 */
export function validateCardRecord(card) {
  const errors = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(card?.id || "")) errors.push("id must be a stable slug");
  if (!card?.setId) errors.push("setId is required");
  if (!String(card?.name || "").trim()) errors.push("name is required");
  if (!CARD_TYPES.has(card?.cardType)) errors.push("cardType is invalid");
  if (!Number.isInteger(card?.cost) || card.cost < 0) errors.push("cost must be a non-negative integer");
  if (card?.artPage != null && (!Number.isInteger(card.artPage) || card.artPage < 1)) errors.push("artPage is invalid");
  if (!Array.isArray(card?.tags)) errors.push("tags must be an array");
  if (!Array.isArray(card?.effects)) errors.push("effects must be an array");
  return errors;
}

export function validateDeckRecord(deck, cardsById) {
  const errors = [];
  if (!deck?.id || !deck?.heroId) errors.push("deck id and heroId are required");
  const seen = new Set();
  for (const entry of deck?.cards || []) {
    const key = `${entry.cardId}:${entry.zone || "main"}`;
    if (seen.has(key)) errors.push(`duplicate deck entry: ${key}`);
    seen.add(key);
    if (!cardsById.has(entry.cardId)) errors.push(`unknown card: ${entry.cardId}`);
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1) errors.push(`invalid quantity: ${entry.cardId}`);
  }
  return errors;
}
