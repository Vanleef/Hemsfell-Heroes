import { applyEffect, defaultEffectHandlers, RulesViolation } from "./effects.mjs";
import { hasSubtype } from "./subtypes.mjs";
import { isValidTarget, targetPolicy, TargetScope } from "./targeting.mjs";

export class RulesLoopError extends Error {
  constructor(message, trace) { super(message); this.name = "RulesLoopError"; this.trace = trace; }
}

const INTERACTIVE_EFFECTS = new Set();
export function canExecuteCard(card, handlers = defaultEffectHandlers) {
  if (!handlers || typeof handlers !== "object") handlers = defaultEffectHandlers;
  const inspect = (effects = []) => effects.every((effect) => !!handlers[effect.type] && effect.type !== "unsupported" && !INTERACTIVE_EFFECTS.has(effect.type) && inspect(effect.effects) && (effect.branches || []).every((branch) => inspect(branch.effects)) && (effect.choices || []).every(inspect));
  return (card?.abilities || []).every((ability) => inspect(ability.effects));
}

const clone = (value) => structuredClone(value);
const fingerprint = (state, stack) => JSON.stringify({ active: state.active, phase: state.phase, round: state.round, pendingAction: state.pendingAction?.type || null, players: state.players.map((p) => ({ life: p.life, energy: p.energy, reserve: p.reserve, hand: p.hand.length, deck: p.deck.length, board: p.board.map((u) => [u.uid, u.damage, u.exhausted, u.markers]) })), stack: stack.map((item) => [item.kind, item.effect?.type, item.event?.type]) });

export function validateCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") { const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === context.sourceId); if (!source || source.exhausted || source.summoning || source.enteredRound === state.round) throw new RulesViolation("cannot-tap"); }
    if (cost.type === "removeMarkers") { const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); const available = typeof source?.markers === "number" ? source.markers : Object.values(source?.markers || {}).reduce((sum, value) => sum + Number(value), 0); const requested = cost.amount === "X" ? Number(context.markerAmount || 0) : cost.amount; if (requested < (cost.minimum || 0) || (cost.multipleOf && requested % cost.multipleOf) || available < requested) throw new RulesViolation("not-enough-markers"); }
    if (cost.type === "sacrifice") { const ids = [...new Set(context.sacrificeIds || [])]; if (ids.length < cost.amount || ids.some((id) => !entry.board.some((unit) => unit.uid === id && (!cost.subtype || subtype(unit, cost.subtype))))) throw new RulesViolation("sacrifice-required"); }
    if (cost.type === "energy") { const source = permanentUnits(entry).find((unit) => unit.uid === context.sourceId); const available = entry.energy + (source?.type !== "Criatura" ? entry.reserve : 0); if (available < cost.amount) throw new RulesViolation("not-enough-energy"); }
    if (cost.type === "life") {
      const minimumLife = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0;
      if (entry.life - cost.amount < minimumLife) throw new RulesViolation("not-enough-life");
    }
    if (cost.type === "removeMarkersFromConstants") { const available = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].reduce((sum, card) => sum + (typeof card.markers === "number" ? card.markers : Object.values(card.markers || {}).reduce((total, value) => total + Number(value), 0)), 0); if (available < cost.amount) throw new RulesViolation("not-enough-markers"); }
  }
}

function payCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") applyEffect(state, { type: "tap" }, context);
    if (cost.type === "sacrifice") { const chosen = (context.sacrificeIds || []).map((id) => entry.board.find((unit) => unit.uid === id)).filter(Boolean); context.paidSacrificeAttack = chosen.reduce((sum, unit) => sum + effectiveAttack(state, unit, context.owner), 0); applyEffect(state, { type: "sacrifice" }, context); }
    if (cost.type === "energy") { const source = permanentUnits(entry).find((unit) => unit.uid === context.sourceId); const fromEnergy = Math.min(entry.energy, cost.amount); entry.energy -= fromEnergy; const fromReserve = source?.type !== "Criatura" ? cost.amount - fromEnergy : 0; entry.reserve -= fromReserve; }
    if (cost.type === "life") {
      entry.life -= cost.amount;
      entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + cost.amount;
      entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1;
      if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1;
      state.rulesEvents ||= [];
      state.rulesEvents.push({ type: "onLifeLost", owner: context.owner, sourceOwner: context.owner, sourceId: context.sourceId, amount: cost.amount, paidAsCost: true });
    }
    if (cost.type === "removeMarkers") {
      const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); let remaining = cost.amount === "X" ? context.markerAmount || 0 : cost.amount;
      if (typeof source.markers === "number") source.markers -= Math.min(source.markers, remaining); else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; }
    }
    if (cost.type === "removeMarkersFromConstants") {
      let remaining = cost.amount; for (const source of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) { if (!remaining) break; if (typeof source.markers === "number") { const used = Math.min(source.markers, remaining); source.markers -= used; remaining -= used; } else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; } }
    }
  }
}

function modifierApplies(state, owner, modifier, unit) { if (modifier.expiresRound != null && state.round >= modifier.expiresRound) return false; if(unit?.suffocated&&(modifier.attack>0||modifier.health>0))return false; return modifier.condition !== "controllerTurn" || state.active === owner; }
function activeKeywords(unit) { return unit?.suffocated ? [] : [...(unit?.tags || []), ...(unit?.temporaryTags || []), ...(unit?.grantedKeywords || []).map((value)=>String(value).replace(/^(?:attachment|support):[^:]+:/,""))]; }
function hasKeyword(unit, pattern) { return activeKeywords(unit).some((tag) => pattern.test(String(tag))); }
function attackPermissionMet(unit) {
  const requirement = unit?.attackPermission?.requiresMarkers;
  if (!requirement) return true;
  const available = typeof unit.markers === "number" ? unit.markers : unit.markers?.[requirement.marker] || 0;
  return available >= requirement.minimum;
}
function defenderCapacity(unit) {
  if (unit?.suffocated) return 1;
  const rulesText = [...activeKeywords(unit), unit?.text || ""].join(" ");
  const match = rulesText.match(/defensor\s*(\d+)/i);
  return Math.max(1, Number(match?.[1] || 1));
}
function adjacentSupportBonus(state, unit, owner) {
  const entry = state.players[owner]; let attack = 0; let health = 0;
  for (const source of entry.board || []) {
    if (source === unit || source.suffocated || Math.abs((source.slot ?? -10) - (unit.slot ?? 10)) !== 1) continue;
    if ((source.staticModifiers || []).some((modifier) => modifier.type === "supportAura" && (modifier.attack || modifier.health))) continue;
    const rulesText = [...activeKeywords(source), source.text || ""].join(" ");
    if (!/\bsuporte\b/i.test(rulesText)) continue;
    const match = rulesText.match(/suporte\s*:?\s*([+-]?\d+)\s*\/\s*([+-]?\d+)/i);
    if (match) { attack += Number(match[1]); health += Number(match[2]); }
  }
  return { attack, health };
}
function baseAttack(state, unit, owner) { if (!unit?.suffocated && unit?.dynamicStats?.subtypeCountAcrossFields) return state.players.flatMap((entry) => entry.board).filter((card) => subtype(card, unit.dynamicStats.subtypeCountAcrossFields)).length; const support = unit?.suffocated ? {attack:0} : adjacentSupportBonus(state, unit, owner); return Math.max(0, (unit?.atk || 0) + support.attack + (unit?.modifiers || []).filter((value) => modifierApplies(state, owner, value, unit)).reduce((sum, value) => sum + (value.attack || 0), 0)); }
function effectiveAttack(state, unit, owner) {
  if (unit?.frozen || hasKeyword(unit, /congelado/i)) return 0;
  if (!unit?.suffocated && unit?.dynamicStats?.bothFromAttack) { const strongest = state.players[owner].board.filter((candidate) => candidate !== unit).reduce((best, candidate) => Math.max(best, baseAttack(state, candidate, owner)), 0); return strongest; }
  return baseAttack(state, unit, owner);
}
function effectiveHealth(state, unit, owner) {
  if (!unit?.suffocated && unit?.dynamicStats?.subtypeCountAcrossFields) return Math.max(1, state.players.flatMap((entry) => entry.board).filter((card) => subtype(card, unit.dynamicStats.subtypeCountAcrossFields)).length);
  if (!unit?.suffocated && unit?.dynamicStats?.bothFromAttack) { const strongest = state.players[owner].board.filter((candidate) => candidate !== unit).reduce((best, candidate) => Math.max(best, baseAttack(state, candidate, owner)), 0); return Math.max(1, strongest); }
  const support = unit?.suffocated ? {health:0} : adjacentSupportBonus(state, unit, owner);
  return Math.max(0, (unit?.hp || 1) + support.health + (unit?.modifiers || []).filter((value) => modifierApplies(state, owner, value, unit)).reduce((sum, value) => sum + (value.health || 0), 0));
}
function dealCombatDamage(state, target, targetOwner, source, sourceOwner, amount) {
  const shield = (target.damageShields || []).find((item) => item.uses > 0); const shieldReduction = shield?.reduction ?? (shield ? Number.POSITIVE_INFINITY : 0);
  if (shield) { shield.uses--; target.damageShields = target.damageShields.filter((item) => item.uses > 0); }
  const dealt = Math.max(0, amount - (hasKeyword(target, /robusto/i) ? 1 : 0) - shieldReduction);
  target.damage = (target.damage || 0) + dealt;
  if (dealt > 0 && hasKeyword(source, /toque da morte/i)) target.damage = Math.max(target.damage, effectiveHealth(state, target, targetOwner));
  if (dealt > 0 && hasKeyword(source, /roubo de vida/i)) { const entry = state.players[sourceOwner]; entry.life = Math.min(entry.maxLife ?? 30, entry.life + dealt); }
  return dealt;
}
function subtype(card, value) { return hasSubtype(card, value) || (card.tags || []).some((tag) => String(tag).toLowerCase() === String(value).toLowerCase()); }
function conditionMatches(state, source, owner, condition, event = {}) {
  if (!condition) return true;
  const cardsPlayedBeforeThis = Math.max(0, (state.players[owner].turnCardsPlayed || 0) - (event.type === "onPlay" && event.owner === owner ? 1 : 0));
  if (condition.cardsPlayedBeforeThisAtLeast != null && cardsPlayedBeforeThis < condition.cardsPlayedBeforeThisAtLeast) return false;
  if (condition.cardsPlayedBeforeThisAtMost != null && cardsPlayedBeforeThis > condition.cardsPlayedBeforeThisAtMost) return false;
  if (condition.controllerTurn && state.active !== owner) return false;
  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }
  if (condition.controllerControlsSubtype) { const entry = state.players[owner]; const controlled = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]; if (!controlled.some((card) => subtype(card, condition.controllerControlsSubtype))) return false; }
  if (condition.all) return condition.all.every((item) => conditionMatches(state, source, owner, item, event));
  const eventCard = event.card || state.players.flatMap((entry) => [...entry.board, ...entry.support, ...entry.grave]).find((card) => card.uid === event.cardId || card.id === event.cardId);
  if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;
  if (condition.eventCardKeyword && !hasKeyword(eventCard || {}, new RegExp(String(condition.eventCardKeyword).replace(/[.*+?^${}()|[\]\\]/g, "\\if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;"), "i"))) return false;
  if (condition.eventKilledBySource && event.card?.killedByRepeatSourceId !== (source.uid || source.id)) return false;
  if (condition.eventCardKeyword && !hasKeyword(eventCard || {}, new RegExp(String(condition.eventCardKeyword).replace(/[.*+?^${}()|[\]\\]/g, "\\if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;"), "i"))) return false;
  if (condition.eventKilledBySource && event.card?.killedByRepeatSourceId !== (source.uid || source.id)) return false;
  if (condition.eventCardKeyword && !hasKeyword(eventCard || {}, new RegExp(String(condition.eventCardKeyword).replace(/[.*+?^${}()|[\]\\]/g, "\\if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;"), "i"))) return false;
  if (condition.eventKilledBySource && event.card?.killedByRepeatSourceId !== (source.uid || source.id)) return false;
  if (condition.eventCardKeyword && !hasKeyword(eventCard || {}, new RegExp(String(condition.eventCardKeyword).replace(/[.*+?^${}()|[\]\\]/g, "\\if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;"), "i"))) return false;
  if (condition.eventKilledBySource && event.card?.killedByRepeatSourceId !== (source.uid || source.id)) return false;
  if (condition.eventCardKeyword && !hasKeyword(eventCard || {}, new RegExp(String(condition.eventCardKeyword).replace(/[.*+?^${}()|[\]\\]/g, "\\if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;"), "i"))) return false;
  if (condition.eventKilledBySource && event.card?.killedByRepeatSourceId !== (source.uid || source.id)) return false;
  if (condition.eventCardType && eventCard?.type !== condition.eventCardType) return false;
  if (condition.eventCardTypeNot && (eventCard?.type === condition.eventCardTypeNot || eventCard?.imageCard)) return false;
  if (condition.spellElement && !(event.card?.tags || eventCard?.tags || []).includes(condition.spellElement)) return false;
  if (condition.sourceSubtype && !subtype(event.source || {}, condition.sourceSubtype)) return false;
  if (condition.controllerSubtypeEnteredThisTurn && (state.players[owner].subtypesEnteredThisTurn?.[condition.controllerSubtypeEnteredThisTurn.subtype] || 0) !== condition.controllerSubtypeEnteredThisTurn.count) return false;
  if (condition.activePlayerControlsVanillaCreature && !state.players[state.active].board.some((card) => !(card.text || "").trim())) return false;
  if (condition.wasOnlySubtypeInAllFields && state.players.flatMap((entry) => entry.board).filter((card) => subtype(card, condition.wasOnlySubtypeInAllFields)).length > 0) return false;
  if (condition.sourceSurvived && !permanentUnits(state.players[owner]).some((card) => card.uid === source.uid || card.id === source.id)) return false;
  if (condition.spellNameIncludes && !String(event.card?.name || eventCard?.name || "").toLowerCase().includes(String(condition.spellNameIncludes).toLowerCase())) return false;
  if (condition.nameIncludes && !String(event.card?.name || event.effectSource?.name || "").toLowerCase().includes(String(condition.nameIncludes).toLowerCase())) return false;
  if (condition.eventOwnerIsController && event.owner !== owner) return false;
  if (condition.eventOwnerIsOpponent && event.owner === owner) return false;
  if (condition.outsideMaintenance && !event.outsideMaintenance) return false;
  if (condition.controllerOnlyCopyNamed && permanentUnits(state.players[owner]).filter((card) => String(card.name || "").toLowerCase() === String(condition.controllerOnlyCopyNamed).toLowerCase()).length !== 1) return false;
  if (condition.otherThanSource && (event.sourceId === source.uid || event.cardId === source.uid || event.cardId === source.id)) return false;
  if (condition.eventTargetType) { const targets = (event.targetIds || []).map((id) => state.players.flatMap((entry) => permanentUnits(entry)).find((card) => card.uid === id || card.id === id)).filter(Boolean); if (!targets.some((target) => target.type === condition.eventTargetType)) return false; }
  return true;
}

