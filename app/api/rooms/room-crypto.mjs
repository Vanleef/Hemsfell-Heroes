import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = 1;
const keyFor = secret => createHash("sha256").update(`hemsfell-room-store:${secret}`).digest();

export function sealRoom(room, secret) {
  if (!secret) throw new Error("room encryption secret unavailable");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(room), "utf8"), cipher.final()]);
  return JSON.stringify({ v: VERSION, iv: iv.toString("base64url"), data: encrypted.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") });
}

export function openRoom(payload, secret) {
  const parsed = JSON.parse(payload);
  if (parsed?.v !== VERSION) return parsed;
  if (!secret || typeof parsed.iv !== "string" || typeof parsed.data !== "string" || typeof parsed.tag !== "string") throw new Error("invalid encrypted room payload");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), Buffer.from(parsed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64url")), decipher.final()]).toString("utf8"));
}
