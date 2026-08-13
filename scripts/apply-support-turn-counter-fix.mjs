import { readFile, writeFile } from "node:fs/promises";

const patch = (source, pattern, replacement, label) => {
  if (typeof pattern === "string") {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`Missing patch anchor: ${label}`);
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) throw new Error(`Missing patch pattern: ${label}`);
  return source.replace(pattern, replacement);
};

// Support clauses are adjacency auras, never self buffs.
{
  const file = "app/rules-engine/compiler.mjs";
  let s = await readFile(file, "utf8");
  if (!s.includes("supportClauseRaw")) {
    s = patch(s,
      `  const buff = raw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  const offense = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);\n  const vitality = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);`,
      `  const supportClauseRaw = raw.match(/suporte\\s*:\\s*([^.]+)/i)?.[1] || "";\n  const nonSupportRaw = clean(raw.replace(/suporte\\s*:\\s*[^.]+/ig, ""));\n  const buff = nonSupportRaw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  const offense = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);\n  const vitality = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);`,
      "support self stats");
  }
  await writeFile(file, s);
}

// Runtime Support only comes from allied adjacent creatures and never from self.
// Fura-Fila's condition counts cards played before the current card.
{
  const file = "app/rules-engine/engine.mjs";
  let s = await readFile(file, "utf8");
  s = patch(s,
    `for(const source of permanentUnits(entry)){if(source.suffocated)continue;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&unit.uid!==source.uid&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){`,
    `for(const source of entry.board||[]){if(source.suffocated)continue;const sourceId=source.uid||source.id;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){`,
    "support adjacency");
  s = s.replaceAll('support:${source.uid}:', 'support:${sourceId}:').replaceAll('sourceId:source.uid', 'sourceId');
  s = patch(s,
    `if (condition.cardsPlayedBeforeThisAtLeast != null && (state.players[owner].turnCardsPlayed || 0) < condition.cardsPlayedBeforeThisAtLeast) return false;\n  if (condition.cardsPlayedBeforeThisAtMost != null && (state.players[owner].turnCardsPlayed || 0) > condition.cardsPlayedBeforeThisAtMost) return false;`,
    `const cardsPlayedBeforeThis = Math.max(0, (state.players[owner].turnCardsPlayed || 0) - (event.type === "onPlay" && event.owner === owner ? 1 : 0));\n  if (condition.cardsPlayedBeforeThisAtLeast != null && cardsPlayedBeforeThis < condition.cardsPlayedBeforeThisAtLeast) return false;\n  if (condition.cardsPlayedBeforeThisAtMost != null && cardsPlayedBeforeThis > condition.cardsPlayedBeforeThisAtMost) return false;`,
    "Fura-Fila previous cards");
  await writeFile(file, s);
}

// Sr. Goblin's canonical per-turn counter is turnCardsPlayed. ZOIUDO already
// uses it via repair-authoritative-rules-v6. Biriba is normalized to it too.
{
  const effectsFile = "app/rules-engine/effects.mjs";
  let e = await readFile(effectsFile, "utf8");
  if (!e.includes("modifyStatsFromTurnCardsPlayed(state")) {
    const anchor = `  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },`;
    e = patch(e, anchor, `${anchor}\n  modifyStatsFromTurnCardsPlayed(state, effect, context) { const count = player(state, context.owner).turnCardsPlayed || 0; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", attack: count * (effect.attackPerCard || 0), health: count * (effect.healthPerCard || 0) }, context); },`, "turn count scaler");
  }
  if (!e.includes("destroyByCardsPlayedThisTurn(state")) throw new Error("ZOIUDO shared counter handler missing");
  await writeFile(effectsFile, e);

  const rulesFile = "app/rules-engine/card-rules.mjs";
  let r = await readFile(rulesFile, "utf8");
  if (!/\bp30:\s*\[/.test(r)) {
    const anchor = `  p27: [ability("onEnter", [effect("grantNextCardDiscount", { amount: 1, duration: "turn" })])],`;
    r = patch(r, anchor, `${anchor}\n  p30: [ability("onPlay", [effect("modifyStatsFromTurnCardsPlayed", { target: "self", attackPerCard: 1, healthPerCard: 1, duration: "turn" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],`, "Biriba rule");
  }
  if (!/\bp32:\s*\[/.test(r)) throw new Error("ZOIUDO explicit rule missing");
  if (!r.includes('effect("trackCardsPlayedAfterSelf")') || !r.includes('counter: "cardsPlayedAfterSelf"')) throw new Error("TRANQUEIRA must keep its private cardsPlayedAfterSelf counter");
  await writeFile(rulesFile, r);
}

console.log("Support and turn-card counters normalized; TRANQUEIRA keeps its private post-entry counter.");
