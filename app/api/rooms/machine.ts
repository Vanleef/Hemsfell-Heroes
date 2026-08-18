import { ROOM_LIMITS } from "./constants";
import { executeOnlineCommand } from "../../rules-engine/online-priority-engine.mjs";
import { shouldAutoPass } from "../../rules-engine/priority.mjs";

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
  mulliganDeadline?: number | null;
  disconnectedAt?: number | null;
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

export const defaultSettings: MatchSettings = {
  startingLife: ROOM_LIMITS.life.fallback,
  responseSeconds: ROOM_LIMITS.responseSeconds.fallback,
  turnSeconds: ROOM_LIMITS.turnSeconds.fallback,
};

export function sanitizeSettings(value: Partial<MatchSettings> | Record<string, unknown> | undefined): MatchSettings {
  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Math.round(Number(n)) : fallback));
  return {
    startingLife: clamp(value?.startingLife, ROOM_LIMITS.life.min, ROOM_LIMITS.life.max, ROOM_LIMITS.life.fallback),
    responseSeconds: clamp(value?.responseSeconds, ROOM_LIMITS.responseSeconds.min, ROOM_LIMITS.responseSeconds.max, ROOM_LIMITS.responseSeconds.fallback),
    turnSeconds: clamp(value?.turnSeconds, ROOM_LIMITS.turnSeconds.min, ROOM_LIMITS.turnSeconds.max, ROOM_LIMITS.turnSeconds.fallback),
  };
}

export function participant(token: string, accepted = true): Participant {
  return { heroId: null, token, accepted, deckLocked: false, mulliganDone: false, mulliganCount: 0, disconnectedAt: null };
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
  if (room.game && room.status === "mulligan") {
    const now = Date.now(); let changed = false;
    for (const role of ["host", "guest"] as const) {
      const current = room[role];
      if (current && !current.mulliganDone && current.mulliganDeadline && current.mulliganDeadline <= now) {
        current.mulliganDone = true; current.mulliganDeadline = null; changed = true;
      }
    }
    if (room.host.mulliganDone && room.guest?.mulliganDone) {
      room.status = "started"; room.game.turnDeadline = deadline(room.settings.turnSeconds); changed = true;
      room.game.log = [{ id: crypto.randomUUID(), text: "O tempo da mão inicial terminou. As mãos não confirmadas foram mantidas automaticamente.", tone: "phase" }, ...(room.game.log ?? [])];
    }
    return changed;
  }
  if (!room.game || room.status !== "started") return false;
  const now = Date.now();
  const disconnected = room.host.disconnectedAt ? { role: "host" as RoomRole, at: room.host.disconnectedAt } : room.guest?.disconnectedAt ? { role: "guest" as RoomRole, at: room.guest.disconnectedAt } : null;
  if (disconnected) {
    if (disconnected.at + 60_000 > now) return false;
    const loser = disconnected.role === "host" ? 0 : 1;
    room.game.winner = loser === 0 ? 1 : 0;
    room.game.pendingResponse = null;
    room.game.combatAction = null;
    room.status = "finished";
    room.game.events = (room.game.events ?? 0) + 1;
    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de reconexão terminou. A partida foi encerrada.", tone: "danger" }, ...(room.game.log ?? [])];
    return true;
  }
  if (room.game.pendingResponse?.deadline && room.game.pendingResponse.deadline <= now) {
    const pending = room.game.pendingResponse; const owner = pending.responder;
    try { const result = executeOnlineCommand(room.game, { type: "passPriority", owner, auto: true }, { priority: true }); room.game = result.state; } catch { return false; }
    if (room.game.pendingResponse) room.game.pendingResponse.deadline = deadline(room.settings.responseSeconds);
    room.game.events = (room.game.events ?? 0) + 1;
    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de resposta terminou; a prioridade foi passada automaticamente.", tone: "response" }, ...(room.game.log ?? [])];
    return true;
  }
  if (room.game.turnDeadline && room.game.turnDeadline <= now) {
    /* A turn timeout may request a legal phase transition, but it must never
       erase a live stack/decision/combat exchange by teleporting directly to
       the opponent's Maintenance. Interactive checkpoints keep their state and
       are handled by their own response/decision flow. */
    if (!room.game.pendingDecision && !room.game.pendingReposition && !room.game.combatAction && ["principal", "combate", "fim"].includes(room.game.phase)) {
      try {
        const owner = room.game.active;
        const result = executeOnlineCommand(room.game, { type: "advancePhase", owner, auto: true }, { priority: true });
        room.game = result.state;
        if (room.game.pendingResponse) room.game.pendingResponse.deadline = deadline(room.settings.responseSeconds);
        else room.game.turnDeadline = deadline(room.settings.turnSeconds);
        room.game.events = (room.game.events ?? 0) + 1;
        room.game.log = [{ id: crypto.randomUUID(), text: "O tempo da etapa terminou; foi solicitada a passagem pelo fluxo normal de prioridade.", tone: "phase" }, ...(room.game.log ?? [])];
        return true;
      } catch { return false; }
    }
    return false;
  }
  return false;
}

