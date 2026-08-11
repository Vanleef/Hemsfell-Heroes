/**
 * Boundary validation for multiplayer HTTP requests.
 *
 * The game is a prototype, but the API must still reject oversized and
 * prototype-polluting payloads before they reach the persistent room state.
 */
import { ROOM_LIMITS } from "./constants";

export const MAX_ROOM_PAYLOAD_BYTES = ROOM_LIMITS.payloadBytes;
const MAX_DEPTH = 32;
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

type JsonRecord = Record<string, unknown>;

export function isPlainRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeJson(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.length <= 1_000 && value.every((item) => isSafeJson(item, depth + 1));
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => !forbiddenKeys.has(key) && isSafeJson(item, depth + 1));
}

export async function readSafeJson(request: Request): Promise<{ body?: JsonRecord; error?: string }> {
  const advertisedSize = Number(request.headers.get("content-length") || 0);
  if (advertisedSize > MAX_ROOM_PAYLOAD_BYTES) return { error: "payload too large" };
  const raw = await request.text();
  if (raw.length > MAX_ROOM_PAYLOAD_BYTES) return { error: "payload too large" };
  try {
    const body: unknown = JSON.parse(raw || "{}");
    return isPlainRecord(body) && isSafeJson(body) ? { body } : { error: "invalid request body" };
  } catch {
    return { error: "invalid JSON" };
  }
}

export function isRoomId(value: string): boolean {
  return /^room-[a-z0-9]+-[a-f0-9]{8}$/i.test(value);
}

/**
 * A structural guard, not a rules engine. Rules remain server-checked by the
 * room machine; this only bounds data written to durable storage.
 */
export function isBoundedGame(value: unknown): value is JsonRecord {
  if (!isPlainRecord(value) || !isSafeJson(value)) return false;
  const players = value.players;
  if (!Array.isArray(players) || players.length !== 2) return false;
  return players.every((player) => {
    if (!isPlainRecord(player)) return false;
    return Object.entries(ROOM_LIMITS.zones).every(([zone, max]) =>
      Array.isArray(player[zone]) && player[zone].length <= max,
    );
  });
}

