import { readFileSync, writeFileSync } from "node:fs";

const [input = "app/cards.generated.json", output = "drizzle/seeds/hemsfell-core.sql"] = process.argv.slice(2);
const cards = JSON.parse(readFileSync(input, "utf8"));
const now = "strftime('%s','now') * 1000";
const quote = (value) => "'" + String(value ?? "").replaceAll("'", "''") + "'";
const slug = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rows = cards.map((card) => {
  const id = `hemsfell-core-${String(card.page).padStart(3, "0")}-${slug(card.name)}`;
  return `INSERT OR REPLACE INTO cards (id, set_id, legacy_page, name, card_type, cost, attack, health, rules_text, tags, effects, art_page, is_image_card, is_published, created_at, updated_at)
VALUES (${quote(id)}, 'hemsfell-core', ${card.page}, ${quote(card.name)}, ${quote(card.type)}, ${Number(card.cost || 0)}, ${card.atk ?? "NULL"}, ${card.hp ?? "NULL"}, ${quote(card.text)}, ${quote(JSON.stringify(card.tags || []))}, '[]', ${card.page}, ${card.imageCard ? 1 : 0}, 1, ${now}, ${now});`;
});

const sql = [
  "-- Generated from app/cards.generated.json; edit content/effects in D1 afterwards.",
  "INSERT OR REPLACE INTO card_sets (id, name, cards_pdf_url, is_active, created_at, updated_at)",
  `VALUES ('hemsfell-core', 'Hemsfell Heroes — Coleção principal', 'https://drive.google.com/file/d/1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC/view', 1, ${now}, ${now});`,
  ...rows,
  "",
].join("\n");

writeFileSync(output, sql);
console.log(`Prepared ${cards.length} cards in ${output}`);
