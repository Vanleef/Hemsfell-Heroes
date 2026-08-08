import { NextRequest, NextResponse } from "next/server";
import { rooms } from "../store";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const room = rooms.get(id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(room);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const room = rooms.get(id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const body = await req.json();
    const action = body?.action;
    if (action === "join") {
      if (room.guest) return NextResponse.json({ error: "room full" }, { status: 409 });
      room.guest = { heroId: body.heroId ?? null };
      rooms.set(id, room);
      return NextResponse.json(room);
    }
    if (action === "select") {
      const player = body.player === 1 ? "guest" : "host";
      const heroId = body.heroId ?? null;
      const participant = room[player];
      if (!participant) return NextResponse.json({ error: "player not connected" }, { status: 409 });
      participant.heroId = heroId;
      rooms.set(id, room);
      return NextResponse.json(room);
    }
    if (action === "start") {
      if (!room.host?.heroId || !room.guest?.heroId) return NextResponse.json({ error: "both players must select decks" }, { status: 400 });
      room.status = "started";
      rooms.set(id, room);
      return NextResponse.json({ started: true, players: [room.host.heroId, room.guest.heroId] });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
