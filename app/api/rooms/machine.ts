export type RoomRole = "host" | "guest";
export type RoomStatus = "waiting" | "deck-selection" | "coin-choice" | "mulligan" | "started" | "finished";

export type MatchSettings = {
  startingLife: number;
  responseSeconds: number;
  turnSeconds: number;
};

export type Participant = {
  heroId: string | null;
  token: string;
  accepted: boolean;
  deckLocked: boolean;
  mulliganDone: boolean;
  mulliganCount: number;
};

export type Room = {
  id: string;
  host: Participant;
  guest: Participant | null;
  status: RoomStatus;
  settings: MatchSettings;
  createdAt: number;
  revision: number;
  coinWinner: RoomRole | null;
  startingRole: RoomRole | null;
  game: any | null;
};

export const defaultSettings: MatchSettings = { startingLife: 30, responseSeconds: 30, turnSeconds: 120 };

export function sanitizeSettings(value: Partial<MatchSettings> | undefined): MatchSettings {
  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Math.round(Number(n)) : fallback));
  return {
    startingLife: clamp(value?.startingLife, 10, 100, 30),
    responseSeconds: clamp(value?.responseSeconds, 10, 120, 30),
    turnSeconds: clamp(value?.turnSeconds, 30, 600, 120),
  };
}

export function participant(token: string, accepted = true): Participant {
  return { heroId: null, token, accepted, deckLocked: false, mulliganDone: false, mulliganCount: 0 };
}

export function bothDecksLocked(room: Room) {
  return !!room.guest?.accepted && room.host.deckLocked && room.guest.deckLocked && !!room.host.heroId && !!room.guest.heroId;
}

export function prepareCoin(room: Room, random = Math.random) {
  if (!bothDecksLocked(room) || room.coinWinner) return false;
  room.coinWinner = random() < .5 ? "host" : "guest";
  room.status = "coin-choice";
  return true;
}

export function orientIndex(role: RoomRole, canonicalIndex: 0 | 1): 0 | 1 {
  return role === "host" ? canonicalIndex : canonicalIndex === 0 ? 1 : 0;
}

export function deadline(seconds: number) {
  return Date.now() + seconds * 1000;
}

export function applyTimeout(room: Room) {
  if (!room.game || room.status !== "started") return false;
  const now = Date.now();
  if (room.game.pendingResponse?.deadline && room.game.pendingResponse.deadline <= now) {
    room.game.pendingResponse = null;
    room.game.events = (room.game.events ?? 0) + 1;
    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de resposta terminou; a prioridade voltou ao jogador da vez.", tone: "response" }, ...(room.game.log ?? [])];
    return true;
  }
  if (room.game.turnDeadline && room.game.turnDeadline <= now) {
    room.game.active = room.game.active === 0 ? 1 : 0;
    room.game.phase = "manutencao";
    room.game.round = (room.game.round ?? 1) + 1;
    room.game.pendingResponse = null;
    room.game.combatAction = null;
    room.game.turnDeadline = deadline(room.settings.turnSeconds);
    room.game.events = (room.game.events ?? 0) + 1;
    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo do turno terminou. O turno passou automaticamente.", tone: "phase" }, ...(room.game.log ?? [])];
    return true;
  }
  return false;
}

export function canSync(room: Room, role: RoomRole, nextGame: any, baseRevision: unknown) {
  if (Number(baseRevision) !== room.revision) return { ok: false, status: 409, error: "stale revision" };
  if (!room.game || !nextGame) return { ok: false, status: 409, error: "room not started" };
  const pending = room.game.pendingResponse;
  const roleIndex = role === "host" ? 0 : 1;
  if (pending) {
    if (pending.actor === roleIndex) return { ok: false, status: 423, error: "waiting for opponent response" };
    if (pending.responder !== roleIndex) return { ok: false, status: 403, error: "response belongs to opponent" };
    if (nextGame.pendingResponse && nextGame.pendingResponse.responder === pending.responder) {
      return { ok: false, status: 400, error: "response must resolve or pass priority" };
    }
  } else if (room.game.active !== roleIndex && !nextGame.pendingResponse) {
    return { ok: false, status: 403, error: "not your priority" };
  }
  return { ok: true, status: 200, error: "" };
}
