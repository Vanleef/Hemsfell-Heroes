import type { Room, RoomRole } from "./machine";
export type { Room } from "./machine";

import { get, put } from "@vercel/blob";

const schema = "CREATE TABLE IF NOT EXISTS multiplayer_rooms (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)";

/* Local Next.js has no Worker binding. Keep this process-only fallback out of production. */
const developmentRooms = new Map<string, Room>();
const useDevelopmentMemory = () => process.env.NODE_ENV === "development" && process.env.HEMSFELL_ROOM_STORE !== "remote";

async function d1() {
  /* Resolve the Worker binding lazily. This keeps the production artifact
     importable by the Node-based validator while still using D1 at runtime. */
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Multiplayer database unavailable");
  await env.DB.prepare(schema).run();
  return env.DB;
}

const roomPath = (id: string) => `multiplayer-rooms/${id}.json`;

function usesVercelBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function readRoom(id: string): Promise<Room | null> {
  if (useDevelopmentMemory()) return structuredClone(developmentRooms.get(id) ?? null);
  if (usesVercelBlob()) {
    const result = await get(roomPath(id), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return JSON.parse(await new Response(result.stream).text()) as Room;
  }

  const db = await d1();
  const row = await db.prepare("SELECT payload FROM multiplayer_rooms WHERE id = ?").bind(id).first() as { payload: string } | null;
  return row ? JSON.parse(row.payload) as Room : null;
}

export async function writeRoom(room: Room) {
  if (useDevelopmentMemory()) {
    developmentRooms.set(room.id, structuredClone(room));
    return;
  }
  if (usesVercelBlob()) {
    await put(roomPath(room.id), JSON.stringify(room), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json",
    });
    return;
  }

  const db = await d1();
  await db.prepare("INSERT INTO multiplayer_rooms (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at")
    .bind(room.id, JSON.stringify(room), Date.now()).run();
}

type SecretZone = "hand" | "deck" | "extraDeck";

const hiddenCard = (index: number) => ({
  id: `hidden-${index}`,
  name: "Carta oculta",
  type: "Feitiço",
  cost: 0,
  text: "",
  tags: [],
  image: "",
  hero: false,
  imageCard: false,
  revealed: false,
});

/** The opponent needs zone counts, never the identities of hidden cards. */
function publicGameView(room: Room, role: RoomRole) {
  if (!room.game) return null;
  const game = structuredClone(room.game);
  const privateIndex = role === "host" ? 1 : 0;
  const opponent = game.players?.[privateIndex];
  if (opponent) {
    (["hand", "deck", "extraDeck"] as SecretZone[]).forEach((zone) => {
      if (Array.isArray(opponent[zone])) opponent[zone] = opponent[zone].map((_: unknown, index: number) => hiddenCard(index));
    });
  }
  return game;
}

/**
 * A sync from one player never becomes authoritative for the other player's
 * private zones. This blocks both accidental overwrites and client-side peeking.
 */
export function preserveOpponentSecrets(room: Room, nextGame: any, role: RoomRole) {
  if (!room.game || !nextGame) return nextGame;
  const privateIndex = role === "host" ? 1 : 0;
  const current = room.game.players?.[privateIndex];
  const incoming = nextGame.players?.[privateIndex];
  if (current && incoming) {
    (["hand", "deck", "extraDeck"] as SecretZone[]).forEach((zone) => {
      incoming[zone] = structuredClone(current[zone] ?? []);
    });
  }
  return nextGame;
}

export function roomView(room: Room, includeGame = false, role?: RoomRole | null) {
  return {
    id: room.id,
    host: { heroId: room.host.heroId, accepted: room.host.accepted, deckLocked: room.host.deckLocked, mulliganDone: room.host.mulliganDone, mulliganCount: room.host.mulliganCount },
    guest: room.guest ? { heroId: room.guest.heroId, accepted: room.guest.accepted, deckLocked: room.guest.deckLocked, mulliganDone: room.guest.mulliganDone, mulliganCount: room.guest.mulliganCount } : null,
    status: room.status,
    settings: room.settings,
    coinWinner: room.coinWinner,
    startingRole: room.startingRole,
    createdAt: room.createdAt,
    revision: room.revision,
    ...(includeGame ? { game: role ? publicGameView(room, role) : null } : {}),
  };
}

export function roleFor(room: Room, token: unknown): "host" | "guest" | null {
  if (typeof token !== "string") return null;
  if (token === room.host.token) return "host";
  if (token === room.guest?.token) return "guest";
  return null;
}
