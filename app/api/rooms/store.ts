import type { Room, RoomRole } from "./machine";
export type { Room } from "./machine";
import { get, put } from "@vercel/blob";

const memoryRooms = new Map<string, Room>();
const useMemoryStore = () => process.env.NODE_ENV === "development";
const privateSupabaseKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const normalizeSupabaseBaseUrl = (value?: string) => {
  if (!value) return "";
  const trimmed = value.trim().replace(/\/$/, "");
  return trimmed
    .replace(/\/(?:rest|storage|auth|functions)\/v1(?:\/.*)?$/i, "")
    .replace(/\/$/, "");
};
const jwtProjectRef = (key: string) => {
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return "";
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const ref = JSON.parse(json)?.ref;
    return typeof ref === "string" && /^[a-z0-9-]+$/i.test(ref) ? ref : "";
  } catch { return ""; }
};
const supabaseUrlCandidates = () => {
  const key = privateSupabaseKey();
  const candidates = [
    normalizeSupabaseBaseUrl(process.env.SUPABASE_URL),
    normalizeSupabaseBaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  ];
  const ref = jwtProjectRef(key);
  if (ref) candidates.push(`https://${ref}.supabase.co`);
  return [...new Set(candidates.filter(Boolean))];
};
const hasSupabaseStore = () => Boolean(privateSupabaseKey() && supabaseUrlCandidates().length);
const hasBlobStore = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const cloneMemory = (id: string) => structuredClone(memoryRooms.get(id) ?? null);
const unavailable = () => new Error("Multiplayer storage unavailable. Configure a valid Supabase project URL plus SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY, or a working BLOB_READ_WRITE_TOKEN.");
const roomPath = (id: string) => `multiplayer-rooms/${id}.json`;
const SUPABASE_ROOM_BUCKET = "hemsfell-multiplayer-rooms";
const supabaseRoomObjectPath = (id: string) => `rooms/${id}.json`;

type SupabaseConfig = { url: string; key: string };
let resolvedSupabaseConfig: Promise<SupabaseConfig> | null = null;

function authHeaders(key: string, extra: HeadersInit = {}) {
  const base: Record<string, string> = { apikey: key };
  // Legacy service_role keys are JWTs and can be used as bearer tokens. New
  // sb_secret_* keys authenticate through the apikey header and must not be
  // forced into an invalid Bearer token.
  if (key.split(".").length === 3) base.Authorization = `Bearer ${key}`;
  return { ...base, ...extra };
}

async function resolveSupabaseConfig(): Promise<SupabaseConfig> {
  if (resolvedSupabaseConfig) return resolvedSupabaseConfig;
  resolvedSupabaseConfig = (async () => {
    const key = privateSupabaseKey();
    if (!key) throw unavailable();
    const candidates = supabaseUrlCandidates();
    if (!candidates.length) throw unavailable();
    const failures: string[] = [];
    for (const url of candidates) {
      try {
        // PostgREST root is a cheap project-health probe. A valid project/key
        // combination responds here even if multiplayer_rooms is not created
        // yet; that lets us distinguish a bad project URL from a missing table.
        const response = await fetch(`${url}/rest/v1/`, {
          method: "GET",
          cache: "no-store",
          headers: authHeaders(key, { Accept: "application/openapi+json, application/json" }),
        });
        if (response.ok) return { url, key };
        failures.push(`${new URL(url).hostname}:${response.status}`);
      } catch (error) {
        failures.push(`${url}:${error instanceof Error ? error.message : "network error"}`);
      }
    }
    throw new Error(`Supabase project endpoint unavailable (${failures.join(", ") || "no candidates"})`);
  })().catch((error) => { resolvedSupabaseConfig = null; throw error; });
  return resolvedSupabaseConfig;
}

async function supabase(path: string, init: RequestInit = {}) {
  const { url, key } = await resolveSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...authHeaders(key, { "content-type": "application/json" }), ...(init.headers ?? {}) },
  });
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

async function supabaseStorage(path: string, init: RequestInit = {}) {
  const { url, key } = await resolveSupabaseConfig();
  return fetch(`${url}/storage/v1/${path}`, { ...init, cache: "no-store", headers: { ...authHeaders(key), ...(init.headers ?? {}) } });
}

