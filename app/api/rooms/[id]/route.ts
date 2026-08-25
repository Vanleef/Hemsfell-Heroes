import { NextRequest, NextResponse } from "next/server";
import { readRoomFast as readRoom, roleFor, roomView, writeRoom, type Room } from "../store-runtime";
import { applyRulesCommand, applyTimeout, bothDecksLocked, deadline, participant, prepareCoin, sanitizeSettings } from "../machine";
import { createInitialOnlineGame } from "../initial-game";
import { shiftOnlineDeadlines } from "../online-clock.mjs";
import { isPlainRecord, isRoomId, readSafeJson } from "../validation";
import rawCards from "../../../cards.generated.json";
import { validateUserDeck } from "../../../user-deck.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };
const VALID_DECK_IDS = new Set(["gimble", "goblin", "uruk", "tifon", "saymon", "tessalia", "quarion", "rasmus", "ngoro", "zayan", "natureza"]);
const isStaleWrite = (error: unknown) => error instanceof Error && error.message === "stale room revision";
const validJoinRequestId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(value);
const authenticatedReadToken = (req: NextRequest) => {
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  return bearer || new URL(req.url).searchParams.get("token");
};

/** A polling GET and a command POST may notice the same expired deadline at the
 * same time. Only one CAS write should win; the loser reloads the winner rather
 * than surfacing a 500 or resurrecting its stale snapshot. */
async function persistDueTimeout(room: Room, id: string) {
  if (!applyTimeout(room)) return room;
  room.revision++;
  try {
    await writeRoom(room);
    return room;
  } catch (error) {
    if (!isStaleWrite(error)) throw error;
    return (await readRoom(id)) ?? room;
  }
}

