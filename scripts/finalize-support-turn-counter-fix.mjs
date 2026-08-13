import { readFile, writeFile } from "node:fs/promises";

async function edit(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) console.log(`${path}: no finalizer changes needed`);
  await writeFile(path, after);
}

await edit("app/rules-engine/compiler.mjs", (s) => {
  s = s.replace(
    '  const supportText=value.match(/suporte\\s*:\\s*([^.]+)/)?.[1];\n  if(supportText&&!/[+-]?\\d+\\s*\\/\\s*[+-]?\\d+/.test(supportText)) for(const keyword of keywordMatches(supportText)) add("supportAura",{keyword});',
    '  const supportText = folded(supportClauseRaw);\n  const supportStats = supportClauseRaw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  if (supportStats) add("supportAura", { attack: Number(supportStats[1]), health: Number(supportStats[2]) });\n  if (supportText) for (const keyword of keywordMatches(supportText)) add("supportAura", { keyword });'
  );
  s = s.replace(
    '  for(const keyword of keywordMatches(raw)){if(supportText&&folded(supportText).includes(folded(keyword)))continue;if(effects.some((effect)=>effect.type==="grantKeyword"&&effect.keyword===keyword))continue;add("keyword", { keyword, duration: turnLimited ? "turn" : "permanent" });}',
    '  for (const keyword of keywordMatches(nonSupportRaw)) { if (effects.some((effect) => effect.type === "grantKeyword" && effect.keyword === keyword)) continue; add("keyword", { keyword, duration: turnLimited ? "turn" : "permanent" }); }'
  );
  return s;
});

await edit("app/rules-engine/effects.mjs", (s) => s.replace(
  '  countedChoice(state, effect, context) { const source = findUnit(state, context.sourceId); const count = source?.[effect.counter] || 0;',
  '  countedChoice(state, effect, context) { const source = findUnit(state, context.sourceId); const counterSource = effect.counterScope === "player" ? player(state, context.owner) : source; const count = counterSource?.[effect.counter] || 0;'
));

await edit("app/rules-engine/card-rules.mjs", (s) => {
  const shared = 'p46: [ability("onPlay", [effect("remainUntilTurnEnd")]), ability("onTurnEnd", [effect("countedChoice", { counter: "turnCardsPlayed", counterScope: "player", branches:';
  const privateCounter = 'p46: [ability("onPlay", [effect("remainUntilTurnEnd"), effect("trackCardsPlayedAfterSelf")]), ability("onTurnEnd", [effect("countedChoice", { counter: "cardsPlayedAfterSelf", branches:';
  if (s.includes(shared)) s = s.replace(shared, privateCounter);
  if (!s.includes('effect("trackCardsPlayedAfterSelf")') || !s.includes('counter: "cardsPlayedAfterSelf"')) throw new Error("TRANQUEIRA private counter missing after finalization");
  return s;
});

console.log("Finalized Support aura parsing while preserving TRANQUEIRA's private post-entry counter.");