import { NextRequest, NextResponse } from "next/server";
import { preserveOpponentSecrets, readRoom, roleFor, roomView, writeRoom } from "../store";
import { applyRulesCommand, applyTimeout, bothDecksLocked, canSync, deadline, participant, prepareCoin, sanitizeSettings } from "../machine";
import { shiftOnlineDeadlines } from "../online-clock.mjs";
import { isBoundedGame, isPlainRecord, isRoomId, readSafeJson } from "../validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };
const VALID_DECK_IDS = new Set(["gimble", "goblin", "uruk", "tifon", "saymon", "tessalia", "quarion", "rasmus", "ngoro", "zayan", "natureza"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRoomId(id)) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  const room = await readRoom(id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404, ...noStore });
  if (applyTimeout(room)) { room.revision++; await writeRoom(room); }
  const role = roleFor(room, new URL(req.url).searchParams.get("token"));
  return NextResponse.json(roomView(room, !!role, role), noStore);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRoomId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const room = await readRoom(id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (applyTimeout(room)) { room.revision++; await writeRoom(room); }
  try {
    const parsed = await readSafeJson(req);
    if (!parsed.body) return NextResponse.json({ error: parsed.error ?? "invalid request" }, { status: 400 });
    const body = parsed.body;
    if (body?.action === "join") {
      if (room.guest) return NextResponse.json({ error: "room full" }, { status: 409 });
      const token = crypto.randomUUID();
      room.guest = participant(token, true);
      room.status = "deck-selection";
      room.revision++;
      await writeRoom(room);
      return NextResponse.json({...roomView(room),token});
    }
    const role = roleFor(room, body?.token);
    if (!role) return NextResponse.json({ error: "invalid participant" }, { status: 403 });
    const activeParticipant = room[role];
    if (!activeParticipant) return NextResponse.json({ error: "player not connected" }, { status: 409 });
    if (body.action === "disconnect") {
      if (!activeParticipant.disconnectedAt) activeParticipant.disconnectedAt = Date.now();
      room.revision++;
      await writeRoom(room);
      return NextResponse.json(roomView(room, true, role), noStore);
    }
    if (body.action === "resume") {
      const awaySince = activeParticipant.disconnectedAt;
      if (!awaySince) return NextResponse.json(roomView(room, true, role), noStore);
      const resumedAt = Date.now();
      if (room.game && resumedAt < awaySince + 60_000) shiftOnlineDeadlines(room.game, resumedAt - awaySince);
      activeParticipant.disconnectedAt = null;
      room.revision++;
      await writeRoom(room);
      return NextResponse.json(roomView(room, true, role), noStore);
    }
    if (activeParticipant.disconnectedAt) return NextResponse.json({ error: "resume required", ...roomView(room, true, role) }, { status: 409, ...noStore });
    if (body.action === "select") {
      if (room.status !== "deck-selection") return NextResponse.json({ error: "deck selection is closed" }, { status: 409 });
      const participant = room[role];
      if (!participant) return NextResponse.json({ error: "player not connected" }, { status: 409 });
      if (typeof body.heroId !== "string" || !VALID_DECK_IDS.has(body.heroId)) return NextResponse.json({ error: "invalid deck" }, { status: 400 });
      participant.heroId = body.heroId;
      participant.deckLocked = !!body.locked;
      if (bothDecksLocked(room)) prepareCoin(room);
      room.revision++;
    } else if (body.action === "settings") {
      if (role !== "host" || room.status !== "waiting") return NextResponse.json({ error: "settings are locked" }, { status: 403 });
      room.settings = sanitizeSettings(isPlainRecord(body.settings) ? body.settings : undefined);
      room.revision++;
    } else if (body.action === "choose_start") {
      if (room.status !== "coin-choice" || room.coinWinner !== role) return NextResponse.json({ error: "only coin winner chooses" }, { status: 403 });
      room.startingRole = body.startSelf ? role : role === "host" ? "guest" : "host";
      room.status = "mulligan";
      room.revision++;
    } else if (body.action === "initialize") {
      if (role !== "host" || room.status !== "mulligan" || room.game) return NextResponse.json({ error: "game already initialized" }, { status: 409 });
      if (!isBoundedGame(body.game)) return NextResponse.json({ error: "invalid game state" }, { status: 400 });
      room.game = body.game;
      room.game.turnDeadline = null;
      const mulliganDeadline = deadline(30);
      room.host.mulliganDeadline = mulliganDeadline;
      if (room.guest) room.guest.mulliganDeadline = mulliganDeadline;
      room.revision++;
    } else if (body.action === "mulligan") {
      if (room.status !== "mulligan" || !room.game) return NextResponse.json({ error: "mulligan unavailable" }, { status: 409 });
      const current = room[role];
      if (!current || current.mulliganDone) return NextResponse.json({ error: "mulligan already confirmed" }, { status: 409 });
      const playerIndex = role === "host" ? 0 : 1;
      const player = room.game.players?.[playerIndex];
      if (!player?.hand || !player?.deck) return NextResponse.json({ error: "invalid game state" }, { status: 409 });
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
      if (!isPlainRecord(body.command)) return NextResponse.json({ error: "invalid command" }, { status: 400 });
      const resolution = applyRulesCommand(room, role, body.command, body.baseRevision, body.commandId);
      if (!resolution.ok) return NextResponse.json({ error: resolution.error, ...roomView(room, true, role) }, { status: resolution.status });
      if (resolution.duplicate) return NextResponse.json(roomView(room, true, role), noStore);
    } else if (body.action === "sync") {
      if (room.status !== "started") return NextResponse.json({ error: "room not started" }, { status: 409 });
      if (!isBoundedGame(body.game)) return NextResponse.json({ error: "invalid game state" }, { status: 400 });
      const permission = canSync(room, role, body.game, body.baseRevision);
      if (!permission.ok) return NextResponse.json({ error: permission.error, ...roomView(room, true, role) }, { status: permission.status });
      room.game = preserveOpponentSecrets(room, body.game, role);
      if (room.game.pendingResponse && !room.game.pendingResponse.deadline) room.game.pendingResponse.deadline = deadline(room.settings.responseSeconds);
      room.revision++;
    } else if (body.action === "timeout") {
      if (applyTimeout(room)) room.revision++;
    } else return NextResponse.json({ error: "unknown action" }, { status: 400 });
    await writeRoom(room);
    return NextResponse.json(roomView(room, true, role));
  } catch (error) {
    if (error instanceof Error && error.message === "stale room revision") {
      const latest = await readRoom(id);
      return NextResponse.json({ error: "stale revision", ...(latest ? { revision: latest.revision } : {}) }, { status: 409 });
    }
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
}
