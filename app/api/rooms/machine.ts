import { ROOM_LIMITS } from "./constants";
import { reconcileOnlineClocks } from "./online-clock.mjs";
import { executeOnlineCommand } from "../../rules-engine/online-priority-engine.mjs";
import { listPendingIndomitableAttackers } from "../../rules-engine/combat.mjs";
import { shouldAutoPass } from "../../rules-engine/priority.mjs";
import { logOnlineDiagnostic } from "./online-diagnostics.mjs";

/* `executeOnlineCommand` is the Online timing wrapper around the authoritative
 * rules-engine executeCommand path; room clients still never mutate rules
 * state directly. */

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
  recentCommandIds?: string[];
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
  /** Shared pause origin. If both tabs disconnect, deadlines are shifted once
   * when the room becomes fully connected again instead of once per player. */
  pauseStartedAt?: number | null;
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
  return { heroId: null, token, accepted, deckLocked: false, mulliganDone: false, mulliganCount: 0, disconnectedAt: null, recentCommandIds: [] };
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

function earliestDisconnected(room: Room): { role: RoomRole; at: number } | null {
  const candidates: Array<{ role: RoomRole; at: number }> = [];
  if (room.host.disconnectedAt) candidates.push({ role: "host", at: room.host.disconnectedAt });
  if (room.guest?.disconnectedAt) candidates.push({ role: "guest", at: room.guest.disconnectedAt });
  return candidates.sort((a, b) => a.at - b.at)[0] ?? null;
}

export function reconnectPause(room: Room, now = Date.now()): { role: RoomRole; until: number } | null {
  const disconnected = earliestDisconnected(room);
  if (!disconnected) return null;
  const until = disconnected.at + 60_000;
  return until > now ? { role: disconnected.role, until } : null;
}

