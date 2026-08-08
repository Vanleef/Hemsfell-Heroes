import { NextRequest, NextResponse } from "next/server";
import { rooms, type Room } from "./store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const room: Room = {
      id,
      host: { heroId: body?.heroId ?? null },
      guest: null,
      status: "waiting",
      createdAt: Date.now(),
    };
    rooms.set(id, room);
    const url = new URL(req.url);
    return NextResponse.json({ id, link: `${url.origin}/?room=${encodeURIComponent(id)}` });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  // Return basic info about rooms (for debugging)
  const out = Array.from(rooms.values()).map(r => ({ id: r.id, status: r.status, createdAt: r.createdAt }));
  return NextResponse.json(out);
}