function playConditionMatches(state, owner, condition) {
  if (!condition) return true;
  if (condition.controllerGraveHasSubtype && !state.players[owner].grave.some((card) => subtype(card, condition.controllerGraveHasSubtype))) return false;
  if (condition.alliedPermanentHasTrigger) return permanentUnits(state.players[owner]).some((card) => (card.abilities || []).some((ability) => {
    if (ability.trigger !== condition.alliedPermanentHasTrigger) return false;
    const steps = abilityTargetSteps(ability);
    return !steps.length || canSatisfyTargetSteps(state, owner, steps);
  }));
  return true;
}
function availabilityMatches(state, source, owner, availability) {
  if (!availability) return true;
  if (availability.topGraveHasTrigger) { const top = state.players[owner].grave.at(-1); return !!top && (top.abilities || []).some((ability) => ability.trigger === availability.topGraveHasTrigger); }
  if (availability.whileDefending && (state.phase !== "combate" || !(source.defenseUses > 0))) return false;
  if (availability.controllerHasFaction && !permanentUnits(state.players[owner]).some((card) => (card.tags || []).some((tag) => String(tag).toLowerCase() === String(availability.controllerHasFaction).toLowerCase()))) return false;
  return true;
}
function eventAppliesToSource(event, source, owner) {
  const sourceId = source.uid || source.id;
  if (["onEnter", "onDestroyed", "onAttack", "onCombatKill", "onCombatDamage"].includes(event.type)) return sourceId === event.sourceId;
  if (event.type === "onDamageTaken") return sourceId === event.targetId;
  if (event.type === "onTargetedBySpell") return (event.targetIds || []).includes(sourceId);
  if (event.type === "onAttachedCreatureDamage" || event.type === "onAttachedCreatureTargeted") return source.attachedTo === event.sourceId || (event.targetIds || []).includes(source.attachedTo);
  if (event.type === "onOpponentSpellAttempt") return event.owner !== owner;
  if (event.type === "onTargetedByOpponent") return event.owner !== owner && (event.targetIds || []).includes(sourceId);
  if (event.type === "onSpellCast") return event.owner === owner;
  return true;
}

function usageKey(source, ability) { return `${source.uid || source.id}:${ability.id}`; }
function isOncePerTurnAbility(ability) { return ability?.trigger === "activated" || !!ability?.usageLimit || !!ability?.condition?.firstEachTurn; }
function usageAvailable(state, source, owner, ability) { if (!isOncePerTurnAbility(ability)) return true; return !(state.players[owner].abilityUses || {})[usageKey(source, ability)]; }
function claimUsage(state, source, owner, ability) { if (!isOncePerTurnAbility(ability)) return; state.players[owner].abilityUses ||= {}; state.players[owner].abilityUses[usageKey(source, ability)] = (state.players[owner].abilityUses[usageKey(source, ability)] || 0) + 1; }

