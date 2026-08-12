import { readFile, writeFile } from "node:fs/promises";

const path = "app/page.tsx";
const before = 'artifactSick=unit.type==="Artefato"&&(unit.summoning||unit.enteredRound===game?.round)';
const after = 'artifactSick=unit.type==="Artefato"&&!!unit.summoning';

const source = await readFile(path, "utf8");

if (source.includes(after)) {
  console.log("Artifact activation runtime fix already applied.");
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error("Expected canActivateUnit artifact sickness expression was not found.");
}

await writeFile(path, source.replace(before, after));
console.log("Removed invalid module-scope game reference from canActivateUnit.");
