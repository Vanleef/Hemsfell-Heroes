import { readFile, writeFile } from "node:fs/promises";

const replaceRequired = (text, from, to, label) => {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`Patch anchor not found: ${label}`);
  return text.replace(from, to);
};

const engineUrl = new URL("../app/rules-engine/engine.mjs", import.meta.url);
let engine = await readFile(engineUrl, "utf8");

engine = replaceRequired(
  engine,
  `function adjacentSupportBonus(state, unit, owner) {\n  const entry = state.players[owner]; let attack = 0; let health = 0;\n  for (const source of permanentUnits(entry)) {\n    if (source === unit || source.suffocated || Math.abs((source.slot ?? -10) - (unit.slot ?? 10)) !== 1) continue;\n    const rulesText = [...activeKeywords(source), source.text || ""].join(" ");\n    if (!/\\bsuporte\\b/i.test(rulesText)) continue;\n    const match = rulesText.match(/suporte\\s*:?\\s*([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/i);\n    if (match) { attack += Number(match[1]); health += Number(match[2]); }\n  }\n  return { attack, health };\n}`,
  `function adjacentSupportBonus(state, unit, owner) {\n  const entry = state.players[owner]; let attack = 0; let health = 0;\n  // Canonical supportAura modifiers are materialized by refreshSupportAuras.\n  // Only fall back to parsing printed Support text for legacy cards that do not\n  // expose a compiled supportAura, otherwise the same bonus is counted twice.\n  for (const source of entry.board || []) {\n    if (source === unit || source.suffocated || Math.abs((source.slot ?? -10) - (unit.slot ?? 10)) !== 1) continue;\n    if ((source.staticModifiers || []).some((modifier) => modifier.type === "supportAura")) continue;\n    const rulesText = [...activeKeywords(source), source.text || ""].join(" ");\n    if (!/\\bsuporte\\b/i.test(rulesText)) continue;\n    const match = rulesText.match(/suporte\\s*:?\\s*([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/i);\n    if (match) { attack += Number(match[1]); health += Number(match[2]); }\n  }\n  return { attack, health };\n}`,
  "Support numeric fallback"
);

engine = replaceRequired(
  engine,
  `function refreshSupportAuras(state){for(const entry of state.players)for(const unit of entry.board||[]){unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:"));unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");}state.players.forEach((entry)=>{for(const source of permanentUnits(entry)){if(source.suffocated)continue;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&unit.uid!==source.uid&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(\`support:\${source.uid}:\${aura.keyword}\`);}if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId:source.uid});}}}}});}`,
  `function refreshSupportAuras(state){for(const entry of state.players)for(const unit of entry.board||[]){unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:"));unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");}state.players.forEach((entry)=>{for(const source of entry.board||[]){if(source.suffocated)continue;const sourceId=source.uid||source.id;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(\`support:\${sourceId}:\${aura.keyword}\`);}if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId});}}}}});}`,
  "Support adjacency/self exclusion"
);

engine = replaceRequired(
  engine,
  `if (condition.cardsPlayedBeforeThisAtLeast != null && (state.players[owner].turnCardsPlayed || 0) < condition.cardsPlayedBeforeThisAtLeast) return false;\n  if (condition.cardsPlayedBeforeThisAtMost != null && (state.players[owner].turnCardsPlayed || 0) > condition.cardsPlayedBeforeThisAtMost) return false;`,
  `const cardsPlayedBeforeThis = Math.max(0, (state.players[owner].turnCardsPlayed || 0) - (event.type === "onPlay" && event.owner === owner ? 1 : 0));\n  if (condition.cardsPlayedBeforeThisAtLeast != null && cardsPlayedBeforeThis < condition.cardsPlayedBeforeThisAtLeast) return false;\n  if (condition.cardsPlayedBeforeThisAtMost != null && cardsPlayedBeforeThis > condition.cardsPlayedBeforeThisAtMost) return false;`,
  "Fura-Fila prior-card semantics"
);