const permanentUnits = (entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])];
const markerTotalForEngine = (card) => typeof card?.markers === "number" ? card.markers : Object.values(card?.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const markerTotalForEngineAll = (entry) => permanentUnits(entry).reduce((sum, card) => sum + markerTotalForEngine(card), 0);
function removeMarkersForEngine(card, amount) { if (typeof card.markers === "number") { card.markers -= amount; return; } for (const key of Object.keys(card.markers || {})) { const used = Math.min(card.markers[key], amount); card.markers[key] -= used; amount -= used; if (!amount) return; } }
function removeMarkersAcross(entry, amount) { for (const card of permanentUnits(entry)) { const used = Math.min(markerTotalForEngine(card), amount); removeMarkersForEngine(card, used); amount -= used; if (!amount) return; } }
const findPermanentById = (state, id) => state.players.flatMap(permanentUnits).find((card) => card.uid === id || card.id === id);
const nextCardDiscount = (entry, card, round = 0) => (entry.nextCardDiscounts || []).find((rule) => (rule.expiresRound == null || round < rule.expiresRound) && (!rule.type || rule.type === card.type) && (!rule.typeNot || rule.typeNot !== card.type));
function intrinsicCost(state, entry, card) {
  if (card.page === 13 && entry.board.some((unit) => unit.page === 23)) return -2;
  if (card.page === 14 && entry.board.some((unit) => unit.page === 24)) return -3;
  if (card.page === 88) return Math.max(0, entry.hand.length - 1) - (card.cost || 0);
  if (card.page === 139) return Math.max(1, (card.cost || 0) - (entry.lifeLostThisTurn || 0)) - (card.cost || 0);
  if (card.page === 42 && (entry.turnCardsPlayed || 0) >= 1) return -1;
  if (entry.heroId === "goblin" && (entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !(entry.subtypesEnteredThisTurn?.Goblin || 0)) return -(card.cost || 0);
  if (card.page === 42 && (entry.turnCardsPlayed || 0) >= 1) return -1;
  if (entry.heroId === "goblin" && (entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !(entry.subtypesEnteredThisTurn?.Goblin || 0)) return -(card.cost || 0);
  if (card.page === 42 && (entry.turnCardsPlayed || 0) >= 1) return -1;
  if (entry.heroId === "goblin" && (entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !(entry.subtypesEnteredThisTurn?.Goblin || 0)) return -(card.cost || 0);
  if (card.page === 42 && (entry.turnCardsPlayed || 0) >= 1) return -1;
  if (entry.heroId === "goblin" && (entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !(entry.subtypesEnteredThisTurn?.Goblin || 0)) return -(card.cost || 0);
  if (card.page === 42 && (entry.turnCardsPlayed || 0) >= 1) return -1;
  if (entry.heroId === "goblin" && (entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !(entry.subtypesEnteredThisTurn?.Goblin || 0)) return -(card.cost || 0);
  if (card.page === 149) return -entry.board.filter((unit) => subtype(unit, "Vampiro")).length;
  if (card.page === 203) return -2 * entry.board.length;
  return 0;
}
function targetSurcharge(state, owner, card, targetIds = []) { if (card.type !== "Feitiço") return 0; return targetIds.reduce((sum, id) => { const targetOwner = unitOwner(state, id); const target = targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); return sum + (target?.suffocated ? 0 : target?.spellTargetSurcharge || 0); }, 0); }
function refreshSupportAuras(state){for(const entry of state.players)for(const unit of entry.board||[]){unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:"));unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");}state.players.forEach((entry)=>{for(const source of entry.board||[]){if(source.suffocated)continue;const sourceId=source.uid||source.id;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(`support:${sourceId}:${aura.keyword}`);}if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId});}}}}});}
const unitOwner = (state, id) => state.players.findIndex((entry) => permanentUnits(entry).some((unit) => unit.uid === id || unit.id === id));
const targetScope = (value) => ({ anyCharacter: TargetScope.ANY_CHARACTER, anyCreature: TargetScope.ANY_CREATURE, allyCreature: TargetScope.ALLY_CREATURE, enemyCreature: TargetScope.ENEMY_CREATURE, anyPermanent: TargetScope.ANY_PERMANENT, allyPermanent: TargetScope.ALLY_PERMANENT, enemyPermanent: TargetScope.ENEMY_PERMANENT, anotherAllyPermanent: TargetScope.ALLY_PERMANENT, creature: TargetScope.ANY_CREATURE }[value] || TargetScope.NONE);
function abilityTargetSteps(ability) {
  if (ability.sourceText) return (targetPolicy(ability.sourceText).steps || []).filter((step) => step.role !== "sacrifice");
  return (ability.effects || []).flatMap((effect) => {
    const scope = targetScope(effect.target);
    return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect", requiredSubtype: effect.requiredSubtype, requiredName: effect.requiredName, imageOnly: effect.imageOnly, maxCost: effect.maxCost, excludeIds: effect.excludeIds || [] }));
  }).filter((step) => step.scope !== TargetScope.NONE);
}
function targetMatchesStep(target, id, step) {
  if ((step.excludeIds || []).includes(id)) return false;
  if (step.requiredSubtype && !subtype(target, step.requiredSubtype)) return false;
  if (step.requiredName && String(target?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== String(step.requiredName).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) return false;
  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;
  if (step.maxCost != null && (target?.cost || 0) > step.maxCost) return false;
  return true;
}
function targetCandidates(state, owner, step) {
  const result = [];
  state.players.forEach((entry, targetOwner) => {
    for (const target of permanentUnits(entry)) {
      const id = target.uid || target.id;
      const targetKind = entry.board.includes(target) || target.type === "Criatura" ? "creature" : "permanent";
      if (isValidTarget(step, owner, targetOwner, targetKind) && targetMatchesStep(target, id, step)) result.push(id);
    }
    if (isValidTarget(step, owner, targetOwner, "hero") && !(step.excludeIds || []).includes(targetOwner === owner ? "ally-hero" : "enemy-hero")) result.push(targetOwner === owner ? "ally-hero" : "enemy-hero");
  });
  return result;
}
function canSatisfyTargetSteps(state, owner, steps) {
  const candidates = steps.map((step) => targetCandidates(state, owner, step));
  const choose = (index, used) => index >= candidates.length || candidates[index].some((id) => {
    if (used.has(id)) return false;
    const next = new Set(used); next.add(id);
    return choose(index + 1, next);
  });
  return choose(0, new Set());
}
function replayAbilityCandidates(state, owner, effect) {
  return (state.players[owner].board || []).filter((card) => (!effect.selector?.type || card.type === effect.selector.type) && (card.abilities || []).some((ability) => {
    if (ability.trigger !== effect.trigger) return false;
    const steps = abilityTargetSteps(ability);
    return !steps.length || canSatisfyTargetSteps(state, owner, steps);
  }));
}
function validateTargets(state, owner, abilities, command, source) {
  const targetIds = command.targetIds || []; const steps = abilities.flatMap(abilityTargetSteps); if (steps.length !== targetIds.length) { if (steps.length || targetIds.length) throw new RulesViolation("invalid-target-count"); return; }
  steps.forEach((step, index) => { const id = targetIds[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - owner : id === "ally-hero" || id === "controller-hero" ? owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, owner, targetOwner, targetKind) || (step.requireExhausted && (!target || !target.exhausted)) || (step.requiredSubtype && (!target || !subtype(target, step.requiredSubtype)))) throw new RulesViolation("invalid-target"); const barrier = target && hasKeyword(target, /barreira m[aá]gica/i); if (barrier && !/ignora.*barreira m[aá]gica/i.test(source?.text || "")) throw new RulesViolation("magic-barrier"); });
}
function preflightPlay(state, command, handlers) {
  const entry = state.players[command.owner];
  const card = entry?.hand?.find((candidate) => candidate.id === command.cardId);
  if (!card) throw new RulesViolation("card-not-in-hand");
  if (!canExecuteCard(card, handlers)) throw new RulesViolation("card-not-migrated");
  const accelerated = (card.tags || []).some((tag) => /acelerado/i.test(tag)) || /acelerado/i.test(card.text || "");
  if (state.active !== command.owner && !(accelerated && command.hasPriority)) throw new RulesViolation("not-your-priority");
  if (state.phase !== "principal" && !(accelerated && command.hasPriority)) throw new RulesViolation("wrong-phase");
  const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay" && conditionMatches(state, card, command.owner, ability.condition, { card }));
  const enterAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onEnter" && conditionMatches(state, card, command.owner, ability.condition, { card }));
  if (playAbilities.some((ability) => !playConditionMatches(state, command.owner, ability.playCondition) || ability.effects.some((effect) => effect.type === "replaySelectedAbility" && !replayAbilityCandidates(state, command.owner, effect).length))) throw new RulesViolation("play-condition-not-met");
  if (card.type !== "Criatura" || (command.targetIds || []).length) validateTargets(state, command.owner, card.type === "Criatura" ? enterAbilities : playAbilities, command, card);
  for (const ability of playAbilities) validateCosts(state, ability, command);
  const staticDiscount = permanentUnits(entry).filter((source) => !source.suffocated).flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === command.owner) && (!modifier.firstEachTurn || !(entry.turnCardsPlayed || 0))).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
  const queuedDiscount = nextCardDiscount(entry, card, state.round);
  const cardModifier = card.costModifierExpiresRound != null && state.round >= card.costModifierExpiresRound ? 0 : card.costModifier || 0;
  const cost = Math.max(0, (card.cost || 0) + intrinsicCost(state, entry, card) + targetSurcharge(state, command.owner, card, command.targetIds) + cardModifier + staticDiscount - (queuedDiscount?.amount || 0));
  const paysLife = card.type === "Criatura" && !!entry.nextCreaturePaysLife;
  const available = accelerated && state.active !== command.owner ? entry.reserve : paysLife ? entry.life - (entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0) : entry.energy + (card.type !== "Criatura" ? entry.reserve : 0);
  if (available < cost) throw new RulesViolation(paysLife ? "not-enough-life" : "not-enough-energy");
  if (card.type === "Criatura") {
    if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot > 4) throw new RulesViolation("invalid-creature-slot");
    const occupied = entry.board.find((unit) => unit.slot === command.slot);
    if ((occupied && entry.board.length < 5) || (!occupied && entry.board.length >= 5)) throw new RulesViolation("creature-zone-full");
  } else if (card.type === "Artefato" || card.type === "Encanto") {
    if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot > 4 || entry.support.some((unit) => unit.slot === command.slot) || entry.support.length >= 5) throw new RulesViolation("support-zone-full");
    if (card.type === "Artefato" && card.page !== 304) {
      const host = entry.board.find((unit) => unit.uid === command.attachedTo);
      if (!host || host.slot !== command.slot || entry.support.some((unit) => unit.attachedTo === host.uid)) throw new RulesViolation("artifact-target-required");
    }
  }
  return { card, playAbilities, enterAbilities, cost };
}
function cleanupLethal(state, stack) {
  state.players.forEach((entry, owner) => {
    for (const unit of [...entry.board]) {
      const modifiers = (unit.modifiers || []).filter((item) => modifierApplies(state, owner, item)).reduce((sum, item) => sum + (item.health || 0), 0);
      const lethal = (unit.damage || 0) >= (unit.hp || 1) + modifiers;
      const protector = permanentUnits(entry).find((source) => !source.suffocated && (source.staticModifiers || []).some((item) => item.type === "protectAlliedDragonsOncePerTurn") && subtype(unit, "Dragão") && usageAvailable(state, source, owner, { id: "dragon-lethal-protection", usageLimit: { count: 1, period: "turn" } }));
      if (!lethal || hasKeyword(unit, /indestrut[ií]vel/i)) continue;
      if (protector) { unit.damage = Math.max(0, (unit.hp || 1) + modifiers - 1); claimUsage(state, protector, owner, { id: "dragon-lethal-protection", usageLimit: { count: 1, period: "turn" } }); continue; }
      entry.board.splice(entry.board.indexOf(unit), 1);
      const attachments = entry.support.filter((card) => card.attachedTo === unit.uid);
      entry.support = entry.support.filter((card) => card.attachedTo !== unit.uid);
      for (const attachment of attachments) { const survivesHost = (attachment.abilities || []).some((ability) => ability.trigger === "onAttachedHostDestroyed"); if (survivesHost) { attachment.attachedTo = undefined; attachment.slot = unit.slot; entry.support.push(attachment); stack.push({ kind: "event", event: { type: "onAttachedHostDestroyed", owner, sourceId: attachment.uid || attachment.id, card: attachment, host: unit } }); continue; } if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(resetCardForZone(state, attachment)); else entry.grave.push(resetCardForZone(state, attachment)); }
      if (!unit.generatedImage && !unit.imageCard) entry.grave.push(resetCardForZone(state, unit));
      if (!unit.suppressDeathTrigger && !unit.generatedImage && !unit.imageCard) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } });
      stack.push({ kind: "event", event: { type: "onCreatureDestroyed", owner, cardId: unit.uid, card: unit } });
    }
  });
}

