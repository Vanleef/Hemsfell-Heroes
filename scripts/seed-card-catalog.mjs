import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [input = "app/cards.generated.json", output = "supabase/seed/hemsfell-core.sql"] = process.argv.slice(2);
const cards = JSON.parse(readFileSync(input, "utf8"));
const quote = (value) => "'" + String(value ?? "").replaceAll("'", "''") + "'";
const slug = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rows = cards.map((card) => {
  const id = `hemsfell-core-${String(card.page).padStart(3, "0")}-${slug(card.name)}`;
  return `INSERT INTO public.cards (id, set_id, legacy_page, name, card_type, cost, attack, health, rules_text, tags, effects, art_page, is_image_card, is_published)
VALUES (${quote(id)}, 'hemsfell-core', ${card.page}, ${quote(card.name)}, ${quote(card.type)}, ${Number(card.cost || 0)}, ${card.atk ?? "NULL"}, ${card.hp ?? "NULL"}, ${quote(card.text)}, ${quote(JSON.stringify(card.tags || []))}::jsonb, '[]'::jsonb, ${card.page}, ${card.imageCard ? "true" : "false"}, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, card_type = EXCLUDED.card_type, cost = EXCLUDED.cost,
  attack = EXCLUDED.attack, health = EXCLUDED.health, rules_text = EXCLUDED.rules_text,
  tags = EXCLUDED.tags, art_page = EXCLUDED.art_page, is_image_card = EXCLUDED.is_image_card,
  updated_at = now();`;
});

const sql = [
  "-- Generated from app/cards.generated.json. Review effects, heroes and decks in Supabase.",
  "INSERT INTO public.card_sets (id, name, cards_pdf_url, is_active)",
  "VALUES ('hemsfell-core', 'Hemsfell Heroes — Coleção principal', 'https://drive.google.com/file/d/1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC/view', true)",
  "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cards_pdf_url = EXCLUDED.cards_pdf_url, updated_at = now();",
  ...rows,
  "",
].join("\n");

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, sql);
console.log(`Prepared ${cards.length} cards in ${output}`);