export function applySafeAutoPass(room: Room, role: RoomRole, control: "assisted" | "full-control" = "assisted") {
  if (!room.game || room.status !== "started") return false;
  const owner = role === "host" ? 0 : 1;
  if (!shouldAutoPass(room.game, owner, control)) return false;
  const result = executeOnlineCommand(room.game, { type: "passPriority", owner, auto: true }, { priority: true });
  room.game = result.state;
  if (room.game.pendingResponse) room.game.pendingResponse.deadline = deadline(room.settings.responseSeconds);
  room.revision++;
  return true;
}

export function canSync(room: Room, role: RoomRole, nextGame: any, baseRevision: unknown) {
  if (Number(baseRevision) !== room.revision) return { ok: false, status: 409, error: "stale revision" };
  if (!room.game || !nextGame) return { ok: false, status: 409, error: "room not started" };
  const pending = room.game.pendingResponse;
  const roleIndex = role === "host" ? 0 : 1;
  if (pending) {
    if (pending.responder !== roleIndex) return { ok: false, status: 403, error: "response belongs to opponent" };
    if (nextGame.pendingResponse && nextGame.pendingResponse.responder === pending.responder) {
      return { ok: false, status: 400, error: "response must resolve, add to stack, or pass priority" };
    }
  } else if (room.game.active !== roleIndex && !nextGame.pendingResponse) {
    return { ok: false, status: 403, error: "not your priority" };
  }
  return { ok: true, status: 200, error: "" };
}

const AUTHORITATIVE_COMMANDS = new Set(["playCard", "activate", "activateHero", "declareAttack", "declareAttackers", "declareBlockers", "selectDefender", "attack", "advancePhase", "resolveDecision", "reposition", "confirmReposition", "passPriority"]);

/** Server-authoritative command path. The server owns the player index,
 * validates room revision and routes Online timing through one priority kernel. */
export function applyRulesCommand(room: Room, role: RoomRole, rawCommand: Record<string, unknown>, baseRevision: unknown) {
  if (room.status !== "started" || !room.game) return { ok: false, status: 409, error: "room not started" };
  if (Number(baseRevision) !== room.revision) return { ok: false, status: 409, error: "stale revision" };
  if (!AUTHORITATIVE_COMMANDS.has(String(rawCommand.type || ""))) return { ok: false, status: 400, error: "unsupported command" };
  const owner = role === "host" ? 0 : 1;
  try {
    const command: Record<string, any> = { ...rawCommand, owner };
    if (command.type === "attack") {
      const combat = room.game.combatAction;
      if (!combat || combat.stage !== "charging" || combat.attackerOwner !== owner || combat.attackerUid !== command.attackerId || (!!combat.targetHero !== !command.defenderId) || (combat.defenderUid || undefined) !== (command.defenderId || undefined)) return { ok: false, status: 409, error: "combat state mismatch" };
      command.skipPriority = true;
    }
    const result = executeOnlineCommand(room.game, command, { priority: true });
    room.game = result.state;
    if (room.game.pendingResponse && !room.game.pendingResponse.deadline) room.game.pendingResponse.deadline = deadline(room.settings.responseSeconds);
    room.game.turnDeadline = deadline(room.settings.turnSeconds);
    room.revision++;
    return { ok: true, status: 200, error: "", trace: result.trace };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid command";
    return { ok: false, status: 400, error: message };
  }
}