engine = replaceRequired(
  engine,
  `return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect", requiredSubtype: effect.requiredSubtype || effect.subtype, requiredName: effect.requiredName, imageOnly: effect.imageOnly, maxCost: effect.maxCost, excludeIds: effect.excludeIds || [] }));`,
  `return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect", requiredSubtype: effect.requiredSubtype || effect.subtype, requiredName: effect.requiredName, imageOnly: effect.imageOnly, maxCost: effect.maxCost, maxCostFromTurnCardsPlayed: !!effect.maxCostFromTurnCardsPlayed, excludeIds: effect.excludeIds || [] }));`,
  "Dynamic target max cost metadata"
);

engine = replaceRequired(
  engine,
  `function targetMatchesStep(target, id, step) {\n  if ((step.excludeIds || []).includes(id)) return false;\n  if (step.requiredSubtype && !subtype(target, step.requiredSubtype)) return false;\n  if (step.requiredName && String(target?.name || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase() !== String(step.requiredName).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()) return false;\n  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;\n  if (step.maxCost != null && (target?.cost || 0) > step.maxCost) return false;\n  return true;\n}`,
  `function targetMatchesStep(state, owner, target, id, step) {\n  if ((step.excludeIds || []).includes(id)) return false;\n  if (step.requiredSubtype && !subtype(target, step.requiredSubtype)) return false;\n  if (step.requiredName && String(target?.name || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase() !== String(step.requiredName).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()) return false;\n  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;\n  if (step.maxCost != null && (target?.cost || 0) > step.maxCost) return false;\n  if (step.maxCostFromTurnCardsPlayed && (target?.cost || 0) > (state.players[owner].turnCardsPlayed || 0)) return false;\n  return true;\n}`,
  "Dynamic target validation"
);

engine = replaceRequired(
  engine,
  `if (isValidTarget(step, owner, targetOwner, targetKind) && targetMatchesStep(target, id, step)) result.push(id);`,
  `if (isValidTarget(step, owner, targetOwner, targetKind) && targetMatchesStep(state, owner, target, id, step)) result.push(id);`,
  "Dynamic target candidate filtering"
);

engine = replaceRequired(
  engine,
  `(!hero && !targetMatchesStep(target, id, step))`,
  `(!hero && !targetMatchesStep(state, decision.owner, target, id, step))`,
  "Dynamic target decision validation"
);

await writeFile(engineUrl, engine);

const effectsUrl = new URL("../app/rules-engine/effects.mjs", import.meta.url);
let effects = await readFile(effectsUrl, "utf8");
effects = replaceRequired(
  effects,
  `  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },`,
  `  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },\n  destroyByCardsPlayedThisTurnCost(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); const count = player(state, context.owner).turnCardsPlayed || 0; if (!target || target.type !== "Criatura" || (target.cost || 0) > count) throw new RulesViolation("invalid-target"); defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); },`,
  "Zoiudo turn-card-count effect"
);
await writeFile(effectsUrl, effects);

const rulesUrl = new URL("../app/rules-engine/card-rules.mjs", import.meta.url);
let rules = await readFile(rulesUrl, "utf8");
rules = replaceRequired(
  rules,
  `  p37: [ability("activated", [effect("damageFromSacrificedAttack", { target: "anyCharacter", selections: 1 })], [{ type: "sacrifice", amount: 1, subtype: "Goblin" }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } })],`,
  `  p32: [ability("onPlay", [effect("destroyByCardsPlayedThisTurnCost", { target: "anyCreature", selections: 1, maxCostFromTurnCardsPlayed: true })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],\n  p37: [ability("activated", [effect("damageFromSacrificedAttack", { target: "anyCharacter", selections: 1 })], [{ type: "sacrifice", amount: 1, subtype: "Goblin" }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } })],`,
  "Explicit Zoiudo rule"
);
await writeFile(rulesUrl, rules);

console.log("Applied Support adjacency, canonical turn counter, Zoiudo, and post-self Tranqueira rules.");
