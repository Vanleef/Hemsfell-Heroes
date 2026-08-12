import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/apply-card-semantics-v2.mjs";
let source = await readFile(path, "utf8");

const broken = 'creature.grantedKeywords = (creature.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith(`attachment:${attachment.uid || attachment.id}:`));';
const fixed = 'creature.grantedKeywords = (creature.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith("attachment:" + (attachment.uid || attachment.id) + ":"));';

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  await writeFile(path, source);
  console.log("Repaired card semantics migration template literal.");
} else {
  console.log("Card semantics migration template literal already repaired.");
}
