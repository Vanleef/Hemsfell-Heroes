import { NextRequest, NextResponse } from "next/server";
import { roomView, type Room, writeRoom } from "./store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = `room-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,8)}`;
    const token = crypto.randomUUID();
    const room: Room = {id,host:{heroId:body?.heroId??null,token},guest:null,status:"waiting",createdAt:Date.now(),revision:0,game:null};
    await writeRoom(room);
    const url = new URL(req.url);
    return NextResponse.json({...roomView(room),token,link:`${url.origin}/?room=${encodeURIComponent(id)}`});
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
