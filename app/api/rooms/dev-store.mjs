import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.env.HEMSFELL_DEV_ROOM_DIR || join(tmpdir(), "hemsfell-heroes-dev-rooms");

const safeId = (id) => {
  const value = String(id || "");
  if (!/^room-[a-z0-9-]+$/i.test(value)) throw new Error("invalid room id");
  return value;
};

const pathFor = (id) => join(ROOT, `${safeId(id)}.json`);
const staleRevision = () => new Error("stale room revision");

export async function readDevelopmentRoom(id) {
  try {
    return JSON.parse(await readFile(pathFor(id), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeDevelopmentRoom(room) {
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
}
