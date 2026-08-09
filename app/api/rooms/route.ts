import { NextRequest, NextResponse } from "next/server";
import { roomView, type Room, writeRoom } from "./store";
import { defaultSettings, participant, sanitizeSettings } from "./machine";
import { isPlainRecord, readSafeJson } from "./validation";

export async function POST(req: NextRequest) {
  try {
    const parsed = await readSafeJson(req);
    if (!parsed.body) return NextResponse.json({ error: parsed.error ?? "invalid request" }, { status: 400 });
    const body = parsed.body;
    const id = `room-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`;
    const token = crypto.randomUUID();
    const room: Room = {id,host:participant(token),guest:null,status:"waiting",settings:sanitizeSettings(isPlainRecord(body.settings) ? body.settings : defaultSettings),createdAt:Date.now(),revision:0,coinWinner:null,startingRole:null,game:null};
    await writeRoom(room);
    const url = new URL(req.url);
    return NextResponse.json({...roomView(room),token,link:`${url.origin}/?room=${encodeURIComponent(id)}`});
  } catch {
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
}
