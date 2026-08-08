import { NextRequest, NextResponse } from "next/server";
import { readRoom, roleFor, roomView, writeRoom } from "../store";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const room = await readRoom(params.id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });
  const role = roleFor(room, new URL(req.url).searchParams.get("token"));
  return NextResponse.json(roomView(room, !!role));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const room = await readRoom(params.id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const body = await req.json();
    if (body?.action === "join") {
      if (room.guest) return NextResponse.json({ error: "room full" }, { status: 409 });
      const token = crypto.randomUUID();
      room.guest = { heroId: body.heroId ?? null, token };
      room.revision++;
      await writeRoom(room);
      return NextResponse.json({...roomView(room),token});
    }
    const role = roleFor(room, body?.token);
    if (!role) return NextResponse.json({ error: "invalid participant" }, { status: 403 });
    if (body.action === "select") {
      const participant = room[role];
      if (!participant) return NextResponse.json({ error: "player not connected" }, { status: 409 });
      participant.heroId = body.heroId ?? null;
      room.revision++;
    } else if (body.action === "start") {
      if (role !== "host") return NextResponse.json({ error: "only host can start" }, { status: 403 });
      if (!room.host.heroId || !room.guest?.heroId || !body.game) return NextResponse.json({ error: "both players must select decks" }, { status: 400 });
      room.status = "started";
      room.game = body.game;
      room.revision++;
    } else if (body.action === "sync") {
      if (room.status !== "started" || !body.game) return NextResponse.json({ error: "room not started" }, { status: 409 });
      room.game = body.game;
      room.revision++;
    } else return NextResponse.json({ error: "unknown action" }, { status: 400 });
    await writeRoom(room);
    return NextResponse.json(roomView(room, true));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
