import { NextRequest, NextResponse } from "next/server";

type Room = {
  id: string;
  host: { heroId: string | null };
  guest: { heroId: string | null } | null;
  status: "waiting" | "started";
  createdAt: number;
};

const ROOMS = (globalThis as any).__HH_ROOMS__ || new Map<string, Room>();
(globalThis as any).__HH_ROOMS__ = ROOMS;

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
    ROOMS.set(id, room);
    const url = new URL(req.url);
    // link will be consumed by client which will read ?room= param
    return NextResponse.json({ id, link: `${url.origin}${url.pathname.replace(/\/api\/rooms\/?$/,'')}/../../?room=${id}` });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  // Return basic info about rooms (for debugging)
  const out = Array.from(ROOMS.values() as Room[]).map(r => ({ id: r.id, status: r.status, createdAt: r.createdAt }));
  return NextResponse.json(out);
}