/** Explicit resume is the only operation that clears disconnectedAt. */
async function resumeParticipant(room: Room, id: string, role: "host" | "guest") {
  for (let attempt = 0; attempt < 3; attempt++) {
    const activeParticipant = room[role];
    if (!activeParticipant) return room;

    const resumedAt = Date.now();
    const otherRole = role === "host" ? "guest" : "host";
    let changed = false;
    const awaySince = activeParticipant.disconnectedAt;
    if (awaySince) {
      activeParticipant.disconnectedAt = null;
      activeParticipant.lastSeenAt = resumedAt;
      activeParticipant.turnHadAction = false;
      activeParticipant.noActionTimeouts = 0;
      activeParticipant.lastNoActionTimeoutRound = null;
      activeParticipant.probationRound = null;
      activeParticipant.disconnectAfterOpponentMaintenance = false;
      changed = true;
      const otherDisconnected = room[otherRole]?.disconnectedAt;
      if (!otherDisconnected) {
        const pauseStartedAt = room.pauseStartedAt ?? awaySince;
        const pausedFor = Math.max(0, resumedAt - pauseStartedAt);
        if (room.game && resumedAt < awaySince + 60_000) {
          shiftOnlineDeadlines(room.game, pausedFor);
          if (room.status === "mulligan") for (const participant of [room.host, room.guest]) if (participant?.mulliganDeadline) participant.mulliganDeadline += pausedFor;
        }
        room.pauseStartedAt = null;
      }
    }
    if (!changed) return room;

    room.revision++;
    try {
      await writeRoom(room);
      return room;
    } catch (error) {
      if (!isStaleWrite(error)) throw error;
      const latest = await readRoom(id);
      if (!latest) return room;
      room = latest;
    }
  }
  return room;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRoomId(id)) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  let room = await readRoom(id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  room = await persistDueTimeout(room, id);
  const token = authenticatedReadToken(req);
  const role = roleFor(room, token);
  return NextResponse.json(roomView(room, !!role, role), noStore);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRoomId(id)) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  let room = await readRoom(id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  room = await persistDueTimeout(room, id);
  let requestToken: unknown = null;
  try {
    const parsed = await readSafeJson(req);
    if (!parsed.body) return NextResponse.json({ error: parsed.error ?? "invalid request" }, { status: 400, ...noStore });
    const body = parsed.body;
    requestToken = body?.token;
    if (body?.action === "join") {
      if (!validJoinRequestId(body.joinRequestId)) return NextResponse.json({ error: "invalid join request" }, { status: 400, ...noStore });
      const joinRequestId = body.joinRequestId;
      const token = crypto.randomUUID();
      /* Host polling updates presence through the same CAS revision used by a
         join. Retry that benign race with one stable request id. If the first
         write committed but its response was lost, return the already-created
         participant instead of incorrectly reporting a full room. */
      for (let attempt = 0; attempt < 3; attempt++) {
        if (room.guest) {
          if (room.guest.joinRequestId === joinRequestId) return NextResponse.json({ ...roomView(room), token: room.guest.token }, noStore);
          return NextResponse.json({ error: "room full" }, { status: 409, ...noStore });
        }
        room.guest = { ...participant(token, true), joinRequestId };
        room.status = "deck-selection";
        room.revision++;
        try {
          await writeRoom(room);
          return NextResponse.json({ ...roomView(room), token }, noStore);
        } catch (error) {
          if (!isStaleWrite(error)) throw error;
          const latest = await readRoom(id);
          if (!latest) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
          room = latest;
        }
      }
      return NextResponse.json({ error: "stale revision" }, { status: 409, ...noStore });
    }
    const role = roleFor(room, body?.token);
    if (!role) return NextResponse.json({ error: "invalid participant" }, { status: 403, ...noStore });
    const activeParticipant = room[role];
    if (!activeParticipant) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });

    if (body.action === "disconnect") {
      if (activeParticipant.disconnectedAt) return NextResponse.json(roomView(room, true, role), noStore);
      const disconnectedAt = Date.now();
      activeParticipant.disconnectedAt = disconnectedAt;
      activeParticipant.lastSeenAt = disconnectedAt;
      room.pauseStartedAt ??= disconnectedAt;
      room.revision++;
      await writeRoom(room);
      return NextResponse.json(roomView(room, true, role), noStore);
    }
    if (body.action === "resume") {
      const awaySince = activeParticipant.disconnectedAt;
      if (!awaySince) return NextResponse.json(roomView(room, true, role), noStore);
      room = await resumeParticipant(room, id, role);
      return NextResponse.json(roomView(room, true, role), noStore);
    }
    if (activeParticipant.disconnectedAt) return NextResponse.json({ error: "resume required", ...roomView(room, true, role) }, { status: 409, ...noStore });

    if (body.action === "select") {
      const current = room[role];
      if (!current) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });
      if (!validJoinRequestId(body.selectRequestId)) return NextResponse.json({ error: "invalid select request" }, { status: 400, ...noStore });
      if (current.lastSelectRequestId === body.selectRequestId) return NextResponse.json(roomView(room, true, role), noStore);
      if (room.status !== "deck-selection") return NextResponse.json({ error: "deck selection is closed", ...roomView(room, true, role) }, { status: 409, ...noStore });
      if (typeof body.heroId !== "string" || !VALID_DECK_IDS.has(body.heroId)) return NextResponse.json({ error: "invalid deck" }, { status: 400, ...noStore });
      let selectedUserDeck = null;
      if (body.userDeck !== undefined && body.userDeck !== null) {
        const validation = validateUserDeck(body.userDeck, rawCards as any[]);
        if (!validation.ok || !validation.deck || validation.deck.heroId !== body.heroId) return NextResponse.json({ error: "invalid deck list", details: validation.errors.slice(0, 4) }, { status: 400, ...noStore });
        selectedUserDeck = validation.deck;
      }
      current.heroId = body.heroId;
      current.userDeck = selectedUserDeck;
      current.deckLocked = !!body.locked;
      current.lastSelectRequestId = body.selectRequestId;
      if (bothDecksLocked(room)) prepareCoin(room);
      room.revision++;
    } else if (body.action === "settings") {
      if (role !== "host" || room.status !== "waiting") return NextResponse.json({ error: "settings are locked" }, { status: 403, ...noStore });
      room.settings = sanitizeSettings(isPlainRecord(body.settings) ? body.settings : undefined);
      room.revision++;
    } else if (body.action === "choose_start") {
      const current = room[role];
      if (!current) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });
      if (!validJoinRequestId(body.chooseStartRequestId)) return NextResponse.json({ error: "invalid start request" }, { status: 400, ...noStore });
      if (current.lastChooseStartRequestId === body.chooseStartRequestId) return NextResponse.json(roomView(room, true, role), noStore);
      if (room.status !== "coin-choice" || room.coinWinner !== role) return NextResponse.json({ error: "only coin winner chooses" }, { status: 403, ...noStore });
      if (!room.host.heroId || !room.guest?.heroId) return NextResponse.json({ error: "decks are not ready" }, { status: 409, ...noStore });
      room.startingRole = body.startSelf ? role : role === "host" ? "guest" : "host";
      const active = room.startingRole === "host" ? 0 : 1;
      room.game = createInitialOnlineGame(room.host.heroId, room.guest.heroId, active, room.settings.startingLife, room.host.userDeck, room.guest.userDeck);
      room.game.turnDeadline = null;
      const mulliganDeadline = deadline(30);
      room.host.mulliganDone = false;
      room.host.mulliganDeadline = mulliganDeadline;
      room.guest.mulliganDone = false;
      room.guest.mulliganDeadline = mulliganDeadline;
      room.status = "mulligan";
      current.lastChooseStartRequestId = body.chooseStartRequestId;
      room.revision++;
    } else if (body.action === "initialize") {
      /* Pre-authoritative clients uploaded a complete shuffled match here. That
         exposed the guest's opening hand/deck to the host and allowed arbitrary
         structurally-valid state injection. Match construction now happens in
         choose_start on the server. Historical preserveOpponentSecrets and
         isBoundedGame checks are intentionally superseded by not accepting a
         client game snapshot at all. */
      return NextResponse.json({ error: "client game initialization disabled", ...roomView(room, true, role) }, { status: 409, ...noStore });
    } else if (body.action === "mulligan") {
      if (!validJoinRequestId(body.mulliganRequestId)) return NextResponse.json({ error: "invalid mulligan request" }, { status: 400, ...noStore });
      const mulliganRequestId = body.mulliganRequestId;
      const current = room[role];
      if (!current) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });
      if (current.lastMulliganRequestId === mulliganRequestId) return NextResponse.json(roomView(room, true, role), noStore);
      if (room.status !== "mulligan" || !room.game) return NextResponse.json({ error: "mulligan unavailable" }, { status: 409, ...noStore });
      if (!current || current.mulliganDone) return NextResponse.json({ error: "mulligan already confirmed" }, { status: 409, ...noStore });
      const playerIndex = role === "host" ? 0 : 1;
      const player = room.game.players?.[playerIndex];
      if (!player?.hand || !player?.deck) return NextResponse.json({ error: "invalid game state" }, { status: 409, ...noStore });
      if (body.keep || player.hand.length <= 1) {
        current.mulliganDone = true;
        current.mulliganDeadline = null;
      } else {
        const nextSize = Math.max(1, player.hand.length - 1);
        const pool = [...player.deck, ...player.hand];
        for (let index = pool.length - 1; index > 0; index--) {
          const swap = Math.floor(Math.random() * (index + 1));
          [pool[index], pool[swap]] = [pool[swap], pool[index]];
        }
        player.hand = pool.splice(0, nextSize);
        player.deck = pool;
        current.mulliganCount++;
      }
      if (room.host.mulliganDone && room.guest?.mulliganDone) {
        room.status = "started";
        room.game.turnDeadline = deadline(room.settings.turnSeconds);
      }
      current.lastMulliganRequestId = mulliganRequestId;
      room.revision++;
    } else if (body.action === "command") {
      if (!isPlainRecord(body.command)) return NextResponse.json({ error: "invalid command" }, { status: 400, ...noStore });
      const resolution = applyRulesCommand(room, role, body.command, body.baseRevision, body.commandId);
      if (!resolution.ok) return NextResponse.json({ error: resolution.error, ...roomView(room, true, role) }, { status: resolution.status, ...noStore });
      if (resolution.duplicate) return NextResponse.json(roomView(room, true, role), noStore);
    } else if (body.action === "sync") {
      /* Full client snapshots are never accepted. Returning the current
         authoritative view also snaps pre-migration clients back to server
         truth after any legacy local mutation instead of letting them diverge. */
      return NextResponse.json({ error: "legacy state sync disabled; use authoritative commands", ...roomView(room, true, role) }, { status: 410, ...noStore });
    } else if (body.action === "timeout") {
      /* The pre-request timeout pass normally handled this already. Crossing a
         deadline during request parsing is still possible, so check once more.
         A no-op timeout must not be written with an unchanged revision. */
      if (!applyTimeout(room)) return NextResponse.json(roomView(room, true, role), noStore);
      room.revision++;
    } else return NextResponse.json({ error: "unknown action" }, { status: 400, ...noStore });

    await writeRoom(room);
    return NextResponse.json(roomView(room, true, role), noStore);
  } catch (error) {
    if (isStaleWrite(error)) {
      const latest = await readRoom(id);
      const latestRole = latest ? roleFor(latest, requestToken) : null;
      return NextResponse.json({ error: "stale revision", ...(latest ? roomView(latest, !!latestRole, latestRole) : {}) }, { status: 409, ...noStore });
    }
    console.error("[rooms] request failed", error);
    return NextResponse.json({ error: "request failed" }, { status: 500, ...noStore });
  }
}
