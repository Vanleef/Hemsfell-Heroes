export const ACTIVE_ONLINE_SESSION_KEY = "hemsfell-active-room";
export const ONLINE_SESSION_PREFIX = "hemsfell-room-";

const validSession = (value, fallbackRoomId) => {
  if (!value || typeof value !== "object") return null;
  const roomId = typeof value.roomId === "string" && value.roomId ? value.roomId : fallbackRoomId;
  if (!roomId || typeof value.token !== "string" || !value.token) return null;
  return { roomId, token: value.token, isHost: value.isHost === true };
};

const readJson = (storage, key) => {
  try { return JSON.parse(storage.getItem(key) || "null"); }
  catch { return null; }
};

/**
 * Read credentials without coupling the application service to localStorage.
 * @param {Storage | null | undefined} storage
 * @param {string | null | undefined} [preferredRoomId]
 */
export function loadOnlineSession(storage, preferredRoomId = null) {
  if (!storage) return null;
  if (preferredRoomId) {
    const roomSession = validSession(readJson(storage, `${ONLINE_SESSION_PREFIX}${preferredRoomId}`), preferredRoomId);
    if (roomSession) return roomSession;
  }
  return validSession(readJson(storage, ACTIVE_ONLINE_SESSION_KEY));
}

/** @param {Storage | null | undefined} storage @param {unknown} session */
export function saveOnlineSession(storage, session) {
  const normalized = validSession(session);
  if (!storage || !normalized) return null;
  storage.setItem(`${ONLINE_SESSION_PREFIX}${normalized.roomId}`, JSON.stringify({ token: normalized.token, isHost: normalized.isHost }));
  storage.setItem(ACTIVE_ONLINE_SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

/** @param {Storage | null | undefined} storage @param {string | null | undefined} [roomId] */
export function clearOnlineSession(storage, roomId = null) {
  if (!storage) return;
  const active = validSession(readJson(storage, ACTIVE_ONLINE_SESSION_KEY));
  if (!roomId || active?.roomId === roomId) storage.removeItem(ACTIVE_ONLINE_SESSION_KEY);
  if (roomId) storage.removeItem(`${ONLINE_SESSION_PREFIX}${roomId}`);
}
