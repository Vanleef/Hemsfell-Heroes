import { NextRequest, NextResponse } from "next/server";
import { readRoom, roleFor, roomView, writeRoom, type Room } from "../store";
import { applyRulesCommand, applyTimeout, bothDecksLocked, deadline, participant, prepareCoin, sanitizeSettings } from "../machine";
import { createInitialOnlineGame } from "../initial-game";
import { shiftOnlineDeadlines } from "../online-clock.mjs";
import { isPlainRecord, isRoomId, readSafeJson } from "../validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };
const VALID_DECK_IDS = new Set(["gimble", "goblin", "uruk", "tifon", "saymon", "tessalia", "quarion", "rasmus", "ngoro", "zayan", "natureza"]);
const isStaleWrite = (error: unknown) => error instanceof Error && error.message === "stale room revision";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRoomId(id)) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  let room = await readRoom(id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  room = await persistDueTimeout(room, id);
  const role = roleFor(room, new URL(req.url).searchParams.get("token"));
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
      if (room.guest) return NextResponse.json({ error: "room full" }, { status: 409, ...noStore });
      const token = crypto.randomUUID();
      room.guest = participant(token, true);
      room.status = "deck-selection";
      room.revision++;
      await writeRoom(room);
      return NextResponse.json({ ...roomView(room), token }, noStore);
    }
    const role = roleFor(room, body?.token);
    if (!role) return NextResponse.json({ error: "invalid participant" }, { status: 403, ...noStore });
    const activeParticipant = room[role];
    if (!activeParticipant) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });

    if (body.action === "disconnect") {
      if (activeParticipant.disconnectedAt) return NextResponse.json(roomView(room, true, role), noStore);
      const disconnectedAt = Date.now();
      activeParticipant.disconnectedAt = disconnectedAt;
      room.pauseStartedAt ??= disconnectedAt;
      room.revision++;
      await writeRoom(room);
      return NextResponse.json(roomView(room, true, role), noStore);
    }
    if (body.action === "resume") {
      const awaySince = activeParticipant.disconnectedAt;
      if (!awaySince) return NextResponse.json(roomView(room, true, role), noStore);
      const resumedAt = Date.now();
      activeParticipant.disconnectedAt = null;
      const otherDisconnected = role === "host" ? room.guest?.disconnectedAt : room.host.disconnectedAt;
      if (!otherDisconnected) {
        const pauseStartedAt = room.pauseStartedAt ?? awaySince;
        if (room.game && resumedAt < awaySince + 60_000) shiftOnlineDeadlines(room.game, Math.max(0, resumedAt - pauseStartedAt));
        room.pauseStartedAt = null;
      }
      room.revision++;
      await writeRoom(room);
      return NextResponse.json(roomView(room, true, role), noStore);
    }
    if (activeParticipant.disconnectedAt) return NextResponse.json({ error: "resume required", ...roomView(room, true, role) }, { status: 409, ...noStore });

    if (body.action === "select") {
      if (room.status !== "deck-selection") return NextResponse.json({ error: "deck selection is closed" }, { status: 409, ...noStore });
      const current = room[role];
      if (!current) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });
      if (typeof body.heroId !== "string" || !VALID_DECK_IDS.has(body.heroId)) return NextResponse.json({ error: "invalid deck" }, { status: 400, ...noStore });
      current.heroId = body.heroId;
      current.deckLocked = !!body.locked;
      if (bothDecksLocked(room)) prepareCoin(room);
      room.revision++;
    } else if (body.action === "settings") {
      if (role !== "host" || room.status !== "waiting") return NextResponse.json({ error: "settings are locked" }, { status: 403, ...noStore });
      room.settings = sanitizeSettings(isPlainRecord(body.settings) ? body.settings : undefined);
      room.revision++;
    } else if (body.action === "choose_start") {
      if (room.status !== "coin-choice" || room.coinWinner !== role) return NextResponse.json({ error: "only coin winner chooses" }, { status: 403, ...noStore });
      if (!room.host.heroId || !room.guest?.heroId) return NextResponse.json({ error: "decks are not ready" }, { status: 409, ...noStore });
      room.startingRole = body.startSelf ? role : role === "host" ? "guest" : "host";
      const active = room.startingRole === "host" ? 0 : 1;
      room.game = createInitialOnlineGame(room.host.heroId, room.guest.heroId, active, room.settings.startingLife);
      room.game.turnDeadline = null;
      const mulliganDeadline = deadline(30);
      room.host.mulliganDone = false;
      room.host.mulliganDeadline = mulliganDeadline;
      room.guest.mulliganDone = false;
      room.guest.mulliganDeadline = mulliganDeadline;
      room.status = "mulligan";
      room.revision++;
    } else if (body.action === "initialize") {
      /* Pre-authoritative clients uploaded a complete shuffled match here. That
         exposed the guest's opening hand/deck to the host and allowed arbitrary
         structurally-valid state injection. Match construction now happens in
         choose_start on the server. */
      return NextResponse.json({ error: "client game initialization disabled" }, { status: 410, ...noStore });
    } else if (body.action === "mulligan") {
      if (room.status !== "mulligan" || !room.game) return NextResponse.json({ error: "mulligan unavailable" }, { status: 409, ...noStore });
      const current = room[role];
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
      room.revision++;
    } else if (body.action === "command") {
      if (!isPlainRecord(body.command)) return NextResponse.json({ error: "invalid command" }, { status: 400, ...noStore });
      const resolution = applyRulesCommand(room, role, body.command, body.baseRevision, body.commandId);
      if (!resolution.ok) return NextResponse.json({ error: resolution.error, ...roomView(room, true, role) }, { status: resolution.status, ...noStore });
      if (resolution.duplicate) return NextResponse.json(roomView(room, true, role), noStore);
    } else if (body.action === "sync") {
      /* Full client snapshots are never accepted once gameplay is authoritative. */
      return NextResponse.json({ error: "legacy state sync disabled; use authoritative commands" }, { status: 410, ...noStore });
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
