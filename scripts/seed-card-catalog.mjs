import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [cardsInput = "app/cards.generated.json", output = "supabase/seed/hemsfell-core.sql"] = process.argv.slice(2);
const cards = JSON.parse(readFileSync(cardsInput, "utf8"));
const heroes = JSON.parse(readFileSync("content/heroes.json", "utf8")).heroes;
const deckOverrides = JSON.parse(readFileSync("content/decks.json", "utf8")).overrides;
const effectsByPage = JSON.parse(readFileSync("content/effect-overrides.json", "utf8")).byPage;
const setId = "hemsfell-core";
const pdfUrl = "https://drive.google.com/file/d/1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC/view?usp=sharing";
const quote = (value) => "'" + String(value ?? "").replaceAll("'", "''") + "'";
const json = (value) => quote(JSON.stringify(value ?? {})) + "::jsonb";
const slug = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cardId = (card) => `${setId}-${String(card.page).padStart(3, "0")}-${slug(card.name)}`;
const byPage = new Map(cards.map((card) => [card.page, card]));

function fallbackDeckEntries(hero) {
  const pool = cards.filter((card) => card.page >= hero.deckRange.from && card.page <= hero.deckRange.to && !card.hero && !card.imageCard);
  if (!pool.length) throw new Error(`No main-deck cards for ${hero.id}`);
  const entries = [];
  for (let index = 0; index < 49; index += 1) entries.push({ page: pool[index % pool.length].page, quantity: 1 });
  return entries;
}

function deckCounts(hero) {
  const entries = deckOverrides[hero.id]?.main || fallbackDeckEntries(hero);
  const counts = new Map();
  for (const entry of entries) {
    const card = byPage.get(entry.page);
    if (!card || card.imageCard || card.hero) throw new Error(`Invalid deck card on page ${entry.page} for ${hero.id}`);
    counts.set(entry.page, (counts.get(entry.page) || 0) + entry.quantity);
  }
  const total = [...counts.values()].reduce((sum, quantity) => sum + quantity, 0);
  if (total !== 49) throw new Error(`Deck ${hero.id} has ${total} cards; expected 49`);
  return counts;
}

const cardRows = cards.map((card) => {
  const effects = effectsByPage[String(card.page)] || [];
  return `INSERT INTO public.cards (id, set_id, legacy_page, name, card_type, cost, attack, health, rules_text, tags, effects, art_page, is_image_card, is_published)
VALUES (${quote(cardId(card))}, ${quote(setId)}, ${card.page}, ${quote(card.name)}, ${quote(card.type)}, ${Number(card.cost || 0)}, ${card.atk ?? "NULL"}, ${card.hp ?? "NULL"}, ${quote(card.text)}, ${json(card.tags || [])}, ${json(effects)}, ${card.page}, ${card.imageCard ? "true" : "false"}, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, card_type = EXCLUDED.card_type, cost = EXCLUDED.cost, attack = EXCLUDED.attack,
  health = EXCLUDED.health, rules_text = EXCLUDED.rules_text, tags = EXCLUDED.tags, effects = EXCLUDED.effects,
  art_page = EXCLUDED.art_page, is_image_card = EXCLUDED.is_image_card, updated_at = now();`;
});

const heroRows = heroes.map((hero) => {
  const heroCard = byPage.get(hero.heroPage);
  if (!heroCard) throw new Error(`Hero page missing: ${hero.heroPage}`);
  const progression = { ...hero.progression, heroPage: hero.heroPage, deckRange: hero.deckRange };
  return `INSERT INTO public.heroes (id, set_id, card_id, name, faction, presentation, progression, abilities, is_published)
VALUES (${quote(hero.id)}, ${quote(setId)}, ${quote(cardId(heroCard))}, ${quote(hero.name)}, ${quote(hero.faction)}, ${json(hero.presentation)}, ${json(progression)}, ${json(hero.abilities)}, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, faction = EXCLUDED.faction, presentation = EXCLUDED.presentation,
  progression = EXCLUDED.progression, abilities = EXCLUDED.abilities, updated_at = now();`;
});

const deckRows = heroes.map((hero) =>
  `INSERT INTO public.decks (id, set_id, hero_id, name, format, is_starter, is_published)
VALUES (${quote(`${hero.id}-starter`)}, ${quote(setId)}, ${quote(hero.id)}, ${quote(`Deck inicial de ${hero.name}`)}, 'standard', ${hero.isStarter ? "true" : "false"}, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, hero_id = EXCLUDED.hero_id, is_starter = EXCLUDED.is_starter, updated_at = now();`
);

const deckCardRows = heroes.flatMap((hero) => {
  const deckId = `${hero.id}-starter`;
  const mainRows = [...deckCounts(hero)].map(([page, quantity]) => {
    const card = byPage.get(page);
    return `INSERT INTO public.deck_cards (deck_id, card_id, quantity, zone)
VALUES (${quote(deckId)}, ${quote(cardId(card))}, ${quantity}, 'main')
ON CONFLICT (deck_id, card_id, zone) DO UPDATE SET quantity = EXCLUDED.quantity;`;
  });
  const extraRows = cards
    .filter((card) => card.page >= hero.deckRange.from && card.page <= hero.deckRange.to && card.imageCard)
    .map((card) => `INSERT INTO public.deck_cards (deck_id, card_id, quantity, zone)
VALUES (${quote(deckId)}, ${quote(cardId(card))}, 1, 'extra')
ON CONFLICT (deck_id, card_id, zone) DO UPDATE SET quantity = EXCLUDED.quantity;`);
  return [...mainRows, ...extraRows];
});

const sql = [
  "-- Generated from content/*.json and app/cards.generated.json. Do not edit this generated file.",
  "INSERT INTO public.card_sets (id, name, cards_pdf_url, is_active)",
  `VALUES (${quote(setId)}, 'Hemsfell Heroes — Coleção principal', ${quote(pdfUrl)}, true)`,
  "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cards_pdf_url = EXCLUDED.cards_pdf_url, updated_at = now();",
  ...cardRows, ...heroRows, ...deckRows, ...deckCardRows, "",
].join("\n");

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, sql);
console.log(`Prepared ${cards.length} cards, ${heroes.length} heroes and ${heroes.length} decks in ${output}`);
