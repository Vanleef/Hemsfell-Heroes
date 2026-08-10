import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/* Multiplayer rooms are intentionally compact JSON snapshots. A room lasts long
   enough for a play-test and survives Worker restarts and page reloads. */
export const multiplayerRooms = sqliteTable("multiplayer_rooms", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/*
 * Game content is independent from the PDF parser and can be maintained in the
 * Cloudflare D1 dashboard. The PDF URL is stored once per card collection.
 */
export const cardSets = sqliteTable("card_sets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cardsPdfUrl: text("cards_pdf_url").notNull(),
  releasedAt: integer("released_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  setId: text("set_id").notNull().references(() => cardSets.id),
  legacyPage: integer("legacy_page"),
  name: text("name").notNull(),
  cardType: text("card_type").notNull(),
  faction: text("faction"),
  cost: integer("cost").notNull().default(0),
  attack: integer("attack"),
  health: integer("health"),
  rulesText: text("rules_text").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  effects: text("effects").notNull().default("[]"),
  artPage: integer("art_page"),
  isImageCard: integer("is_image_card", { mode: "boolean" }).notNull().default(false),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("cards_set_legacy_page_unique").on(table.setId, table.legacyPage),
]);

export const heroes = sqliteTable("heroes", {
  id: text("id").primaryKey(),
  setId: text("set_id").notNull().references(() => cardSets.id),
  cardId: text("card_id").references(() => cards.id),
  name: text("name").notNull(),
  faction: text("faction").notNull(),
  presentation: text("presentation").notNull().default("{}"),
  progression: text("progression").notNull().default("[]"),
  abilities: text("abilities").notNull().default("[]"),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const decks = sqliteTable("decks", {
  id: text("id").primaryKey(),
  setId: text("set_id").notNull().references(() => cardSets.id),
  heroId: text("hero_id").notNull().references(() => heroes.id),
  name: text("name").notNull(),
  format: text("format").notNull().default("standard"),
  isStarter: integer("is_starter", { mode: "boolean" }).notNull().default(false),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const deckCards = sqliteTable("deck_cards", {
  deckId: text("deck_id").notNull().references(() => decks.id),
  cardId: text("card_id").notNull().references(() => cards.id),
  quantity: integer("quantity").notNull(),
  zone: text("zone").notNull().default("main"),
}, (table) => [
  uniqueIndex("deck_cards_deck_card_zone_unique").on(table.deckId, table.cardId, table.zone),
]);

export const contentRevisions = sqliteTable("content_revisions", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  summary: text("summary").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});