let bucketReady: Promise<void> | null = null;
async function ensureSupabaseRoomBucket() {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const existing = await supabaseStorage(`bucket/${encodeURIComponent(SUPABASE_ROOM_BUCKET)}`);
    if (existing.ok) return;
    if (existing.status !== 404) throw new Error(`Supabase Storage bucket lookup failed (${existing.status})`);
    const created = await supabaseStorage("bucket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: SUPABASE_ROOM_BUCKET, name: SUPABASE_ROOM_BUCKET, public: false }),
    });
    if (!created.ok && created.status !== 409) throw new Error(`Supabase Storage bucket creation failed (${created.status})`);
  })().catch((error) => { bucketReady = null; throw error; });
  return bucketReady;
}

async function readSupabaseStorageRoom(id: string): Promise<Room | null> {
  await ensureSupabaseRoomBucket();
  const objectPath = supabaseRoomObjectPath(id).split("/").map(encodeURIComponent).join("/");
  const response = await supabaseStorage(`object/authenticated/${encodeURIComponent(SUPABASE_ROOM_BUCKET)}/${objectPath}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase Storage room read failed (${response.status})`);
  return JSON.parse(await response.text()) as Room;
}

async function writeSupabaseStorageRoom(room: Room) {
  await ensureSupabaseRoomBucket();
  if (room.revision > 0) {
    const current = await readSupabaseStorageRoom(room.id);
    const expectedRevision = room.revision - 1;
    if (!current || Number(current.revision) !== expectedRevision) throw new Error("stale room revision");
  }
  const objectPath = supabaseRoomObjectPath(room.id).split("/").map(encodeURIComponent).join("/");
  const response = await supabaseStorage(`object/${encodeURIComponent(SUPABASE_ROOM_BUCKET)}/${objectPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-upsert": "true" },
    body: JSON.stringify(room),
  });
  if (!response.ok) throw new Error(`Supabase Storage room write failed (${response.status})`);
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
  if (hasSupabaseStore()) {
    try { return await readSupabase(id); }
    catch (error) {
      console.warn("[rooms] Supabase table unavailable; trying Supabase Storage fallback.", error);
      try { return await readSupabaseStorageRoom(id); }
      catch (storageError) {
        if (!hasBlobStore()) throw storageError;
        console.warn("[rooms] Supabase unavailable; reading from Blob fallback.", storageError);
      }
    }
  }
  if (hasBlobStore()) return readBlob(id);
  throw unavailable();
}
export async function writeRoom(room: Room) {
  if (useMemoryStore()) { memoryRooms.set(room.id, structuredClone(room)); return; }
  if (hasSupabaseStore()) {
    try { return await writeSupabase(room); }
    catch (error) {
      console.warn("[rooms] Supabase table unavailable; trying Supabase Storage fallback.", error);
      try { return await writeSupabaseStorageRoom(room); }
      catch (storageError) {
        if (!hasBlobStore()) throw storageError;
        console.warn("[rooms] Supabase unavailable; writing to Blob fallback.", storageError);
      }
    }
  }
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
  return { id: room.id, host: { heroId: room.host.heroId, accepted: room.host.accepted, deckLocked: room.host.deckLocked, mulliganDone: room.host.mulliganDone, mulliganCount: room.host.mulliganCount, mulliganDeadline: room.host.mulliganDeadline ?? null, disconnectedAt: room.host.disconnectedAt ?? null }, guest: room.guest ? { heroId: room.guest.heroId, accepted: room.guest.accepted, deckLocked: room.guest.deckLocked, mulliganDone: room.guest.mulliganDone, mulliganCount: room.guest.mulliganCount, mulliganDeadline: room.guest.mulliganDeadline ?? null, disconnectedAt: room.guest.disconnectedAt ?? null } : null, status: room.status, settings: room.settings, coinWinner: room.coinWinner, startingRole: room.startingRole, createdAt: room.createdAt, revision: room.revision, ...(includeGame ? { game: role ? publicGameView(room, role) : null } : {}) };
}
export function roleFor(room: Room, token: unknown): "host" | "guest" | null {
  return typeof token === "string" && token === room.host.token ? "host" : typeof token === "string" && token === room.guest?.token ? "guest" : null;
}