function resetCardForZone(state, card) {
  const template=(state.cardCatalog||[]).find((item)=>item.page===card.page)||card;
  return { page:template.page,id:card.id,name:template.name,type:template.type,cost:template.cost,atk:template.atk,hp:template.hp,text:template.text,tags:[...(template.tags||[])],subtypes:[...(template.subtypes||[])],abilities:clone(template.abilities||[]),image:template.image,hero:template.hero,imageCard:template.imageCard,generatedImage:card.generatedImage };
}

function activeAbilities(state, event) {
  const result = [];
  if (["onDestroyed", "onPermanentLeaves", "onCreatureEnter"].includes(event.type) && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
    for (const source of permanentUnits(entry)) {
      const modifiers = source.staticModifiers || [];
      const active = event.owner === owner && (((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && modifiers.some((modifier) => modifier.type === "recruitFirstActOnLeave")) || (event.type === "onCreatureEnter" && event.sourceId !== source.uid && modifiers.some((modifier) => modifier.type === "doubleRecruitFirstAct")));
      if (active) { const effects = (event.card.abilities || []).filter((ability) => ability.trigger === "onEnter").flatMap((ability) => ability.effects || []); if (effects.length) result.push({ source, owner, ability: { id: `${source.uid}-recruit-passive`, effects, replaySourceId: event.card.uid || event.card.id } }); }
    }
  });
  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && !event.card.suffocated) for (const ability of event.card.abilities || []) if (ability.trigger === event.type && conditionMatches(state, event.card, event.owner, ability.condition, event) && usageAvailable(state, event.card, event.owner, ability)) result.push({ source: event.card, owner: event.owner, ability });
  state.players.forEach((entry, owner) => {
      for (const source of permanentUnits(entry)) {
      if (source.suffocated) continue;
      for (const ability of source.abilities || []) if (ability.trigger === event.type && eventAppliesToSource(event, source, owner) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) result.push({ source, owner, ability });
    }
  });
  state.players.forEach((entry, owner) => {
    if (entry.heroId !== "goblin") return;
    const heroSource = { uid: `goblin-hero-${owner}`, id: `goblin-hero-${owner}`, name: "Sr. Goblin, o Mercador de Bugigangas", slot: -1 };
    if ((entry.level || 1) >= 1 && event.type === "onPermanentLeaves" && event.owner === owner && subtype(event.card || {}, "Goblin")) {
      const ability = { id: "goblin-hero-level-1", trigger: "onPermanentLeaves", effects: [{ type: "draw", amount: 1 }], usageLimit: { count: 1, period: "turn" } };
      if (usageAvailable(state, heroSource, owner, ability)) result.push({ source: heroSource, owner, ability });
    }
    if ((entry.level || 1) >= 2 && event.type === "onMaintenance" && event.owner === owner) {
      result.push({ source: heroSource, owner, ability: { id: "goblin-hero-level-2", trigger: "onMaintenance", effects: [{ type: "draw", amount: 1 }] } });
    }
  });
  return result.sort((a, b) => a.owner - b.owner || (a.source.slot ?? 99) - (b.source.slot ?? 99) || String(a.ability.id).localeCompare(String(b.ability.id)));
}

