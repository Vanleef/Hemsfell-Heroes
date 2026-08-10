import { NextResponse } from "next/server";
import fallbackCards from "../../cards.generated.json";

type SupabaseCard = {
  id: string; legacy_page: number | null; name: string; card_type: string; cost: number;
  attack: number | null; health: number | null; rules_text: string; tags: string[];
  art_page: number | null; is_image_card: boolean;
};

const fallback = fallbackCards.map((card) => ({
  ...card,
  source: "local-fallback",
}));

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ source: "local-fallback", configured: false, cards: fallback });
  }

  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/cards?select=id,legacy_page,name,card_type,cost,attack,health,rules_text,tags,art_page,is_image_card&is_published=eq.true&order=legacy_page.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 60 } },
    );
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const rows = await response.json() as SupabaseCard[];
    return NextResponse.json({
      source: "supabase",
      configured: true,
      cards: rows.map((card) => ({
        id: card.id, page: card.legacy_page ?? card.art_page ?? 0, name: card.name,
        type: card.card_type, cost: card.cost, atk: card.attack ?? undefined, hp: card.health ?? undefined,
        text: card.rules_text, tags: card.tags || [], image: `drive://1gI26HASPp9KM_GtloaqBIj8ukY7Nq3CC/page/${String(card.art_page || card.legacy_page || 1).padStart(3, "0")}`,
        hero: card.card_type === "Herói", imageCard: card.is_image_card,
      })),
    });
  } catch (error) {
    return NextResponse.json({ source: "local-fallback", configured: true, error: "catalogue unavailable", cards: fallback });
  }
}
