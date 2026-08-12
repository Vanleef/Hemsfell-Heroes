import type { Room, RoomRole } from "./machine";
export type { Room } from "./machine";
import { get, put } from "@vercel/blob";

const memoryRooms = new Map<string, Room>();
const configuredStore = () => process.env.HEMSFELL_ROOM_STORE;
const useMemoryStore = () => process.env.NODE_ENV === "development";
const hasSupabaseStore = () => Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));
const hasBlobStore = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const cloneMemory = (id: string) => structuredClone(memoryRooms.get(id) ?? null);
const unavailable = () => new Error("Multiplayer storage unavailable. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or BLOB_READ_WRITE_TOKEN).");
const roomPath = (id: string) => `multiplayer-rooms/${id}.json`;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw unavailable();
  return { url, key };
}
async function supabase(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Supabase room store failed (${response.status})`);
  return response;
}
async function readSupabase(id: string) {
  const response = await supabase(`multiplayer_rooms?id=eq.${encodeURIComponent(id)}&select=payload,revision&limit=1`);
  const rows = await response.json() as Array<{ payload: string; revision?: number }>;
  if (rows[0]?.revision != null) {
    const parsed = JSON.parse(rows[0].payload) as Room;
    parsed.revision = Number(rows[0].revision);
    return parsed;
  }
  return rows[0] ? JSON.parse(rows[0].payload) as Room : null;
}
async function writeSupabase(room: Room) {
  // Room revisions are compared by PostgREST in the database. This prevents
  // two serverless requests that read the same revision from silently
  // overwriting each other (lost-update race).
  if (room.revision === 0) {
    await supabase("multiplayer_rooms?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ id: room.id, payload: JSON.stringify(room), revision: room.revision, updated_at: new Date().toISOString() }) });
    return;
  }
  const expectedRevision = room.revision - 1;
  const response = await supabase(`multiplayer_rooms?id=eq.${encodeURIComponent(room.id)}&revision=eq.${expectedRevision}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ payload: JSON.stringify(room), revision: room.revision, updated_at: new Date().toISOString() }) });
  const rows = await response.json() as unknown[];
  if (!rows.length) throw new Error("stale room revision");
}
async function readBlob(id: string) {
  const result = await get(roomPath(id), { access: "private", useCache: false });
  return result?.statusCode === 200 ? JSON.parse(await new Response(result.stream).text()) as Room : null;
}
async function writeBlob(room: Room) {
  await put(roomPath(room.id), JSON.stringify(room), { access: "private", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0, contentType: "application/json" });
}

export async function readRoom(id: string): Promise<Room | null> {
  if (useMemoryStore()) return cloneMemory(id);
  if (hasSupabaseStore()) return readSupabase(id);
  if (hasBlobStore()) return readBlob(id);
  throw unavailable();
}
export async function writeRoom(room: Room) {
  if (useMemoryStore()) { memoryRooms.set(room.id, structuredClone(room)); return; }
  if (hasSupabaseStore()) return writeSupabase(room);
  if (hasBlobStore()) return writeBlob(room);
  throw unavailable();
}

type SecretZone = "hand" | "deck" | "extraDeck";
const hiddenCard = (index: number) => ({ id: `hidden-${index}`, name: "Carta oculta", type: "Feitiço", cost: 0, text: "", tags: [], image: "", hero: false, imageCard: false, revealed: false });
function publicGameView(room: Room, role: RoomRole) {
  if (!room.game) return null;
  const game = structuredClone(room.game); const opponent = game.players?.[role === "host" ? 1 : 0];
  if (opponent) (["hand", "deck", "extraDeck"] as SecretZone[]).forEach((zone) => { if (Array.isArray(opponent[zone])) opponent[zone] = opponent[zone].map((_: unknown, index: number) => hiddenCard(index)); });
  return game;
}
export function preserveOpponentSecrets(room: Room, nextGame: any, role: RoomRole) {
  if (!room.game || !nextGame) return nextGame;
  const index = role === "host" ? 1 : 0, current = room.game.players?.[index], incoming = nextGame.players?.[index];
  if (current && incoming) (["hand", "deck", "extraDeck"] as SecretZone[]).forEach((zone) => { incoming[zone] = structuredClone(current[zone] ?? []); });
  return nextGame;
}
export function roomView(room: Room, includeGame = false, role?: RoomRole | null) {
  return { id: room.id, host: { heroId: room.host.heroId, accepted: room.host.accepted, deckLocked: room.host.deckLocked, mulliganDone: room.host.mulliganDone, mulliganCount: room.host.mulliganCount, disconnectedAt: room.host.disconnectedAt ?? null }, guest: room.guest ? { heroId: room.guest.heroId, accepted: room.guest.accepted, deckLocked: room.guest.deckLocked, mulliganDone: room.guest.mulliganDone, mulliganCount: room.guest.mulliganCount, disconnectedAt: room.guest.disconnectedAt ?? null } : null, status: room.status, settings: room.settings, coinWinner: room.coinWinner, startingRole: room.startingRole, createdAt: room.createdAt, revision: room.revision, ...(includeGame ? { game: role ? publicGameView(room, role) : null } : {}) };
}
export function roleFor(room: Room, token: unknown): "host" | "guest" | null {
  return typeof token === "string" && token === room.host.token ? "host" : typeof token === "string" && token === room.guest?.token ? "guest" : null;
}

