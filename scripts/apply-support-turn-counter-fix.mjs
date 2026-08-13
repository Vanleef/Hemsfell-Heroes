import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, from, to, label) => {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(from, to);
};

// prepare-card-semantics-v2 already rebuilt parseEffects by the time this runs.
// Patch its individual parser lines so the Support clause can never become a
// self stat modifier. Numeric Support remains an adjacent runtime aura.
{
  const file = "app/rules-engine/compiler.mjs";
  let s = await readFile(file, "utf8");
  if (!s.includes("supportClauseRaw")) {
    s = replaceOnce(s,
      `  const buff = raw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);`,
      `  const supportClauseRaw = raw.match(/suporte\\s*:\\s*([^.]+)/i)?.[1] || "";\n  const nonSupportRaw = clean(raw.replace(/suporte\\s*:\\s*[^.]+/ig, ""));\n  const buff = nonSupportRaw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);`,
      "support buff parser");
    s = replaceOnce(s,
      `  const offense = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);`,
      `  const offense = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);`,
      "support offense parser");
    s = replaceOnce(s,
      `  const vitality = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);`,
      `  const vitality = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);`,
      "support vitality parser");
  }
  await writeFile(file, s);
}

// Support only comes from allied adjacent creature slots, never the source.
// Fura-Fila checks cards played before the currently resolving card.
{
  const file = "app/rules-engine/engine.mjs";
  let s = await readFile(file, "utf8");
  const oldAura = `for(const source of permanentUnits(entry)){if(source.suffocated)continue;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&unit.uid!==source.uid&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){`;
  const newAura = `for(const source of entry.board||[]){if(source.suffocated)continue;const sourceId=source.uid||source.id;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){`;
  s = replaceOnce(s, oldAura, newAura, "support adjacency");
  s = s.replaceAll('support:${source.uid}:', 'support:${sourceId}:').replaceAll('sourceId:source.uid', 'sourceId');
  const oldCondition = `if (condition.cardsPlayedBeforeThisAtLeast != null && (state.players[owner].turnCardsPlayed || 0) < condition.cardsPlayedBeforeThisAtLeast) return false;\n  if (condition.cardsPlayedBeforeThisAtMost != null && (state.players[owner].turnCardsPlayed || 0) > condition.cardsPlayedBeforeThisAtMost) return false;`;
  const newCondition = `const cardsPlayedBeforeThis = Math.max(0, (state.players[owner].turnCardsPlayed || 0) - (event.type === "onPlay" && event.owner === owner ? 1 : 0));\n  if (condition.cardsPlayedBeforeThisAtLeast != null && cardsPlayedBeforeThis < condition.cardsPlayedBeforeThisAtLeast) return false;\n  if (condition.cardsPlayedBeforeThisAtMost != null && cardsPlayedBeforeThis > condition.cardsPlayedBeforeThisAtMost) return false;`;
  s = replaceOnce(s, oldCondition, newCondition, "Fura-Fila previous cards");
  await writeFile(file, s);
}

// Reuse the canonical per-turn counter used by Sr. Goblin for effects that
// scale with cards played this turn. ZOIUDO's authoritative handler is created
// by repair-authoritative-rules-v6. TRANQUEIRA deliberately keeps its own
// cardsPlayedAfterSelf counter, which starts at zero when it resolves.
{
  const effectsFile = "app/rules-engine/effects.mjs";
  let e = await readFile(effectsFile, "utf8");
  if (!e.includes("modifyStatsFromTurnCardsPlayed(state")) {
    const anchor = `  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },`;
    e = replaceOnce(e, anchor, `${anchor}\n  modifyStatsFromTurnCardsPlayed(state, effect, context) { const count = player(state, context.owner).turnCardsPlayed || 0; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", attack: count * (effect.attackPerCard || 0), health: count * (effect.healthPerCard || 0) }, context); },`, "turn-card stat scaler");
  }
  if (!e.includes("destroyByCardsPlayedThisTurn(state")) throw new Error("ZOIUDO shared counter handler missing");
  await writeFile(effectsFile, e);

  const rulesFile = "app/rules-engine/card-rules.mjs";
  let r = await readFile(rulesFile, "utf8");
  if (!/\bp30:\s*\[/.test(r)) {
    const anchor = `  p27: [ability("onEnter", [effect("grantNextCardDiscount", { amount: 1, duration: "turn" })])],`;
    r = replaceOnce(r, anchor, `${anchor}\n  p30: [ability("onPlay", [effect("modifyStatsFromTurnCardsPlayed", { target: "self", attackPerCard: 1, healthPerCard: 1, duration: "turn" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],`, "Biriba shared counter");
  }
  if (!/\bp32:\s*\[/.test(r)) throw new Error("ZOIUDO explicit rule missing");

  // A creature without Primeiro Ato must not resolve its conditional damage
  // merely because it entered. BOMBARDEIRO GENTE BOA listens for a later
  // allied Goblin summon and explicitly excludes its own entry event.
  const selfTriggeringBombardeiro = `condition: { eventOwnerIsController: true, eventCardSubtype: "Goblin" }, triggerMeta: { kind: "conditional-passive", scenario: "Sempre que você invocar um Goblin." }`;
  const delayedBombardeiro = `condition: { eventOwnerIsController: true, eventCardSubtype: "Goblin", otherThanSource: true }, triggerMeta: { kind: "conditional-passive", scenario: "Sempre que você invocar um Goblin." }`;
  if (r.includes(selfTriggeringBombardeiro)) r = r.replace(selfTriggeringBombardeiro, delayedBombardeiro);
  if (!r.includes(delayedBombardeiro)) throw new Error("BOMBARDEIRO GENTE BOA delayed trigger missing");

  if (!r.includes('effect("trackCardsPlayedAfterSelf")') || !r.includes('counter: "cardsPlayedAfterSelf"')) throw new Error("TRANQUEIRA private counter was replaced");
  await writeFile(rulesFile, r);
}

console.log("Support semantics, shared turn counters, delayed creature triggers and TRANQUEIRA private counter normalized.");
