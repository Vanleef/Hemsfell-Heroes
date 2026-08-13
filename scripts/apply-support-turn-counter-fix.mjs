import { readFile, writeFile } from "node:fs/promises";

const replaceRequired = (text, from, to, label) => {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`Patch anchor not found: ${label}`);
  return text.replace(from, to);
};

const compilerUrl = new URL("../app/rules-engine/compiler.mjs", import.meta.url);
let compiler = await readFile(compilerUrl, "utf8");
compiler = replaceRequired(
  compiler,
  `  const buff = raw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  const offense = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);\n  const vitality = raw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);`,
  `  const supportClauseRaw = raw.match(/suporte\\s*:\\s*([^.]+)/i)?.[1] || "";\n  const nonSupportRaw = clean(raw.replace(/suporte\\s*:\\s*[^.]+/ig, ""));\n  const buff = nonSupportRaw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  const offense = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?ofensividade/i);\n  const vitality = nonSupportRaw.match(/(?:recebe|ganha|concede|d[êe])\\s*\\+?(\\d+)\\s+(?:de\\s+)?vitalidade/i);`,
  "Support clause excluded from self stats"
);
compiler = replaceRequired(
  compiler,
  `  const supportText=value.match(/suporte\\s*:\\s*([^.]+)/)?.[1];\n  if(supportText&&!/[+-]?\\d+\\s*\\/\\s*[+-]?\\d+/.test(supportText)) for(const keyword of keywordMatches(supportText)) add("supportAura",{keyword});`,
  `  const supportText = folded(supportClauseRaw);\n  const supportStats = supportClauseRaw.match(/([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/);\n  if (supportStats) add("supportAura", { attack: Number(supportStats[1]), health: Number(supportStats[2]) });\n  if (supportText) for (const keyword of keywordMatches(supportText)) add("supportAura", { keyword });`,
  "Compile Support numeric/keyword aura"
);
compiler = replaceRequired(
  compiler,
  `  for(const keyword of keywordMatches(raw)){if(supportText&&folded(supportText).includes(folded(keyword)))continue;if(effects.some((effect)=>effect.type==="grantKeyword"&&effect.keyword===keyword))continue;add("keyword", { keyword, duration: turnLimited ? "turn" : "permanent" });}`,
  `  for (const keyword of keywordMatches(nonSupportRaw)) { if (effects.some((effect) => effect.type === "grantKeyword" && effect.keyword === keyword)) continue; add("keyword", { keyword, duration: turnLimited ? "turn" : "permanent" }); }`,
  "Support keyword never grants itself"
);
await writeFile(compilerUrl, compiler);

const engineUrl = new URL("../app/rules-engine/engine.mjs", import.meta.url);
let engine = await readFile(engineUrl, "utf8");
engine = replaceRequired(
  engine,
  `function refreshSupportAuras(state){for(const entry of state.players)for(const unit of entry.board||[]){unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:"));unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");}state.players.forEach((entry)=>{for(const source of permanentUnits(entry)){if(source.suffocated)continue;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&unit.uid!==source.uid&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(\`support:\${source.uid}:\${aura.keyword}\`);}if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId:source.uid});}}}}});}`,
  `function refreshSupportAuras(state){for(const entry of state.players)for(const unit of entry.board||[]){unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:"));unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");}state.players.forEach((entry)=>{for(const source of entry.board||[]){if(source.suffocated)continue;const sourceId=source.uid||source.id;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(\`support:\${sourceId}:\${aura.keyword}\`);}if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId});}}}}});}`,
  "Support source restricted to board and self excluded"
);
engine = replaceRequired(
  engine,
  `return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect", requiredSubtype: effect.requiredSubtype || effect.subtype, requiredName: effect.requiredName, imageOnly: effect.imageOnly, maxCost: effect.maxCost, excludeIds: effect.excludeIds || [] }));`,
  `return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect", requiredSubtype: effect.requiredSubtype || effect.subtype, requiredName: effect.requiredName, imageOnly: effect.imageOnly, maxCost: effect.maxCost, maxCostCounter: effect.maxCostCounter, includeCurrentCardInCounter: effect.includeCurrentCardInCounter, excludeIds: effect.excludeIds || [] }));`,
  "Dynamic target max cost metadata"
);
engine = replaceRequired(
  engine,
  `function targetMatchesStep(target, id, step) {\n  if ((step.excludeIds || []).includes(id)) return false;\n  if (step.requiredSubtype && !subtype(target, step.requiredSubtype)) return false;\n  if (step.requiredName && String(target?.name || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase() !== String(step.requiredName).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()) return false;\n  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;\n  if (step.maxCost != null && (target?.cost || 0) > step.maxCost) return false;\n  return true;\n}`,
  `function targetMatchesStep(state, owner, target, id, step) {\n  if ((step.excludeIds || []).includes(id)) return false;\n  if (step.requiredSubtype && !subtype(target, step.requiredSubtype)) return false;\n  if (step.requiredName && String(target?.name || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase() !== String(step.requiredName).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()) return false;\n  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;\n  const dynamicMaxCost = step.maxCostCounter ? (state.players[owner]?.[step.maxCostCounter] || 0) + (step.includeCurrentCardInCounter ? 1 : 0) : step.maxCost;\n  if (dynamicMaxCost != null && (target?.cost || 0) > dynamicMaxCost) return false;\n  return true;\n}`,
  "Dynamic target max cost validation"
);
engine = replaceRequired(engine, `if (isValidTarget(step, owner, targetOwner, targetKind) && targetMatchesStep(target, id, step)) result.push(id);`, `if (isValidTarget(step, owner, targetOwner, targetKind) && targetMatchesStep(state, owner, target, id, step)) result.push(id);`, "Dynamic candidate validation");
engine = replaceRequired(
  engine,
  `|| (step.requiredSubtype && (!target || !subtype(target, step.requiredSubtype)))) throw new RulesViolation("invalid-target");`,
  `|| (!hero && !targetMatchesStep(state, owner, target, id, step))) throw new RulesViolation("invalid-target");`,
  "Selected target uses complete predicate"
);
await writeFile(engineUrl, engine);

