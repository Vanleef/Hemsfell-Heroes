import {
  readRoom as readPersistentRoom,
  readRoomFast as readPersistentRoomFast,
  writeRoom as writePersistentRoom,
  roleFor,
  roomView,
  preserveOpponentSecrets,
  type Room,
} from "../../api/rooms/store";
import { readDevelopmentRoom, writeDevelopmentRoom } from "../../api/rooms/dev-store.mjs";

const useDevelopmentStore = () => process.env.NODE_ENV === "development";

export type { Room } from "../../api/rooms/store";
export { roleFor, roomView, preserveOpponentSecrets };

/** Repository boundary selecting volatile development or durable production IO. */
export async function readRoom(id: string): Promise<Room | null> {
  if (useDevelopmentStore()) return await readDevelopmentRoom(id) as Room | null;
  return readPersistentRoom(id);
}

export async function readRoomFast(id: string): Promise<Room | null> {
  if (useDevelopmentStore()) return await readDevelopmentRoom(id) as Room | null;
  return readPersistentRoomFast(id);
}

export async function writeRoom(room: Room) {
  if (useDevelopmentStore()) {
    await writeDevelopmentRoom(room);
    return;
  }
  await writePersistentRoom(room);
}

