import type { Room } from "./machine";
export type { Room } from "./machine";

import { get, put } from "@vercel/blob";

const schema = "CREATE TABLE IF NOT EXISTS multiplayer_rooms (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)";

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

export function roomView(room: Room, includeGame = false) {
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
    ...(includeGame ? { game: room.game } : {}),
  };
}

export function roleFor(room: Room, token: unknown): "host" | "guest" | null {
  if (typeof token !== "string") return null;
  if (token === room.host.token) return "host";
  if (token === room.guest?.token) return "guest";
  return null;
}