const effectsUrl = new URL("../app/rules-engine/effects.mjs", import.meta.url);
let effects = await readFile(effectsUrl, "utf8");
effects = replaceRequired(
  effects,
  `  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },`,
  `  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },\n  modifyStatsFromTurnCardsPlayed(state, effect, context) { const count = player(state, context.owner).turnCardsPlayed || 0; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", attack: count * (effect.attackPerCard || 0), health: count * (effect.healthPerCard || 0) }, context); },`,
  "Turn-card stat scaler"
);
effects = replaceRequired(
  effects,
  `  countedChoice(state, effect, context) { const source = findUnit(state, context.sourceId); const count = source?.[effect.counter] || 0; const branch = effect.branches.find((candidate) => count >= candidate.min && (candidate.max == null || count <= candidate.max)); for (const nested of branch?.effects || []) applyEffect(state, nested, { ...context, count }); },`,
  `  countedChoice(state, effect, context) { const source = findUnit(state, context.sourceId); const counterSource = effect.counterScope === "player" ? player(state, context.owner) : source; const count = counterSource?.[effect.counter] || 0; const branch = effect.branches.find((candidate) => count >= candidate.min && (candidate.max == null || count <= candidate.max)); for (const nested of branch?.effects || []) applyEffect(state, nested, { ...context, count }); },`,
  "Counted choice canonical player counter"
);
await writeFile(effectsUrl, effects);

const rulesUrl = new URL("../app/rules-engine/card-rules.mjs", import.meta.url);
let rules = await readFile(rulesUrl, "utf8");
rules = replaceRequired(
  rules,
  `  p27: [ability("onEnter", [effect("grantNextCardDiscount", { amount: 1, duration: "turn" })])],`,
  `  p27: [ability("onEnter", [effect("grantNextCardDiscount", { amount: 1, duration: "turn" })])],\n  p30: [ability("onPlay", [effect("modifyStatsFromTurnCardsPlayed", { target: "self", attackPerCard: 1, healthPerCard: 1, duration: "turn" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],\n  p32: [ability("static", [effect("keyword", { keyword: "Veloz" })]), ability("onPlay", [effect("destroy", { target: "anyCreature", selections: 1, maxCostCounter: "turnCardsPlayed", includeCurrentCardInCounter: true })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],`,
  "Explicit Biriba and Zoiudo turn-count rules"
);
rules = replaceRequired(
  rules,
  `  p46: [ability("onPlay", [effect("remainUntilTurnEnd"), effect("trackCardsPlayedAfterSelf")]), ability("onTurnEnd", [effect("countedChoice", { counter: "cardsPlayedAfterSelf", branches:`,
  `  p46: [ability("onPlay", [effect("remainUntilTurnEnd")]), ability("onTurnEnd", [effect("countedChoice", { counter: "turnCardsPlayed", counterScope: "player", branches:`,
  "Tranqueira uses canonical turn counter"
);
await writeFile(rulesUrl, rules);

console.log("Applied Support semantics and canonical turn-card counter rules.");
