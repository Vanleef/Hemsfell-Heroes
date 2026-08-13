import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

// Biriba (p30): Fura-Fila snapshots the cards played this turn when Biriba is
// played, and that +X/+X remains on this permanent for as long as it stays on
// the battlefield. Leaving the field still clears it through the normal zone
// reset rules.
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  source = replaceOnce(
    source,
    'p30: [ability("onPlay", [effect("modifyStatsFromTurnCardsPlayed", { target: "self", attackPerCard: 1, healthPerCard: 1, duration: "turn" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],',
    'p30: [ability("onPlay", [effect("modifyStatsFromTurnCardsPlayed", { target: "self", attackPerCard: 1, healthPerCard: 1, duration: "permanent" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],',
    "Biriba permanent Fura-Fila stats"
  );
  await write(path, source);
}

// Pinga Levanta Defunto (p48): the engine increments turnCardsPlayed before
// resolving onPlay effects. Therefore the current Pinga itself must be removed
// from the count when deciding whether Fura-Fila was active. Investida is only
// granted when at least one OTHER card was already played earlier this turn.
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = replaceOnce(
    source,
    'configureResurrected(state, effect, context) { const target = findUnit(state, context.resurrectedId); if (!target) return; if (effect.grantKeywordIfCombo && (player(state, context.owner).turnCardsPlayed || 0) > 0) { target.temporaryTags ||= []; target.temporaryTags.push(effect.grantKeywordIfCombo); target.summoning = false; }',
    'configureResurrected(state, effect, context) { const target = findUnit(state, context.resurrectedId); if (!target) return; const cardsPlayedBeforeThis = Math.max(0, (player(state, context.owner).turnCardsPlayed || 0) - 1); if (effect.grantKeywordIfCombo && cardsPlayedBeforeThis > 0) { target.temporaryTags ||= []; if (!target.temporaryTags.includes(effect.grantKeywordIfCombo)) target.temporaryTags.push(effect.grantKeywordIfCombo); target.summoning = false; }',
    "Pinga Fura-Fila Investida timing"
  );
  await write(path, source);
}

console.log("v17 applied: Pinga grants Investida only with a prior card; Biriba +X/+X persists while in field.");