function finishDisconnectedMatch(room: Room, loser: 0 | 1) {
  const game = room.game;
  if (!game) return;
  game.winner = loser === 0 ? 1 : 0;
  game.pendingResponse = null;
  game.pendingAction = undefined;
  game.priorityStack = undefined;
  game.stack = [];
  game.combatAction = null;
  game.onlineCombat = undefined;
  game.onlineFinalization = undefined;
  game.pendingDecision = null;
  game.pendingReposition = null;
  game.turnDeadline = null;
  delete game.turnTimeRemainingMs;
  game.priority = {
    ...(game.priority || {}),
    model: game.priority?.model || "online-v3",
    mode: "none",
    owner: null,
    window: null,
    consecutivePasses: 0,
    deadline: null,
    stackDepth: 0,
  };
  room.pauseStartedAt = null;
  room.status = "finished";
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
  const disconnected = earliestDisconnected(room);
  if (disconnected) {
    if (disconnected.at + 60_000 > now) return false;
    const loser = (disconnected.role === "host" ? 0 : 1) as 0 | 1;
    finishDisconnectedMatch(room, loser);
    room.game.events = (room.game.events ?? 0) + 1;
    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de reconexão terminou. A partida foi encerrada.", tone: "danger" }, ...(room.game.log ?? [])];
    logOnlineDiagnostic(room, "reconnect-expired", { role: disconnected.role });
    return true;
  }

  /* Recovered legacy rooms can contain an interaction with no absolute
     deadline. Seed it once on the server so a refresh cannot create an
     immortal priority/blocker window. */
  let seededDeadline = false;
  if (room.game.pendingResponse && !Number.isFinite(Number(room.game.pendingResponse.deadline))) {
    room.game.pendingResponse.deadline = now + room.settings.responseSeconds * 1000;
    if (room.game.priority) room.game.priority.deadline = room.game.pendingResponse.deadline;
    seededDeadline = true;
  }
  if (room.game.combatAction?.stage === "choosing" && room.game.combatAction.blockCommitted !== true && !Number.isFinite(Number(room.game.combatAction.deadline))) {
    room.game.combatAction.deadline = now + room.settings.responseSeconds * 1000;
    if (room.game.priority) room.game.priority.deadline = room.game.combatAction.deadline;
    seededDeadline = true;
  }

  if (room.game.pendingResponse) {
    if (room.game.pendingResponse.deadline > now) return seededDeadline;
    const before = room.game;
    const owner = before.pendingResponse.responder;
    try {
      const result = executeOnlineCommand(before, { type: "passPriority", owner, auto: true }, { priority: true });
      room.game = result.state;
      reconcileOnlineClocks(before, room.game, room.settings, now);
    } catch { return seededDeadline; }
    room.game.events = (room.game.events ?? 0) + 1;
    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de resposta terminou; a prioridade foi passada automaticamente.", tone: "response" }, ...(room.game.log ?? [])];
    logOnlineDiagnostic(room, "response-timeout", { role: owner === 0 ? "host" : "guest", commandType: "passPriority", auto: true });
    return true;
  }

  if (room.game.combatAction?.stage === "choosing" && room.game.combatAction.blockCommitted !== true) {
    if (room.game.combatAction.deadline > now) return seededDeadline;
    const before = room.game;
    const owner = 1 - before.combatAction.attackerOwner;
    try {
      const result = executeOnlineCommand(before, { type: "selectDefender", owner, targetHero: true, auto: true }, { priority: true });
      room.game = result.state;
      reconcileOnlineClocks(before, room.game, room.settings, now);
    } catch { return seededDeadline; }
    room.game.events = (room.game.events ?? 0) + 1;
    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo para bloquear terminou; este ataque seguiu sem bloqueio.", tone: "combat" }, ...(room.game.log ?? [])];
    logOnlineDiagnostic(room, "blocker-timeout", { role: owner === 0 ? "host" : "guest", commandType: "selectDefender", auto: true });
    return true;
  }

  if (room.game.pendingDecision || room.game.pendingReposition) return seededDeadline;

  if (room.game.turnDeadline && room.game.turnDeadline <= now) {
    if (!room.game.combatAction && ["principal", "combate", "fim"].includes(room.game.phase)) {
      try {
        const before = room.game;
        const owner = before.active;
        const mandatory = before.phase === "combate" ? listPendingIndomitableAttackers(before, owner) : [];
        const command = mandatory.length
          ? { type: "declareAttack", owner, attackerId: mandatory[0].uid || mandatory[0].id, auto: true }
          : { type: "advancePhase", owner, auto: true };
        const result = executeOnlineCommand(before, command, { priority: true });
        room.game = result.state;
        reconcileOnlineClocks(before, room.game, room.settings, now);
        room.game.events = (room.game.events ?? 0) + 1;
        const forcedAttack = command.type === "declareAttack";
        room.game.log = [{ id: crypto.randomUUID(), text: forcedAttack ? "O tempo da etapa terminou; uma criatura com Indomável iniciou seu ataque obrigatório." : "O tempo da etapa terminou; foi solicitada a passagem pelo fluxo normal de prioridade.", tone: forcedAttack ? "combat" : "phase" }, ...(room.game.log ?? [])];
        logOnlineDiagnostic(room, "turn-timeout", { role: owner === 0 ? "host" : "guest", commandType: command.type, auto: true });
        return true;
      } catch { return seededDeadline; }
    }
    return seededDeadline;
  }
  return seededDeadline;
}

export function applySafeAutoPass(room: Room, role: RoomRole, control: "assisted" | "full-control" = "assisted") {
  if (!room.game || room.status !== "started" || reconnectPause(room)) return false;
  const owner = role === "host" ? 0 : 1;
  if (!shouldAutoPass(room.game, owner, control)) return false;
  const before = room.game;
  const result = executeOnlineCommand(before, { type: "passPriority", owner, auto: true }, { priority: true });
  room.game = result.state;
  reconcileOnlineClocks(before, room.game, room.settings);
  room.revision++;
  return true;
}

/** Deprecated compatibility guard retained for old tests/tools. HTTP gameplay
 * no longer accepts complete state snapshots; only applyRulesCommand mutates a
 * started match. */
