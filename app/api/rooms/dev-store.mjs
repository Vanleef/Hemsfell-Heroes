import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.env.HEMSFELL_DEV_ROOM_DIR || join(tmpdir(), "hemsfell-heroes-dev-rooms");
const roomWriteQueues = new Map();

const safeId = (id) => {
  const value = String(id || "");
  if (!/^room-[a-z0-9-]+$/i.test(value)) throw new Error("invalid room id");
  return value;
};

const pathFor = (id) => join(ROOT, `${safeId(id)}.json`);
const staleRevision = () => new Error("stale room revision");

/**
 * Next development can execute a polling GET and a command POST concurrently.
 * The revision check and the atomic rename must therefore share one critical
 * section. Without this queue both writers can validate revision N and publish
 * different revision N+1 snapshots, silently losing the actual game command.
 */
async function withRoomWriteLock(id, operation) {
  const key = safeId(id);
  const previous = roomWriteQueues.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  roomWriteQueues.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (roomWriteQueues.get(key) === tail) roomWriteQueues.delete(key);
  }
}

export async function readDevelopmentRoom(id) {
  try {
    return JSON.parse(await readFile(pathFor(id), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeDevelopmentRoom(room) {
  return withRoomWriteLock(room.id, async () => {
    await mkdir(ROOT, { recursive: true });
    const target = pathFor(room.id);

    if (Number(room.revision) === 0) {
      try {
        await writeFile(target, JSON.stringify(room), { encoding: "utf8", flag: "wx" });
        return;
      } catch (error) {
        if (error?.code === "EEXIST") throw staleRevision();
        throw error;
      }
    }

    const current = await readDevelopmentRoom(room.id);
    if (!current || Number(current.revision) !== Number(room.revision) - 1) throw staleRevision();

    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(room), "utf8");
    await rename(temp, target);
  });
}
