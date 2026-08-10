import { NextResponse } from "next/server";
import fallbackCards from "../../cards.generated.json";
import { adaptCatalogCard } from "../../game-content.mjs";

type SupabaseCard = {
  id: string; set_id: string; legacy_page: number | null; name: string; card_type: string;
  faction: string | null; cost: number; attack: number | null; health: number | null;
  rules_text: string; tags: string[]; effects: unknown[]; art_page: number | null; is_image_card: boolean;
};
type SupabaseHero = { id: string; set_id: string; card_id: string | null; name: string; faction: string; presentation: unknown; progression: unknown; abilities: unknown[]; };
type SupabaseDeck = { id: string; set_id: string; hero_id: string; name: string; format: string; is_starter: boolean; };
type SupabaseDeckCard = { deck_id: string; card_id: string; quantity: number; zone: "main" | "extra"; };

const fallback = fallbackCards.map((card) => ({ ...card, source: "local-fallback" }));
const select = {
  cards: "id,set_id,legacy_page,name,card_type,faction,cost,attack,health,rules_text,tags,effects,art_page,is_image_card",
  heroes: "id,set_id,card_id,name,faction,presentation,progression,abilities",
  decks: "id,set_id,hero_id,name,format,is_starter",
  deckCards: "deck_id,card_id,quantity,zone",
  sets: "id,name,cards_pdf_url,released_at",
};

async function readTable<T>(url: string, key: string, table: string, columns: string) {
  const response = await fetch(
    `${url}/rest/v1/${table}?select=${columns}&order=id.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 60 } },
  );
  if (!response.ok) throw new Error(`Supabase ${table} returned ${response.status}`);
  return response.json() as Promise<T[]>;
}

export async function GET() {
  const sourceUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!sourceUrl || !key) {
    return NextResponse.json({ source: "local-fallback", configured: false, cards: fallback, heroes: [], decks: [], deckCards: [], sets: [] });
  }

  try {
    const [cards, heroes, decks, deckCards, sets] = await Promise.all([
      readTable<SupabaseCard>(sourceUrl, key, "cards", select.cards),
      readTable<SupabaseHero>(sourceUrl, key, "heroes", select.heroes),
      readTable<SupabaseDeck>(sourceUrl, key, "decks", select.decks),
      readTable<SupabaseDeckCard>(sourceUrl, key, "deck_cards", select.deckCards),
      readTable<Record<string, unknown>>(sourceUrl, key, "card_sets", select.sets),
    ]);
    return NextResponse.json({
      source: "supabase", configured: true,
      cards: cards.map((card) => adaptCatalogCard(card)),
      heroes, decks, deckCards, sets,
    });
  } catch (error) {
    console.error("[catalog] Supabase unavailable", error);
    return NextResponse.json({ source: "local-fallback", configured: true, error: "catalogue unavailable", cards: fallback, heroes: [], decks: [], deckCards: [], sets: [] });
  }
}