export function canSync(room: Room, role: RoomRole, nextGame: any, baseRevision: unknown) {
  if (Number(baseRevision) !== room.revision) return { ok: false, status: 409, error: "stale revision" };
  if (!room.game || !nextGame) return { ok: false, status: 409, error: "room not started" };
  if (reconnectPause(room)) return { ok: false, status: 409, error: "match paused for reconnect" };
  const pending = room.game.pendingResponse;
  const roleIndex = role === "host" ? 0 : 1;
  if (pending) {
    if (pending.responder !== roleIndex) return { ok: false, status: 403, error: pending.actor === roleIndex ? "waiting for opponent response" : "response belongs to opponent" };
    if (nextGame.pendingResponse && nextGame.pendingResponse.responder === pending.responder) {
      return { ok: false, status: 400, error: "response must resolve, add to stack, or pass priority" };
    }
  } else if (room.game.active !== roleIndex && !nextGame.pendingResponse) {
    return { ok: false, status: 403, error: "not your priority" };
  }
  return { ok: true, status: 200, error: "" };
}

/* `attack` is deliberately absent: after block commitment the authoritative
 * Online kernel owns damage resolution. Browsers may declare an attacker and a
 * blocker choice, but can never submit the final combat result. */
const AUTHORITATIVE_COMMANDS = new Set(["playCard", "activate", "activateHero", "maintenanceChoice", "declareAttack", "selectDefender", "advancePhase", "resolveDecision", "reposition", "confirmReposition", "passPriority"]);

/** Server-authoritative command path. The server owns the player index,
 * validates room revision and routes Online timing through one priority kernel. */
export function applyRulesCommand(room: Room, role: RoomRole, rawCommand: Record<string, unknown>, baseRevision: unknown, commandId: unknown = undefined) {
  const currentParticipant = room[role];
  const normalizedCommandId = typeof commandId === "string" ? commandId.trim() : "";
  if (!normalizedCommandId || normalizedCommandId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(normalizedCommandId)) {
    logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: "invalid command id", baseRevision });
    return { ok: false, status: 400, error: "command id required" };
  }
  if (currentParticipant?.recentCommandIds?.includes(normalizedCommandId)) {
    logOnlineDiagnostic(room, "command-duplicate", { role, commandType: String(rawCommand.type || ""), baseRevision, duplicate: true });
    return { ok: true, status: 200, error: "", duplicate: true };
  }
  if (room.status !== "started" || !room.game) return { ok: false, status: 409, error: "room not started" };
  if (Number(baseRevision) !== room.revision) {
    logOnlineDiagnostic(room, "command-stale", { role, commandType: String(rawCommand.type || ""), reason: "stale revision", baseRevision });
    return { ok: false, status: 409, error: "stale revision" };
  }
  if (reconnectPause(room)) {
    logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: "reconnect pause", baseRevision });
    return { ok: false, status: 409, error: "match paused for reconnect" };
  }
  if (!AUTHORITATIVE_COMMANDS.has(String(rawCommand.type || ""))) {
    logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: "unsupported command", baseRevision });
    return { ok: false, status: 400, error: "unsupported command" };
  }
  const owner = role === "host" ? 0 : 1;
  try {
    const command: Record<string, any> = { ...rawCommand, owner };
    if (command.type === "selectDefender") {
      const combat = room.game.combatAction;
      if (!combat || combat.stage !== "choosing" || combat.blockCommitted === true) return { ok: false, status: 409, error: "blocker choice unavailable" };
      if (1 - combat.attackerOwner !== owner) return { ok: false, status: 403, error: "only defender may choose blocker" };
    }
    const before = room.game;
    const result = executeOnlineCommand(before, command, { priority: true });
    room.game = result.state;
    reconcileOnlineClocks(before, room.game, room.settings);
    room.revision++;
    if (currentParticipant) {
      const recent = currentParticipant.recentCommandIds || [];
      currentParticipant.recentCommandIds = [...recent.filter((value) => value !== normalizedCommandId), normalizedCommandId].slice(-128);
    }
    return { ok: true, status: 200, error: "", trace: result.trace, duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid command";
    logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: message, baseRevision });
    return { ok: false, status: 400, error: message };
  }
}