export function executeCommand(inputState, command, options = {}) {
  const state = clone(inputState); const originalPhase = inputState.phase; const maxSteps = options.maxSteps ?? 512; const maxRepeats = options.maxRepeats ?? 4; const handlers = { ...defaultEffectHandlers, ...(options.handlers || {}) }; let actionLabel = command.type;
  const stack = [{ kind: "command", command }]; const trace = []; const repeats = new Map(); let steps = 0;
  while (stack.length) {
    refreshSupportAuras(state);
    if (++steps > maxSteps) throw new RulesLoopError(`Resolution exceeded ${maxSteps} steps`, trace);
    const key = fingerprint(state, stack); const count = (repeats.get(key) || 0) + 1; repeats.set(key, count); if (count > maxRepeats) throw new RulesLoopError("Repeated resolution state detected", trace);
    const item = stack.pop(); trace.push({ step: steps, kind: item.kind, type: item.command?.type || item.effect?.type || item.event?.type });
    if (item.kind === "command") {
      if (item.command.type === "passPriority") {
        const pending = state.pendingResponse;
        if (!pending || pending.responder !== item.command.owner) throw new RulesViolation("not-your-priority");
        if ((pending.passes || 0) === 0) state.pendingResponse = { ...pending, responder: pending.actor, passes: 1 };
        else {
          const original = state.pendingAction;
          state.pendingResponse = null; delete state.pendingAction;
          if (original) stack.push({ kind: "command", command: { ...original, skipPriority: true } });
          else if (state.combatAction?.stage === "priority") state.combatAction = { ...state.combatAction, stage: "choosing" };
        }
      } else if (item.command.type === "declareAttack") {
        if (state.pendingResponse || state.pendingAction || state.combatAction) throw new RulesViolation("combat-action-pending");
        if (state.active !== item.command.owner || state.phase !== "combate") throw new RulesViolation("wrong-combat-priority");
        const attacker = state.players[item.command.owner].board.find((unit) => unit.uid === item.command.attackerId);
        const attacksUsed = attacker?.attacksThisTurn ?? (attacker?.attackedThisTurn ? 1 : 0);
        const attackingPlayer = state.players[item.command.owner];
        const tessaliaCommander = attackingPlayer.heroId !== "tessalia" || attackingPlayer.board.some((unit) => unit.slot === 2 && !unit.suffocated);
        if (!attacker || attacker.cannotAttack || attacker.exhausted || attacksUsed >= (attacker.attackLimit || 1) || attacker.summoning || attacker.stunned || hasKeyword(attacker, /atordoado/i) || !attackPermissionMet(attacker) || (attackingPlayer.heroId === "tessalia" && attacker.slot !== 2 && !tessaliaCommander)) throw new RulesViolation("invalid-attacker");
        state.combatAction = { attackerOwner: item.command.owner, attackerUid: attacker.uid, attackerCard: clone(attacker), stage: "priority" };
        state.pendingResponse = { responder: 1 - item.command.owner, actor: item.command.owner, action: `declaração de ataque de ${attacker.name || attacker.uid}`, passes: 0 };
      } else if (item.command.type === "selectDefender") {
        const combat = state.combatAction;
        if (!combat || combat.stage !== "choosing" || 1 - combat.attackerOwner !== item.command.owner) throw new RulesViolation("defender-choice-unavailable");
        const defender = item.command.targetHero ? null : state.players[item.command.owner].board.find((unit) => unit.uid === item.command.defenderId);
        if (!item.command.targetHero && !defender) throw new RulesViolation("invalid-defender");
        state.combatAction = { ...combat, targetHero: !!item.command.targetHero, defenderUid: defender?.uid, defenderCard: defender ? clone(defender) : undefined, stage: "charging" };
      } else if (options.priority && ["attack"].includes(item.command.type) && !item.command.skipPriority && !item.command.hasPriority) {
        if (state.pendingAction) throw new RulesViolation("priority-window-open");
        state.pendingAction = { ...item.command }; state.pendingResponse = { responder: 1 - item.command.owner, actor: item.command.owner, action: item.command.type, passes: 0 }; continue;
      } else if (item.command.type === "playCard") {
        if (options.priority && !item.command.skipPriority && !item.command.hasPriority) {
          if (state.pendingAction) throw new RulesViolation("priority-window-open");
          /* A priority window is only created for an already legal intent.
             Otherwise an invalid card could remain in pendingAction forever
             after the responder passes. */
          preflightPlay(state, item.command, handlers);
          state.pendingAction = { ...item.command };
          state.pendingResponse = { responder: 1 - item.command.owner, actor: item.command.owner, action: state.players[item.command.owner].hand.find((card) => card.id === item.command.cardId)?.name || item.command.cardId, passes: 0 };
          continue;
        }
        if (state.pendingAction && item.command.owner !== state.pendingResponse?.responder) throw new RulesViolation("not-your-priority");
        const entry = state.players[item.command.owner];
        const cardIndex = entry.hand.findIndex((card) => card.id === item.command.cardId);
        const card = entry.hand[cardIndex]; if (!card) throw new RulesViolation("card-not-in-hand"); actionLabel = card.name || card.id;
        if (!canExecuteCard(card, handlers)) throw new RulesViolation("card-not-migrated");
        const accelerated = (card.tags || []).some((tag) => /acelerado/i.test(tag)) || /acelerado/i.test(card.text || "");
        if (state.active !== item.command.owner && !(accelerated && item.command.hasPriority)) throw new RulesViolation("not-your-priority");
        if (state.phase !== "principal" && !(accelerated && item.command.hasPriority)) throw new RulesViolation("wrong-phase");
        const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay" && conditionMatches(state, card, item.command.owner, ability.condition, { card })); if (playAbilities.some((ability) => !playConditionMatches(state, item.command.owner, ability.playCondition) || ability.effects.some((effect) => effect.type === "replaySelectedAbility" && !replayAbilityCandidates(state, item.command.owner, effect).length))) throw new RulesViolation("play-condition-not-met"); const enterAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onEnter" && conditionMatches(state, card, item.command.owner, ability.condition, { card }));
        if (card.type !== "Criatura" || (item.command.targetIds || []).length) validateTargets(state, item.command.owner, card.type === "Criatura" ? enterAbilities : playAbilities, item.command, card);
        for (const ability of playAbilities) validateCosts(state, ability, item.command);
        const staticDiscount = permanentUnits(entry).filter((source) => !source.suffocated).flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === item.command.owner) && (!modifier.firstEachTurn || !(entry.turnCardsPlayed || 0))).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
        const queuedDiscount = nextCardDiscount(entry, card, state.round); const cardModifier = card.costModifierExpiresRound != null && state.round >= card.costModifierExpiresRound ? 0 : card.costModifier || 0; const cost = Math.max(0, (card.cost || 0) + intrinsicCost(state, entry, card) + targetSurcharge(state, item.command.owner, card, item.command.targetIds) + cardModifier + staticDiscount - (queuedDiscount?.amount || 0)); const spell = card.type === "Feitiço"; const canUseReserve = card.type !== "Criatura"; const paysLife = card.type === "Criatura" && !!entry.nextCreaturePaysLife;
        const available = accelerated && state.active !== item.command.owner ? entry.reserve : paysLife ? entry.life - (entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0) : entry.energy + (canUseReserve ? entry.reserve : 0);
        if (available < cost) throw new RulesViolation(paysLife ? "not-enough-life" : "not-enough-energy");
        for (const ability of playAbilities) payCosts(state, ability, item.command);
        if (paysLife) { entry.life -= cost; entry.nextCreaturePaysLife = false; entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + cost; entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1; if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1; state.rulesEvents ||= []; state.rulesEvents.push({ type: "onLifeLost", owner: item.command.owner, sourceOwner: item.command.owner, sourceId: card.id, amount: cost, paidAsCost: true }); }
        else if (accelerated) { const fromReserve = Math.min(entry.reserve, cost); entry.reserve -= fromReserve; entry.energy -= cost - fromReserve; }
        else if (canUseReserve) { const fromReserve = Math.min(entry.reserve, cost); entry.reserve -= fromReserve; entry.energy -= cost - fromReserve; } else { entry.energy -= cost; }
        if (queuedDiscount) entry.nextCardDiscounts = (entry.nextCardDiscounts || []).filter((rule) => rule !== queuedDiscount); entry.hand.splice(cardIndex, 1); for (const source of permanentUnits(entry)) if (typeof source.cardsPlayedAfterSelf === "number") source.cardsPlayedAfterSelf++; entry.cardsPlayed = (entry.cardsPlayed || 0) + 1; if (state.active === item.command.owner) entry.turnCardsPlayed = (entry.turnCardsPlayed || 0) + 1; if (state.active === item.command.owner && entry.heroId === "goblin") entry.goblinTurnCardsPlayed = (entry.goblinTurnCardsPlayed || 0) + 1; if (spell) { entry.spellsPlayed = (entry.spellsPlayed || 0) + 1; entry.turnSpellsPlayed = (entry.turnSpellsPlayed || 0) + 1; } const permanent = card.type !== "Feitiço" || card.abilities?.some((ability) => ability.effects?.some((effect) => effect.type === "remainUntilTurnEnd"));
        if (permanent) {
          state.nextInstanceId = (state.nextInstanceId || 0) + 1;
          const unit = { ...card, _printedState: card._printedState ? structuredClone(card._printedState) : { name: card.name, type: card.type, cost: card.cost, atk: card.atk, hp: card.hp, text: card.text, tags: structuredClone(card.tags || []), subtypes: structuredClone(card.subtypes || []), abilities: structuredClone(card.abilities || []), page: card.page, id: card.id, image: card.image, hero: card.hero, imageCard: card.imageCard, generatedImage: card.generatedImage }, uid: item.command.instanceId || `${card.id}-${state.round}-${state.nextInstanceId}`, slot: item.command.slot ?? 0, enteredRound: state.round, attackedThisTurn: false, damage: 0, bonusAtk: 0, bonusHp: 0, exhausted: false, summoning: card.type === "Artefato" || (card.type === "Criatura" && !((card.tags || []).some((tag) => /investida/i.test(String(tag))) && !(card.page === 29 && Math.max(0, (entry.turnCardsPlayed || 0) - 1) < 1))), frozen: false, stunned: false, suffocated: false, immobilized: false, defenseUses: 0, markers: card.markers ?? 0, modifiers: [] };
          if (card.type === "Criatura") { const replaced = entry.board.find((existing) => existing.slot === unit.slot); if ((replaced && entry.board.length < 5) || (!replaced && entry.board.length >= 5)) throw new RulesViolation("creature-zone-full"); if (replaced) { entry.board = entry.board.filter((existing) => existing !== replaced); const attachments = entry.support.filter((attachment) => attachment.attachedTo === replaced.uid); entry.support = entry.support.filter((attachment) => attachment.attachedTo !== replaced.uid); for (const attachment of attachments) { if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(attachment); else entry.grave.push({ ...attachment, deathCause: "replaced" }); } if (!replaced.generatedImage && !replaced.imageCard) entry.obscuro.push({ ...replaced, lastZone: "board", deathCause: "replaced" }); stack.push({ kind: "event", event: { type: "onPermanentLeaves", owner: item.command.owner, sourceId: replaced.uid, cardId: replaced.uid, card: replaced, zone: "board" } }); } const preEntryControlledIds = entry.board.map((card) => card.uid || card.id); entry.board.push(unit); entry.subtypesEnteredThisTurn ||= {}; for (const value of new Set([...(card.subtypes || []), ...(card.tags || [])])) entry.subtypesEnteredThisTurn[value] = (entry.subtypesEnteredThisTurn[value] || 0) + 1; stack.push({ kind: "event", event: { type: "onCreatureEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit, preEntryControlledIds } }); }
          else if (card.type === "Terreno") { if (entry.terrain && !entry.terrain.generatedImage) entry.grave.push(entry.terrain); entry.terrain = unit; }
          else { if (entry.support.length >= 5 || entry.support.some((existing) => existing.slot === unit.slot)) throw new RulesViolation("support-zone-full"); if (card.type === "Artefato") { const attached = entry.board.find((creature) => creature.uid === item.command.attachedTo); if (!attached && card.page !== 304) throw new RulesViolation("artifact-target-required"); if (attached) { if (entry.support.some((artifact) => artifact.attachedTo === attached.uid)) throw new RulesViolation("artifact-target-required"); unit.attachedTo = attached.uid; unit.slot = attached.slot; } } entry.support.push(unit); }
          const enter = (unit.abilities || []).filter((ability) => ability.trigger === "onEnter");
          const hasEnterTargets = (item.command.targetIds || []).length > 0;
          const enterEffectCanResolve = (effect) => hasEnterTargets || (targetScope(effect.target) === TargetScope.NONE && effect.relation !== "selectedTarget");
          for (const ability of enter.reverse()) for (const effect of [...ability.effects].filter(enterEffectCanResolve).reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid, effectSource: unit } });
          const staticAbilities = (unit.abilities || []).filter((ability) => ability.trigger === "static");
          for (const ability of staticAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid, effectSource: unit } });
        } else entry.grave.push(card);
        for (const ability of playAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: item.command.instanceId || card.id, effectSource: card } });
        if ((item.command.targetIds || []).length) { stack.push({ kind: "event", event: { type: "onTargetedByOpponent", owner: item.command.owner, sourceId: card.id, source: card, targetIds: item.command.targetIds } }); stack.push({ kind: "event", event: { type: "onAttachedCreatureTargeted", owner: item.command.owner, sourceId: card.id, source: card, targetIds: item.command.targetIds } }); }
        stack.push({ kind: "event", event: { type: "onCardPlayed", owner: item.command.owner, cardId: card.id, card } }); if (spell) stack.push({ kind: "event", event: { type: "onSpellCast", owner: item.command.owner, cardId: card.id, card } });
      } else if (item.command.type === "attack") {
        if (state.active !== item.command.owner || (state.phase !== "combate" && !item.command.forced)) throw new RulesViolation("wrong-combat-priority");
        const attackerOwner = item.command.owner; const defenderOwner = 1 - attackerOwner;
        const attackerPlayer = state.players[attackerOwner]; const defenderPlayer = state.players[defenderOwner];
        const attacker = attackerPlayer.board.find((unit) => unit.uid === item.command.attackerId);
        const attacksUsed = attacker?.attacksThisTurn ?? (attacker?.attackedThisTurn ? 1 : 0); if (!attacker || attacker.cannotAttack || attacker.exhausted || attacksUsed >= (attacker.attackLimit || 1) || attacker.summoning || attacker.stunned || hasKeyword(attacker, /atordoado/i)) throw new RulesViolation("invalid-attacker"); if (!attackPermissionMet(attacker)) throw new RulesViolation("attack-requirement-not-met");
        actionLabel = attacker.name || attacker.uid;
        attacker.attacksThisTurn = attacksUsed + 1; attacker.attackedThisTurn = attacker.attacksThisTurn >= (attacker.attackLimit || 1); attacker.participatedInCombatThisTurn = true;
        if (!hasKeyword(attacker, /alerta/i) && attacker.attackedThisTurn) attacker.exhausted = true;
        const attack = effectiveAttack(state, attacker, attackerOwner);
        const defender = defenderPlayer.board.find((unit) => unit.uid === item.command.defenderId);
        let damageDealtByAttacker = 0;
        if (!defender) {
          damageDealtByAttacker = attack;
          defenderPlayer.life -= attack;
          if (attack > 0) { attacker.damagedOwnersThisTurn ||= []; if (!attacker.damagedOwnersThisTurn.includes(defenderOwner)) attacker.damagedOwnersThisTurn.push(defenderOwner); }
          if (attack > 0 && hasKeyword(attacker, /roubo de vida/i)) attackerPlayer.life = Math.min(attackerPlayer.maxLife ?? 30, attackerPlayer.life + attack);
        } else {
          const combatBlocked = (attacker.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(defender, rule.cannotCombatSubtype)) || (defender.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(attacker, rule.cannotCombatSubtype)); if (defender.exhausted || defender.stunned || defender.cannotDefend || combatBlocked || hasKeyword(defender, /atordoado/i) || (defender.defenseUses || 0) >= defenderCapacity(defender)) throw new RulesViolation("invalid-defender");
          if (hasKeyword(attacker, /furtivo/i)) throw new RulesViolation("unblockable-attacker");
          if (hasKeyword(attacker, /voar/i) && !hasKeyword(defender, /voar/i)) throw new RulesViolation("flying-blocker-required");
          defender.defenseUses = (defender.defenseUses || 0) + 1;
          defender.participatedInCombatThisTurn = true;
          if (defender.defenseUses >= defenderCapacity(defender)) defender.exhausted = true;
          const counter = effectiveAttack(state, defender, defenderOwner);
          const attackerFast = hasKeyword(attacker, /veloz/i); const defenderFast = hasKeyword(defender, /veloz/i);
          const defenderRemaining = Math.max(0, effectiveHealth(state, defender, defenderOwner) - (defender.damage || 0));
          let dealtByAttacker = 0; let dealtByDefender = 0;
          if (attackerFast && !defenderFast) {
            dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack); cleanupLethal(state, stack);
            if (defenderPlayer.board.includes(defender)) { dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter); cleanupLethal(state, stack); }
          } else if (defenderFast && !attackerFast) {
            dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter); cleanupLethal(state, stack);
            if (attackerPlayer.board.includes(attacker)) { dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack); cleanupLethal(state, stack); }
          } else {
            dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack);
            dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter); cleanupLethal(state, stack);
          }
          damageDealtByAttacker = dealtByAttacker;
          if (dealtByAttacker > 0) stack.push({ kind: "event", event: { type: "onDamageTaken", owner: defenderOwner, targetId: defender.uid, sourceOwner: attackerOwner, sourceId: attacker.uid, amount: dealtByAttacker } });
          if (dealtByDefender > 0) {
            stack.push({ kind: "event", event: { type: "onDamageTaken", owner: attackerOwner, targetId: attacker.uid, sourceOwner: defenderOwner, sourceId: defender.uid, amount: dealtByDefender } });
            stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: defenderOwner, sourceId: defender.uid, source: defender, targetIds: [attacker.uid], amount: dealtByDefender } });
          }
          if (hasKeyword(attacker, /atropelar/i) && dealtByAttacker > defenderRemaining) { const overflow = dealtByAttacker - defenderRemaining; defenderPlayer.life -= overflow; damageDealtByAttacker += overflow; }
        }
        const attackerSurvived = attackerPlayer.board.includes(attacker); const defenderDestroyed = !!defender && !defenderPlayer.board.includes(defender);
        if (defenderDestroyed && attackerSurvived) stack.push({ kind: "event", event: { type: "onCombatKill", owner: attackerOwner, sourceId: attacker.uid, source: attacker, card: defender } });
        if (damageDealtByAttacker > 0) {
          stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: defender ? [defender.uid] : ["enemy-hero"], amount: damageDealtByAttacker } });
          if (!defender) stack.push({ kind: "event", event: { type: "onPlayerDamaged", owner: defenderOwner, sourceOwner: attackerOwner, sourceId: attacker.uid, source: attacker, amount: damageDealtByAttacker } });
        }
        stack.push({ kind: "event", event: { type: "onCombatDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: defender ? [defender.uid] : [], targetSnapshots: defender ? [{ id: defender.uid, owner: defenderOwner, slot: defender.slot }] : [], amount: damageDealtByAttacker } });
        stack.push({ kind: "event", event: { type: "onAttack", owner: attackerOwner, sourceId: attacker.uid, source: attacker } });
        state.combatAction = null;
      } else if (item.command.type === "activate") {
        const entry = state.players[item.command.owner]; if (state.active !== item.command.owner) throw new RulesViolation("not-your-turn");
        const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === item.command.sourceId); const ability = source?.abilities?.find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated");
        if (!ability) throw new RulesViolation("ability-not-found"); if ((source.type === "Artefato" || ((source.generatedImage || source.imageCard) && source.type === "Criatura")) && (source.summoning || source.enteredRound === state.round)) throw new RulesViolation("summoning-sickness"); if (!canExecuteCard(source, handlers)) throw new RulesViolation("card-not-migrated"); if (!availabilityMatches(state, source, item.command.owner, ability.availability)) throw new RulesViolation("ability-not-available"); actionLabel = source.name || source.uid; if (!usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-limit-reached"); const activationSteps = abilityTargetSteps(ability).map((step) => ({ ...step, excludeIds: ability.effects?.some((effect) => effect.excludeCurrentAttachment) && source.attachedTo ? [...new Set([...(step.excludeIds || []), source.attachedTo])] : step.excludeIds || [] })); if (activationSteps.length && !(item.command.targetIds || []).length) { if (!canSatisfyTargetSteps(state, item.command.owner, activationSteps)) throw new RulesViolation("ability-not-available"); state.pendingDecision = { kind: "activation-targets", owner: item.command.owner, effect: {}, context: { owner: item.command.owner, sourceId: source.uid }, targetSteps: activationSteps, sourceName: source.name, command: { ...item.command } }; continue; } validateTargets(state, item.command.owner, [ability], item.command, source); validateCosts(state, ability, item.command); payCosts(state, ability, item.command); claimUsage(state, source, item.command.owner, ability);
        /* A printed "Vire: Destrua este artefato e depois faça X" is an
           activated ability. The source remains available while X resolves;
           only the final self-destruction effect is placed at the end. */
        const selfDestruction = ability.effects.filter((effect) => effect.type === "destroy" && ["self", "this", "thisArtifact", "thisEnchantment"].includes(effect.target));
        const otherEffects = ability.effects.filter((effect) => !selfDestruction.includes(effect));
        [...otherEffects, ...selfDestruction].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));
        if ((item.command.targetIds || []).length) { stack.push({ kind: "event", event: { type: "onTargetedByOpponent", owner: item.command.owner, sourceId: source.uid, source, targetIds: item.command.targetIds } }); stack.push({ kind: "event", event: { type: "onAttachedCreatureTargeted", owner: item.command.owner, sourceId: source.uid, source, targetIds: item.command.targetIds } }); }
      } else if (item.command.type === "resolveDecision") {
        const decision = state.pendingDecision; if (!decision || (decision.owner !== item.command.owner && decision.context?.decisionOwner !== item.command.owner)) throw new RulesViolation("decision-not-owned");
        const continuation = decision.continuation || [];
        if (decision.kind === "search") {
          const entry = state.players[item.command.owner], effect = decision.effect, selectedIds = [...new Set(item.command.selectedCardIds || (item.command.selectedCardId ? [item.command.selectedCardId] : []))];
          const maximum = Math.min(effect.amount || 1, entry.deck.length), eligible = entry.deck.filter((card) => (!effect.types?.length || effect.types.includes(card.type)) && (!effect.subtype || hasSubtype(card, effect.subtype)) && (!effect.nameIncludes || String(card.name || "").toLowerCase().includes(String(effect.nameIncludes).toLowerCase())) && (!effect.vanillaOnly || !String(card.text || "").trim()) && (effect.minCost == null || (card.cost || 0) >= effect.minCost) && (effect.maxCost == null || (card.cost || 0) <= effect.maxCost) && (!effect.maxCostFromMarkerAmount || (card.cost || 0) <= Number(decision.context.markerAmount || 0)));
          if (selectedIds.length !== Math.min(maximum, eligible.length) || selectedIds.some((id) => !eligible.some((card) => card.uid === id || card.id === id))) throw new RulesViolation("invalid-search-selection");
          const selected = selectedIds.map((id) => { const index = entry.deck.findIndex((card) => card.uid === id || card.id === id); return entry.deck.splice(index, 1)[0]; });
          if (effect.destination === "hand") entry.hand.push(...selected);
          else if (effect.destination === "field") for (const card of selected) {
            const unit = { ...card, uid: `${card.id}-${state.round}-searched`, enteredRound: state.round, attackedThisTurn: false, damage: 0, exhausted: false, summoning: card.type === "Criatura", modifiers: [], abilities: card.abilities || [] };
            if (card.type === "Terreno") { if (entry.terrain && !entry.terrain.generatedImage) entry.grave.push(entry.terrain); entry.terrain = { ...unit, slot: 0 }; }
            else if (card.type === "Criatura") { const slot = Array.from({ length: 5 }, (_, value) => value).find((value) => !entry.board.some((existing) => existing.slot === value)); if (slot == null) throw new RulesViolation("creature-zone-full"); unit.slot = slot; entry.board.push(unit); stack.push({ kind: "event", event: { type: "onCreatureEnter", owner: item.command.owner, sourceId: unit.uid, card: unit } }); }
            else throw new RulesViolation("unsupported-search-destination");
            stack.push({ kind: "event", event: { type: "onEnter", owner: item.command.owner, sourceId: unit.uid, card: unit } });
          } else throw new RulesViolation("unsupported-search-destination");
          if (effect.shuffle && entry.deck.length > 1) { const shift = ((state.round || 1) + (state.events || 0)) % entry.deck.length; entry.deck.push(...entry.deck.splice(0, shift)); }
          state.pendingDecision = null; stack.push(...continuation); continue;
        }
        if (decision.kind === "hand-to-deck-bottom") {
          const entry = state.players[item.command.owner], ids = [...new Set(item.command.selectedCardIds || [])], amount = Math.min(decision.effect.amount || 1, entry.hand.length);
          if (ids.length !== amount || ids.some((id) => !entry.hand.some((card) => card.uid === id || card.id === id))) throw new RulesViolation("invalid-hand-selection");
          for (const id of ids) { const index = entry.hand.findIndex((card) => card.uid === id || card.id === id); entry.deck.push(entry.hand.splice(index, 1)[0]); }
          state.pendingDecision = null; stack.push(...continuation); continue;
        }
        if (decision.kind === "zone-card") {
          const id = item.command.selectedCardId, choices = decision.effect.choices || [];
          if (!id || !choices.includes(id)) throw new RulesViolation("card-choice-required");
          state.pendingDecision = null; stack.push(...continuation); stack.push({ kind: "effect", effect: { ...decision.effect, choose: false }, context: { ...decision.context, selectedCardId: id } }); continue;
        }
        if (decision.kind === "grave-resurrect") {
          const entry = state.players[item.command.owner], id = item.command.selectedCardId, card = entry.grave.find((candidate) => candidate.uid === id || candidate.id === id), source = permanentUnits(entry).find((candidate) => candidate.uid === decision.context.sourceId);
          if (!card || !source || !(decision.effect.choices || []).includes(id) || markerTotalForEngine(source) < (card.cost || 0) * 2) throw new RulesViolation("card-choice-required");
          removeMarkersForEngine(source, (card.cost || 0) * 2); state.pendingDecision = null; stack.push(...continuation); stack.push({ kind: "effect", effect: { type: "resurrect", cardType: "Criatura", destination: "field" }, context: { ...decision.context, selectedCardId: id } }); continue;
        }
        if (decision.kind === "forced-attack") {
          /* forced-attack-v7: direct one-shot creature combat; never requeues a normal attack command. */
          const attackerOwner = decision.context?.owner ?? decision.owner ?? item.command.owner;
          const defenderOwner = 1 - attackerOwner;
          const attackerId = item.command.attackerId || item.command.targetIds?.[0];
          const defenderId = item.command.defenderId || item.command.targetIds?.[1];
          const attackerPlayer = state.players[attackerOwner];
          const defenderPlayer = state.players[defenderOwner];
          const attacker = attackerPlayer.board.find((card) => card.uid === attackerId || card.id === attackerId);
          const defender = defenderPlayer.board.find((card) => card.uid === defenderId || card.id === defenderId);
          const attacksUsed = attacker?.attacksThisTurn ?? (attacker?.attackedThisTurn ? 1 : 0);
          const requiresReady = decision.effect.attacker?.ready !== false;

          if (
            !attacker || !defender
            || (decision.effect.attacker?.subtype && !subtype(attacker, decision.effect.attacker.subtype))
            || (requiresReady && attacker.exhausted)
            || attacker.cannotAttack
            || attacker.summoning
            || attacker.stunned
            || hasKeyword(attacker, /atordoado/i)
            || attacksUsed >= (attacker.attackLimit || 1)
            || !attackPermissionMet(attacker)
          ) throw new RulesViolation("invalid-forced-attack");

          const attack = effectiveAttack(state, attacker, attackerOwner);
          const counter = effectiveAttack(state, defender, defenderOwner);
          const defenderRemaining = Math.max(0, effectiveHealth(state, defender, defenderOwner) - (defender.damage || 0));

          attacker.attacksThisTurn = attacksUsed + 1;
          attacker.attackedThisTurn = attacker.attacksThisTurn >= (attacker.attackLimit || 1);
          attacker.participatedInCombatThisTurn = true;
          defender.participatedInCombatThisTurn = true;
          if (!hasKeyword(attacker, /alerta/i) && attacker.attackedThisTurn) attacker.exhausted = true;

          const dealtByAttacker = dealCombatDamage(state, defender, defenderOwner, attacker, attackerOwner, attack);
          const dealtByDefender = dealCombatDamage(state, attacker, attackerOwner, defender, defenderOwner, counter);

          state.pendingDecision = null;
          state.combatAction = null;
          stack.push(...continuation);
          cleanupLethal(state, stack);

          const attackerSurvived = attackerPlayer.board.includes(attacker);
          const defenderDestroyed = !defenderPlayer.board.includes(defender);

          if (hasKeyword(attacker, /atropelar/i) && dealtByAttacker > defenderRemaining) {
            const overflow = dealtByAttacker - defenderRemaining;
            defenderPlayer.life -= overflow;
            if (overflow > 0) stack.push({ kind: "event", event: { type: "onPlayerDamaged", owner: defenderOwner, sourceOwner: attackerOwner, sourceId: attacker.uid, source: attacker, amount: overflow } });
          }
          if (defenderDestroyed && attackerSurvived) stack.push({ kind: "event", event: { type: "onCombatKill", owner: attackerOwner, sourceId: attacker.uid, source: attacker, card: defender } });
          if (dealtByAttacker > 0) {
            stack.push({ kind: "event", event: { type: "onDamageTaken", owner: defenderOwner, targetId: defender.uid, sourceOwner: attackerOwner, sourceId: attacker.uid, amount: dealtByAttacker } });
            stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: [defender.uid], amount: dealtByAttacker } });
          }
          if (dealtByDefender > 0) {
            stack.push({ kind: "event", event: { type: "onDamageTaken", owner: attackerOwner, targetId: attacker.uid, sourceOwner: defenderOwner, sourceId: defender.uid, amount: dealtByDefender } });
            stack.push({ kind: "event", event: { type: "onAttachedCreatureDamage", owner: defenderOwner, sourceId: defender.uid, source: defender, targetIds: [attacker.uid], amount: dealtByDefender } });
          }
          stack.push({ kind: "event", event: { type: "onCombatDamage", owner: attackerOwner, sourceId: attacker.uid, source: attacker, targetIds: [defender.uid], targetSnapshots: [{ id: defender.uid, owner: defenderOwner, slot: defender.slot }], amount: dealtByAttacker } });
          stack.push({ kind: "event", event: { type: "onAttack", owner: attackerOwner, sourceId: attacker.uid, source: attacker, forced: true } });
          continue;
        }
        if (decision.kind === "sacrifice-and-fill") {
          const entry = state.players[item.command.owner], ids = [...new Set(item.command.targetIds || [])];
          if (ids.some((id) => !entry.board.some((card) => card.uid === id))) throw new RulesViolation("invalid-sacrifice-selection");
          for (const id of ids) { const card = entry.board.find((unit) => unit.uid === id); entry.board = entry.board.filter((unit) => unit.uid !== id); if (card && !card.generatedImage) entry.grave.push(resetCardForZone(state, card)); }
          while (entry.board.length < 5) { const index = entry.deck.findIndex((card) => card.type === "Criatura" && subtype(card, decision.effect.subtype)); if (index < 0) break; const card = entry.deck.splice(index, 1)[0], slot = Array.from({ length: 5 }, (_, value) => value).find((value) => !entry.board.some((unit) => unit.slot === value)); entry.board.push({ ...card, uid: `${card.id}-${state.round}-rescued-${entry.board.length}`, slot, enteredRound: state.round, summoning: true, exhausted: false, damage: 0, modifiers: [], abilities: card.abilities || [] }); }
          if (decision.effect.shuffle && entry.deck.length > 1) entry.deck.push(entry.deck.shift()); state.pendingDecision = null; stack.push(...continuation); continue;
        }
        if (decision.kind === "draw-position") {
          const entry = state.players[item.command.owner], fromBottom = item.command.choiceIndex === 1, card = fromBottom ? entry.deck.pop() : entry.deck.shift(); if (card) { entry.hand.push(card); stack.push({ kind: "event", event: { type: "onCardsDrawn", owner: item.command.owner, amount: 1, cards: [card], sourceId: decision.context.sourceId, outsideMaintenance: state.phase !== "manutencao" } }); } else entry.deckOut = true; state.pendingDecision = null; stack.push(...continuation); if ((decision.effect.amount || 1) > 1) stack.push({ kind: "effect", effect: { type: "draw", amount: decision.effect.amount - 1 }, context: { ...decision.context, skipPrestidigitation: false } }); continue;
        }
        if (decision.kind === "redirect") {
          if (item.command.choiceIndex === 1) { const id = item.command.targetIds?.[0], entry = state.players[item.command.owner]; if (!permanentUnits(entry).some((card) => card.uid === id) || markerTotalForEngineAll(entry) < (decision.effect.markerCost || 0)) throw new RulesViolation("invalid-redirect"); removeMarkersAcross(entry, decision.effect.markerCost || 0); state.lastRedirect = { from: decision.context.event?.targetIds?.[0], to: id, sourceId: decision.context.sourceId }; }
          state.pendingDecision = null; stack.push(...continuation); continue;
        }
        if (decision.kind === "choice-target") {
          if ((item.command.targetIds || []).length !== 1 || !findPermanentById(state, item.command.targetIds[0])) throw new RulesViolation("invalid-target");
        }
        if (decision.kind === "replay-ability") {
          const selected = permanentUnits(state.players[item.command.owner]).find((card) => (card.uid === item.command.selectedCardId || card.id === item.command.selectedCardId) && card.type === (decision.effect.selector?.type || card.type));
          const ability = selected?.abilities?.find((candidate) => candidate.trigger === decision.effect.trigger);
          if (!selected || !ability) throw new RulesViolation("card-choice-required");
          const targetSteps = abilityTargetSteps(ability);
          if (targetSteps.length && !canSatisfyTargetSteps(state, item.command.owner, targetSteps)) throw new RulesViolation("ability-not-available");
          state.pendingDecision = null;
          const context = { ...decision.context, owner: item.command.owner, sourceId: selected.uid || selected.id, effectSource: selected };
          if (targetSteps.length) {
            state.pendingDecision = { kind: "targets", owner: item.command.owner, effect: { replayEffects: ability.effects }, context, targetSteps, sourceName: selected.name || "Primeiro Ato" };
            continue;
          }
          for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context });
          continue;
        }
        if (decision.kind === "optional-sacrifice-buff") {
          const ids=[...new Set(item.command.targetIds||[])],entry=state.players[item.command.owner],source=entry.board.find((card)=>card.uid===decision.context.sourceId);
          if(!source||ids.length>(decision.effect.maximum||3)||ids.some((id)=>id===source.uid||!entry.board.some((card)=>card.uid===id)))throw new RulesViolation("invalid-sacrifice-selection");
          state.pendingDecision=null;
          for(const id of ids){const target=entry.board.find((card)=>card.uid===id);entry.board=entry.board.filter((card)=>card.uid!==id);if(!target)continue;const attachments=entry.support.filter((card)=>card.attachedTo===id);entry.support=entry.support.filter((card)=>card.attachedTo!==id);for(const artifact of attachments)if(!artifact.generatedImage&&!artifact.imageCard)entry.grave.push(resetCardForZone(state,artifact));if(!target.generatedImage&&!target.imageCard)entry.grave.push(resetCardForZone(state,target));stack.push({kind:"event",event:{type:"onCreatureDestroyed",owner:item.command.owner,sourceId:id,card:target}});}
          if(ids.length){source.modifiers||=[];source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId});}
          continue;
        }
        if (decision.kind === "targets" || decision.kind === "activation-targets") {
          const targetIds = item.command.targetIds || []; const steps = decision.targetSteps || [];
          if (targetIds.length !== steps.length) throw new RulesViolation("invalid-target-count");
          steps.forEach((step, index) => { const id = targetIds[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - decision.owner : id === "ally-hero" || id === "controller-hero" ? decision.owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, decision.owner, targetOwner, targetKind) || (!hero && !targetMatchesStep(target, id, step)) || (hero && ((step.requiredSubtype || step.requiredName || step.imageOnly || step.maxCost != null) || (step.excludeIds || []).includes(id)))) throw new RulesViolation("invalid-target"); });
          if (decision.kind === "activation-targets") { state.pendingDecision = null; stack.push(...continuation); stack.push({ kind: "command", command: { ...decision.command, targetIds } }); continue; }
        }
        state.pendingDecision = null; stack.push(...continuation); if (decision.kind === "repeat-choice" && decision.effect.remaining > 1) stack.push({ kind: "effect", effect: { ...decision.effect, type: "repeatChoiceForCoffeeCount", remaining: decision.effect.remaining - 1 }, context: decision.context }); const chosen = decision.effect.choices?.[item.command.choiceIndex] || decision.effect.replayEffects || [];
        const resolvedTargetIds=item.command.targetIds ?? decision.context?.targetIds ?? [];const targetSnapshots=resolvedTargetIds.map((id)=>{const owner=unitOwner(state,id);if(owner<0)return null;const target=permanentUnits(state.players[owner]).find((card)=>card.uid===id||card.id===id);return target?{id,owner,slot:target.slot}:null}).filter(Boolean);const decisionContext = { ...decision.context, decisionOwner: item.command.owner, choiceIndex: item.command.choiceIndex, selectedCardId: item.command.selectedCardId, targetIds: resolvedTargetIds, targetSnapshots };
        for (const effect of [...chosen].reverse()) stack.push({ kind: "effect", effect, context: decisionContext });
      } else if (item.command.type === "reposition") {
        const pending = state.pendingReposition; if (!pending || !pending.owners.includes(item.command.owner) || pending.confirmed.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");
        const entry = state.players[item.command.owner]; const moves = item.command.moves || []; const slots = moves.map((move) => move.slot);
        if (slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot > 4) || new Set(slots).size !== slots.length) throw new RulesViolation("invalid-reposition");
        for (const move of moves) { const creature = entry.board.find((card) => card.uid === move.sourceId); if (!creature) throw new RulesViolation("invalid-reposition-card"); creature.slot = move.slot; for (const artifact of entry.support.filter((card) => card.attachedTo === creature.uid)) artifact.slot = move.slot; }
      } else if (item.command.type === "confirmReposition") {
        const pending = state.pendingReposition; if (!pending || !pending.owners.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");
        if (!pending.confirmed.includes(item.command.owner)) pending.confirmed.push(item.command.owner); if (pending.confirmed.length === pending.owners.length) state.pendingReposition = null;
      } else if (item.command.type === "emit") stack.push({ kind: "event", event: item.command.event });
      else if (item.command.type === "advancePhase") {
        if (state.pendingDecision || state.pendingReposition) throw new RulesViolation("interaction-pending"); const order = ["manutencao", "principal", "combate", "fim"]; const index = order.indexOf(state.phase); if (state.phase === "fim") state.players.forEach((entry) => { for (const unit of permanentUnits(entry)) { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "turn"); unit.abilities = (unit.abilities || []).filter((ability) => !ability.temporary); unit.temporaryTags = []; unit.temporarySubtypes = []; unit.combatRestrictions = (unit.combatRestrictions || []).filter((rule) => rule.duration !== "turn"); unit.attackLimit = 1; unit.damageShields = (unit.damageShields || []).filter((shield) => shield.expires !== "turn" && shield.duration !== "turn"); } entry.nextElementEffects = (entry.nextElementEffects || []).filter((effect) => effect.expires !== "turn"); }); if (state.phase === "combate" && state.players[state.active].board.some((unit) => !unit.exhausted && !unit.attackedThisTurn && !unit.summoning && !unit.stunned && !hasKeyword(unit, /atordoado/i) && attackPermissionMet(unit) && hasKeyword(unit, /indom[aá]vel/i))) throw new RulesViolation("indomitable-must-attack"); if (state.phase === "combate") state.players.forEach((entry) => entry.board.forEach((unit) => { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "combat"); if ((unit.defenseUses || 0) > 0) unit.exhausted = true; })); state.phase = order[(index + 1) % order.length]; if (state.phase === "fim") { stack.push({ kind: "event", event: { type: "onTurnEnd", owner: state.active } }); const due = (state.delayedEffects || []).filter((entry) => entry.timing === "turnEnd" && entry.owner === state.active); state.delayedEffects = (state.delayedEffects || []).filter((entry) => !due.includes(entry)); for (const delayed of due.reverse()) stack.push({ kind: "effect", effect: delayed.effect, context: delayed.context }); } if (state.phase === "combate") stack.push({ kind: "event", event: { type: "onCombatStart", owner: state.active } }); if (state.phase === "manutencao") { const previousActive = 1 - state.active; state.players[previousActive].goblinTurnCardsPlayed = 0; state.active = 1 - state.active; state.round += 1; const entry = state.players[state.active]; entry.abilityUses = {}; entry.subtypesEnteredThisTurn = {}; entry.turnCardsPlayed = 0; entry.turnSpellsPlayed = 0; for (const unit of permanentUnits(entry)) { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "turn" && modifier.duration !== "combat"); unit.temporaryTags = []; unit.temporarySubtypes = []; unit.combatRestrictions = (unit.combatRestrictions || []).filter((rule) => rule.duration !== "turn"); unit.attackLimit = 1; unit.summoning = false; unit.attackedThisTurn = false; unit.attacksThisTurn = 0; unit.defenseUses = 0; const immobilized = unit.immobilized || hasKeyword(unit, /imobilizado/i); if (immobilized) { unit.immobilized = false; unit.tags = (unit.tags || []).filter((tag) => !/imobilizado/i.test(String(tag))); } else unit.exhausted = false; } for (const unit of entry.board || []) unit.damage = 0; stack.push({ kind: "event", event: { type: "onMaintenance", owner: state.active } }); }
      } else throw new RulesViolation("unknown-command");
    } else if (item.kind === "effect") {
      const replacements = state.players[item.context.owner]?.replacementEffects || [];
      const replacementIndex = item.context.replacementApplied ? -1 : replacements.findIndex((entry) => String(item.context.effectSource?.name || "").toLowerCase().includes(String(entry.nameIncludes || "").toLowerCase()));
      if (replacementIndex >= 0) { replacements.splice(replacementIndex, 1); stack.push({ kind: "effect", effect: item.effect, context: { ...item.context, replacementApplied: true } }); }
      if (item.effect.type === "replaySelectedAbility") item.context.replayCandidateIds = replayAbilityCandidates(state, item.context.owner, item.effect).map((card) => card.uid || card.id);
      applyEffect(state, item.effect, item.context, handlers);
      if (state.pendingDecision && stack.length) { state.pendingDecision.continuation = stack.splice(0); }
      if (item.context.effectSource?.name && (item.context.targetIds || []).length) stack.push({ kind: "event", event: { type: "onNamedEffectApplied", owner: item.context.owner, sourceId: item.context.sourceId, effectSource: item.context.effectSource, card: item.context.effectSource, effect: item.effect, targetIds: item.context.targetIds } });
      cleanupLethal(state, stack);
      for (const event of (state.rulesEvents || []).splice(0).reverse()) stack.push({ kind: "event", event });
      stack.push({ kind: "event", event: { type: `after:${item.effect.type}`, owner: item.context.owner, sourceId: item.context.sourceId } });
    } else if (item.kind === "event") {
      const triggered = activeAbilities(state, item.event); for (const trigger of triggered.reverse()) { claimUsage(state, trigger.source, trigger.owner, trigger.ability); const baseTargetSteps = abilityTargetSteps(trigger.ability); const imageEntering = item.event.type === "onEnter" && (item.event.card?.generatedImage || item.event.card?.imageCard); const targetSteps = imageEntering ? baseTargetSteps.map((step) => ({ ...step, excludeIds: [...new Set([...(step.excludeIds || []), item.event.sourceId].filter(Boolean))] })) : baseTargetSteps; const context = { owner: trigger.owner, sourceId: trigger.ability.replaySourceId || trigger.source.uid, event: item.event, targetIds: item.event.targetIds || [] }; if (targetSteps.length && !context.targetIds.length) { if (!canSatisfyTargetSteps(state, trigger.owner, targetSteps)) continue; state.pendingDecision = { kind: "targets", owner: trigger.owner, effect: { replayEffects: trigger.ability.effects }, context, targetSteps, sourceName: trigger.ability.replaySourceId ? item.event.card?.name || "Primeiro Ato" : trigger.source.name || "efeito ativado" }; break; } for (const effect of [...trigger.ability.effects].reverse()) stack.push({ kind: "effect", effect, context }); }
    }
  }
  if (command.type === "advancePhase" && originalPhase === "fim" && state.phase === "manutencao") {
    const entry = state.players[state.active]; entry.lifeLostThisTurn = 0; entry.lifeLossEvents = 0; if (entry.heroId === "saymon") entry.heroXP = 0;
  }
  state.events = (state.events || 0) + 1; state.log ||= []; state.log.unshift({ id: `rules-${state.round}-${state.events}`, text: command.type === "playCard" ? `${actionLabel} foi jogada pelo motor de regras.` : command.type === "activate" ? `${actionLabel} ativou sua habilidade.` : `${actionLabel}: ${command.type}.`, tone: "effect" });
  if (["playCard"].includes(command.type)) if (!command.skipPriority && state.pendingAction && command.hasPriority) state.pendingResponse = { responder: state.pendingAction.actor, actor: command.owner, action: actionLabel, passes: 0 }; else if (!command.skipPriority && !state.pendingAction) state.pendingResponse = command.hasPriority ? null : { responder: 1 - command.owner, actor: command.owner, action: actionLabel, passes: 0 };
  return { state, trace, steps };
}
