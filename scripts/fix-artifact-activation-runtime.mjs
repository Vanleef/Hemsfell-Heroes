import { readFile, writeFile } from "node:fs/promises";

const path = "app/page.tsx";
const source = await readFile(path, "utf8");

/*
 * Historical migration only.
 *
 * Older revisions kept artifact summoning-sickness logic directly inside
 * page.tsx as `artifactSick=...`. Current revisions delegate activation
 * legality to app/card-activation.mjs / the rules engine, so that exact source
 * expression legitimately no longer exists.
 *
 * A migration must be idempotent: absence of an obsolete legacy expression is
 * already a valid final state, not a fatal error. Keep support for both known
 * legacy variants without rewriting unrelated UI/rules code.
 */
const legacyExpressions = [
  'artifactSick=unit.type==="Artefato"&&(unit.summoning||unit.enteredRound===game?.round)',
  'artifactSick=unit.type==="Artefato" && (unit.summoning || unit.enteredRound === game?.round)',
];
const fixedExpressions = [
  'artifactSick=unit.type==="Artefato"&&!!unit.summoning',
  'artifactSick=unit.type==="Artefato" && !!unit.summoning',
];

if (fixedExpressions.some((expression) => source.includes(expression))) {
  console.log("Artifact activation runtime fix already applied.");
  process.exit(0);
}

const legacy = legacyExpressions.find((expression) => source.includes(expression));
if (!legacy) {
  console.log("Artifact activation runtime legacy expression is absent; no migration needed.");
  process.exit(0);
}

const replacement = legacy.includes(" && ")
  ? 'artifactSick=unit.type==="Artefato" && !!unit.summoning'
  : 'artifactSick=unit.type==="Artefato"&&!!unit.summoning';

await writeFile(path, source.replace(legacy, replacement));
console.log("Removed invalid module-scope game reference from legacy artifact activation runtime.");
