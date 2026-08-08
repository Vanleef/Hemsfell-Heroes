export type Room = {
  id: string;
  host: { heroId: string | null };
  guest: { heroId: string | null } | null;
  status: "waiting" | "started";
  createdAt: number;
};

const globalRooms = globalThis as typeof globalThis & {
  __HH_ROOMS__?: Map<string, Room>;
};

export const rooms = globalRooms.__HH_ROOMS__ ?? new Map<string, Room>();
globalRooms.__HH_ROOMS__ = rooms;
