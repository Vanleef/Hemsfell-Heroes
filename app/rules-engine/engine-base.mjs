import { applyEffect, defaultEffectHandlers, recordLifeLoss, RulesViolation } from "./effects.mjs";
import { hasSubtype } from "./subtypes.mjs";
import { isValidTarget, targetPolicy, TargetScope } from "./targeting.mjs";
import { abilitiesForLevel, getExplicitCardRule } from "./card-rules.mjs";

export class RulesLoopError extends Error {
  constructor(message, trace) { super(message); this.name = "RulesLoopError"; this.trace = trace; }
}

const INTERACTIVE_EFFECTS = new Set();
const HERO_RULE_PAGE = Object.freeze({ gimble: 2, tifon: 110, saymon: 129, quarion: 180, rasmus: 211, ngoro: 255, zayan: 273, natureza: 291 });
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
    if (cost.type === "removeHeroMarkers") { const available = Math.max(typeof entry.markers === "number" ? entry.markers : Number(entry.markers?.[cost.marker] || 0), cost.marker === "clue" ? Number(entry.heroXP || 0) : 0); if (available < cost.amount) throw new RulesViolation("not-enough-markers"); }
  }
}

function payCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") applyEffect(state, { type: "tap" }, context);
    if (cost.type === "sacrifice") { const chosen = (context.sacrificeIds || []).map((id) => entry.board.find((unit) => unit.uid === id)).filter(Boolean); context.paidSacrificeAttack = chosen.reduce((sum, unit) => sum + effectiveAttack(state, unit, context.owner), 0); applyEffect(state, { type: "sacrifice" }, context); }
    if (cost.type === "energy") { const source = permanentUnits(entry).find((unit) => unit.uid === context.sourceId); const fromEnergy = Math.min(entry.energy, cost.amount); entry.energy -= fromEnergy; const fromReserve = source?.type !== "Criatura" ? cost.amount - fromEnergy : 0; entry.reserve -= fromReserve; }
    if (cost.type === "life") recordLifeLoss(state, context.owner, cost.amount, { sourceOwner: context.owner, sourceId: context.sourceId, paidAsCost: true });
    if (cost.type === "removeMarkers") {
      const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); let remaining = cost.amount === "X" ? context.markerAmount || 0 : cost.amount;
      if (typeof source.markers === "number") source.markers -= Math.min(source.markers, remaining); else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; }
    }
    if (cost.type === "removeMarkersFromConstants") {
      let remaining = cost.amount; for (const source of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) { if (!remaining) break; if (typeof source.markers === "number") { const used = Math.min(source.markers, remaining); source.markers -= used; remaining -= used; } else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; } }
    }
    if (cost.type === "removeHeroMarkers") { if (typeof entry.markers === "number") entry.markers = Math.max(0, entry.markers - cost.amount); else { entry.markers ||= {}; entry.markers[cost.marker] = Math.max(0, Number(entry.markers[cost.marker] || entry.heroXP || 0) - cost.amount); } if (cost.marker === "clue") entry.heroXP = Math.max(0, Number(entry.heroXP || 0) - cost.amount); }
  }
}

function modifierApplies(state, owner, modifier, unit) { if (modifier.expiresRound != null && state.round >= modifier.expiresRound) return false; if(unit?.suffocated&&(modifier.attack>0||modifier.health>0))return false; return modifier.condition !== "controllerTurn" || state.active === owner; }
function activeKeywords(unit) { return unit?.suffocated ? [] : [...(unit?.tags || []), ...(unit?.temporaryTags || []), ...(unit?.grantedKeywords || []).map((value)=>String(value).replace(/^(?:attachment|support|duelist|hero):[^:]+:/,""))]; }
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
function subtypeAuraBonus(state, unit, owner) { if (unit?.suffocated) return { attack: 0, health: 0 }; let attack = 0, health = 0; for (const source of permanentUnits(state.players[owner])) { if (source.suffocated) continue; for (const aura of source.staticModifiers || []) if (aura.type === "subtypeAura" && subtype(unit, aura.subtype)) { attack += aura.attack || 0; health += aura.health || 0; } } return { attack, health }; }
function strongestAlly(state, unit, owner) { const allies = state.players[owner].board.filter((candidate) => candidate !== unit && !candidate.dynamicStats?.copyStrongestAlly), maximum = Math.max(0, ...allies.map((candidate) => baseAttack(state, candidate, owner))), tied = allies.filter((candidate) => baseAttack(state, candidate, owner) === maximum); return tied.find((candidate) => (candidate.uid || candidate.id) === unit.dynamicStats?.preferredSourceId) || tied.sort((a, b) => String(a.uid || a.id).localeCompare(String(b.uid || b.id)))[0]; }
function baseAttack(state, unit, owner) {
  if (!unit?.suffocated && unit?.dynamicStats?.subtypeCountAcrossFields) return state.players.flatMap(permanentUnits).filter((card) => subtype(card, unit.dynamicStats.subtypeCountAcrossFields)).length;
  if (!unit?.suffocated && unit?.dynamicStats?.attackSubtype) return state.players.flatMap(permanentUnits).filter((card) => subtype(card, unit.dynamicStats.attackSubtype)).length;
  if (!unit?.suffocated && unit?.dynamicStats?.cardsMilledThisTurn) return state.players[owner].cardsMilledThisTurn || 0;
  if (!unit?.suffocated && unit?.dynamicStats?.copyStrongestAlly) { const strongest = strongestAlly(state, unit, owner); return strongest ? baseAttack(state, strongest, owner) : 0; }
  const support = unit?.suffocated ? {attack:0} : adjacentSupportBonus(state, unit, owner), aura = subtypeAuraBonus(state, unit, owner); return Math.max(0, (unit?.atk || 0) + support.attack + aura.attack + (unit?.modifiers || []).filter((value) => modifierApplies(state, owner, value, unit)).reduce((sum, value) => sum + (value.attack || 0), 0));
}
function effectiveAttack(state, unit, owner) {
  if (unit?.attackZeroUntilOwnerMaintenance != null || unit?.frozen || hasKeyword(unit, /congelado/i)) return 0;
  if (!unit?.suffocated && unit?.dynamicStats?.bothFromAttack) { const strongest = state.players[owner].board.filter((candidate) => candidate !== unit).reduce((best, candidate) => Math.max(best, baseAttack(state, candidate, owner)), 0); return strongest; }
  return baseAttack(state, unit, owner);
}
function effectiveHealth(state, unit, owner) {
  if (!unit?.suffocated && unit?.dynamicStats?.subtypeCountAcrossFields) return Math.max(1, state.players.flatMap(permanentUnits).filter((card) => subtype(card, unit.dynamicStats.subtypeCountAcrossFields)).length);
  if (!unit?.suffocated && unit?.dynamicStats?.healthSubtype) return Math.max(1, state.players.flatMap(permanentUnits).filter((card) => subtype(card, unit.dynamicStats.healthSubtype)).length);
  if (!unit?.suffocated && unit?.dynamicStats?.copyStrongestAlly) { const strongest = strongestAlly(state, unit, owner); return strongest ? effectiveHealth(state, strongest, owner) : 1; }
  if (!unit?.suffocated && unit?.dynamicStats?.bothFromAttack) { const strongest = state.players[owner].board.filter((candidate) => candidate !== unit).reduce((best, candidate) => Math.max(best, baseAttack(state, candidate, owner)), 0); return Math.max(1, strongest); }
  const support = unit?.suffocated ? {health:0} : adjacentSupportBonus(state, unit, owner), aura = subtypeAuraBonus(state, unit, owner);
  return Math.max(0, (unit?.hp || 1) + support.health + aura.health + (unit?.modifiers || []).filter((value) => modifierApplies(state, owner, value, unit)).reduce((sum, value) => sum + (value.health || 0), 0));
}
function dealCombatDamage(state, target, targetOwner, source, sourceOwner, amount) {
  const shield = (target.damageShields || []).find((item) => item.uses > 0); const shieldReduction = shield?.reduction ?? (shield ? Number.POSITIVE_INFINITY : 0);
  if (shield) { shield.uses--; target.damageShields = target.damageShields.filter((item) => item.uses > 0); }
  const dealt = Math.max(0, amount - (hasKeyword(target, /robusto/i) ? 1 : 0) - shieldReduction);
  target.damage = (target.damage || 0) + dealt;
  if (dealt > 0) target.lastDamagedBy = { sourceId: source.uid || source.id, sourceOwner, combat: true };
  if (dealt > 0 && hasKeyword(source, /toque da morte/i)) target.damage = Math.max(target.damage, effectiveHealth(state, target, targetOwner));
  if (dealt > 0 && hasKeyword(source, /roubo de vida/i)) { const entry = state.players[sourceOwner]; entry.life = Math.min(entry.maxLife ?? 30, entry.life + dealt); }
  return dealt;
}
function subtype(card, value) { return hasSubtype(card, value) || (card.tags || []).some((tag) => String(tag).toLowerCase() === String(value).toLowerCase()); }
function conditionMatches(state, source, owner, condition, event = {}) {
  if (!condition) return true;
  const entry = state.players[owner];
  const cardsPlayedBeforeThis = Math.max(0, (entry.turnCardsPlayed || 0) - (event.type === "onPlay" && event.owner === owner ? 1 : 0));
  if (condition.cardsPlayedBeforeThisAtLeast != null && cardsPlayedBeforeThis < condition.cardsPlayedBeforeThisAtLeast) return false;
  if (condition.cardsPlayedBeforeThisAtMost != null && cardsPlayedBeforeThis > condition.cardsPlayedBeforeThisAtMost) return false;
  if (condition.controllerTurn && state.active !== owner) return false;
  if (condition.firstLifeLossEachTurn && Number(event.lifeLossIndex || 0) !== 1) return false;
  if (condition.controllerReserveBelow != null && entry.reserve >= condition.controllerReserveBelow) return false;
  if (condition.anyCreatureInPlay && !state.players.some((candidate) => candidate.board.length > 0)) return false;
  if (condition.enemyCreatureInPlay && !(state.players[1 - owner].board || []).length) return false;
  if (condition.controllerReadySubtype && !(entry.board || []).some((card) => subtype(card, condition.controllerReadySubtype) && !card.exhausted && !card.stunned && !hasKeyword(card, /atordoado/i))) return false;
  if (condition.eventAmountAtLeast != null && Number(event.amount || 0) < condition.eventAmountAtLeast) return false;
  if (condition.anyPermanentHasMarker && !state.players.some((candidate) => permanentUnits(candidate).some((card) => markerTotalForEngine(card) > 0))) return false;
  if (condition.controllerControlsOtherSubtype) {
    const preEntry = event.preEntryControlledIds;
    const candidates = entry.board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id));
    if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false;
  }
  if (condition.controllerControlsSubtype && !permanentUnits(entry).some((card) => subtype(card, condition.controllerControlsSubtype))) return false;
  if (condition.controllerGraveHasCreatureMaxCost != null && !entry.grave.some((card) => card.type === "Criatura" && (card.cost || 0) <= condition.controllerGraveHasCreatureMaxCost)) return false;
  if (condition.all && !condition.all.every((item) => conditionMatches(state, source, owner, item, event))) return false;
  const eventCard = event.card || state.players.flatMap((candidate) => [...candidate.board, ...candidate.support, ...candidate.grave]).find((card) => card.uid === event.cardId || card.id === event.cardId);
  if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;
  if (condition.eventCardHasTrigger && !(eventCard?.abilities || []).some((ability) => ability.trigger === condition.eventCardHasTrigger)) return false;
  if (condition.eventCardKeyword) {
    const escaped = String(condition.eventCardKeyword).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    if (!hasKeyword(eventCard || {}, new RegExp(escaped, "i"))) return false;
  }
  if (condition.eventKilledBySource && event.card?.killedByRepeatSourceId !== (source.uid || source.id)) return false;
  if (condition.eventCardType && eventCard?.type !== condition.eventCardType) return false;
  if (condition.eventCardTypeNot && (eventCard?.type === condition.eventCardTypeNot || eventCard?.imageCard)) return false;
  if (condition.spellElement) {
    const chosen = event.chosenElement || event.card?.chosenElement;
    if (chosen !== condition.spellElement && !(event.card?.tags || eventCard?.tags || []).includes(condition.spellElement)) return false;
  }
  if (condition.sourceSubtype && !subtype(event.source || {}, condition.sourceSubtype)) return false;
  if (condition.controllerSubtypeEnteredThisTurn && (entry.subtypesEnteredThisTurn?.[condition.controllerSubtypeEnteredThisTurn.subtype] || 0) !== condition.controllerSubtypeEnteredThisTurn.count) return false;
  if (condition.activePlayerControlsVanillaCreature && !state.players[state.active].board.some((card) => !(card.text || "").trim())) return false;
  if (condition.wasOnlySubtypeInAllFields && state.players.flatMap((candidate) => candidate.board).some((card) => subtype(card, condition.wasOnlySubtypeInAllFields))) return false;
  if (condition.sourceSurvived && !permanentUnits(entry).some((card) => card.uid === source.uid || card.id === source.id)) return false;
  if (condition.spellNameIncludes && !String(eventCard?.name || "").toLowerCase().includes(String(condition.spellNameIncludes).toLowerCase())) return false;
  if (condition.nameIncludes && !String(event.card?.name || event.effectSource?.name || "").toLowerCase().includes(String(condition.nameIncludes).toLowerCase())) return false;
  if (condition.sourceIsSelf && event.sourceId !== (source.uid || source.id)) return false;
  if (condition.eventCausedBySelf && event.destroyedBySourceId !== (source.uid || source.id)) return false;
  if (condition.eventTargetIsSelf && !(event.targetIds || []).includes(source.uid || source.id)) return false;
  if (condition.eventOwnerIsController && event.owner !== owner) return false;
  if (condition.eventOwnerIsOpponent && event.owner === owner) return false;
  if (condition.eventSourceOwnerIsOpponent && event.sourceOwner === owner) return false;
  if (condition.outsideMaintenance && !event.outsideMaintenance) return false;
  if (condition.controllerOnlyCopyNamed && permanentUnits(entry).filter((card) => String(card.name || "").toLowerCase() === String(condition.controllerOnlyCopyNamed).toLowerCase()).length !== 1) return false;
  if (condition.otherThanSource && (event.sourceId === source.uid || event.cardId === source.uid || event.cardId === source.id)) return false;
  if (condition.eventTargetType) {
    const targets = (event.targetIds || []).map((id) => state.players.flatMap(permanentUnits).find((card) => card.uid === id || card.id === id)).filter(Boolean);
    if (!targets.some((target) => target.type === condition.eventTargetType)) return false;
  }
  if (condition.spellsCastAtLeast != null && (entry.spellsPlayed || 0) < condition.spellsCastAtLeast) return false;
  if (condition.heroMarkersAtLeast != null && markerTotalForEngine(entry) < condition.heroMarkersAtLeast) return false;
  if (condition.totalMarkersAtLeast != null && markerTotalForEngineAll(entry) < condition.totalMarkersAtLeast) return false;
  if (condition.controllerOnlyOrderCreatures && (entry.board || []).some((card) => !subtype(card, "Ordem"))) return false;
  if (condition.controllerCardsDrawnThisTurnAtLeast != null && (entry.cardsDrawnThisTurn || 0) < condition.controllerCardsDrawnThisTurnAtLeast) return false;
  if (condition.marker) {
    const markerRule = typeof condition.marker === "object" ? condition.marker : { name: condition.marker };
    const sourceMarkers = typeof source.markers === "number" ? source.markers : source.markers?.[markerRule.name] || 0;
    if (sourceMarkers < (markerRule.atLeast ?? markerRule.minimum ?? 1)) return false;
  }
  if (condition.catsInAllFieldsAtLeast != null && state.players.flatMap((candidate) => candidate.board).filter((card) => subtype(card, "Gato")).length < condition.catsInAllFieldsAtLeast) return false;
  if (condition.vanillaConstantsAtLeast != null && permanentUnits(entry).filter((card) => !(card.text || "").trim()).length < condition.vanillaConstantsAtLeast) return false;
  if (condition.sourceIsCommander && entry.commanderId !== (source.uid || source.id)) return false;
  return true;
}

function playConditionMatches(state, owner, condition) {
  if (!condition) return true;
  if (condition.anyCreatureInPlay && !state.players.some((entry) => entry.board.length > 0)) return false;
  if (condition.controllerCreatureSlotAvailable && (state.players[owner].board || []).length >= 5) return false;
  if (condition.anySubtypeInPlay && !state.players.some((entry) => entry.board.some((card) => subtype(card, condition.anySubtypeInPlay)))) return false;
  if (condition.controllerGraveHasSubtype && !state.players[owner].grave.some((card) => subtype(card, condition.controllerGraveHasSubtype))) return false;
  if (condition.controllerGraveHasTrigger && !state.players[owner].grave.some((card) => card.type === "Criatura" && (card.abilities || []).some((ability) => ability.trigger === condition.controllerGraveHasTrigger))) return false;
  if (condition.controllerGraveCreatureCountAtLeast != null && state.players[owner].grave.filter((card) => card.type === "Criatura").length < condition.controllerGraveCreatureCountAtLeast) return false;
  if (condition.alliedPermanentHasTrigger) return permanentUnits(state.players[owner]).some((card) => (card.abilities || []).some((ability) => {
    if (ability.trigger !== condition.alliedPermanentHasTrigger) return false;
    const steps = abilityTargetSteps(ability);
    return !steps.length || canSatisfyTargetSteps(state, owner, steps);
  }));
  return true;
}
function availabilityMatches(state, source, owner, availability) {
  if (!availability) return true;
  if (availability.reserveBelow != null && state.players[owner].reserve >= availability.reserveBelow) return false;
  if (availability.topGraveHasTrigger) { const top = state.players[owner].grave.at(-1); return !!top && (top.abilities || []).some((ability) => ability.trigger === availability.topGraveHasTrigger); }
  if (availability.whileDefending && (state.phase !== "combate" || !(source.defenseUses > 0))) return false;
  if (availability.controllerHasFaction && !permanentUnits(state.players[owner]).some((card) => (card.tags || []).some((tag) => String(tag).toLowerCase() === String(availability.controllerHasFaction).toLowerCase()))) return false;
  if (availability.constantMarkersAtLeast != null && markerTotalForEngineAll(state.players[owner]) < availability.constantMarkersAtLeast) return false;
  if (availability.deckHasTypes?.length && !state.players[owner].deck.some((card) => availability.deckHasTypes.includes(card.type))) return false;
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

function usageKey(state, source, ability) { return `${source.uid || source.id}:${ability.id}${ability?.condition?.firstEachTurn ? `:round-${state.round}` : ""}`; }
function isOncePerTurnAbility(ability) { return ability?.trigger === "activated" || !!ability?.usageLimit || !!ability?.condition?.firstEachTurn; }
function usageAvailable(state, source, owner, ability) { if (!isOncePerTurnAbility(ability)) return true; return !(state.players[owner].abilityUses || {})[usageKey(state, source, ability)]; }
function claimUsage(state, source, owner, ability) { if (!isOncePerTurnAbility(ability)) return; state.players[owner].abilityUses ||= {}; const key = usageKey(state, source, ability); state.players[owner].abilityUses[key] = (state.players[owner].abilityUses[key] || 0) + 1; }

const permanentUnits = (entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])];
const findPermanent = (state, id) => state.players.flatMap(permanentUnits).find((card) => (card.uid || card.id) === id);
function bankEndingEnergy(state) {
  const entry = state.players[state.active];
  if (!entry) return;
  const remaining = Math.max(0, Number(entry.energy) || 0);
  if (!entry.noReserveStorageThisTurn) entry.reserve = Math.min(3, Math.max(0, Number(entry.reserve) || 0) + remaining);
  entry.energy = 0;
}
const markerTotalForEngine = (card) => typeof card?.markers === "number" ? card.markers : Object.values(card?.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const markerTotalForEngineAll = (entry) => permanentUnits(entry).reduce((sum, card) => sum + markerTotalForEngine(card), 0);
function removeMarkersForEngine(card, amount) { if (typeof card.markers === "number") { card.markers -= amount; return; } for (const key of Object.keys(card.markers || {})) { const used = Math.min(card.markers[key], amount); card.markers[key] -= used; amount -= used; if (!amount) return; } }
function removeMarkersAcross(entry, amount) { for (const card of permanentUnits(entry)) { const used = Math.min(markerTotalForEngine(card), amount); removeMarkersForEngine(card, used); amount -= used; if (!amount) return; } }
const findPermanentById = (state, id) => state.players.flatMap(permanentUnits).find((card) => card.uid === id || card.id === id);
const nextCardDiscount = (entry, card, round = 0) => (entry.nextCardDiscounts || []).find((rule) => (rule.expiresRound == null || round < rule.expiresRound) && (!rule.type || rule.type === card.type) && (!rule.typeNot || rule.typeNot !== card.type));
function intrinsicCost(state, entry, card) {
  let modifier = 0;
  if (card.page === 13 && entry.board.some((unit) => unit.page === 23)) modifier -= 2;
  if (card.page === 14 && entry.board.some((unit) => unit.page === 24)) modifier -= 3;
  if (card.page === 88) modifier += Math.max(0, entry.hand.length - 1) - (card.cost || 0);
  if (card.page === 139) modifier += Math.max(1, (card.cost || 0) - (entry.lifeLostThisTurn || 0)) - (card.cost || 0);
  if (card.page === 42 && (entry.turnCardsPlayed || 0) >= 1) modifier -= 1;
  if (entry.heroId === "goblin" && (entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !(entry.subtypesEnteredThisTurn?.Goblin || 0)) modifier -= card.cost || 0;
  if (card.page === 149) modifier -= entry.board.filter((unit) => subtype(unit, "Vampiro")).length;
  if (card.page === 203) modifier -= 2 * entry.board.length;
  if (card.type === "Criatura") modifier += (entry.nextCreatureTaxes || [])
    .filter((tax) => tax.createdRound == null || state.round > tax.createdRound)
    .reduce((sum, tax) => sum + (tax.amount || 0), 0);
  return modifier;
}
function targetSurcharge(state, owner, card, targetIds = []) { if (card.type !== "Feitiço") return 0; return targetIds.reduce((sum, id) => { const targetOwner = unitOwner(state, id); const target = targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); return sum + (target?.suffocated ? 0 : target?.spellTargetSurcharge || 0); }, 0); }
function refreshSupportAuras(state){
  for(const entry of state.players) for(const unit of [...(entry.board||[]), ...(entry.support||[])]) {
    unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:")&&!String(value).startsWith("duelist:"));
    unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");
    unit.staticModifiers=(unit.staticModifiers||[]).filter(value=>value.type!=="supportAura"||!value.sourceId||!!findPermanent(state,value.sourceId));
  }
  state.players.forEach((entry)=>{
    const zones=[entry.board||[], entry.support||[]];
    for(const zone of zones) for(const source of zone){
      if(source.suffocated) continue;
      if(zone===entry.support && source.type!=="Criatura") continue;
      const sourceId=source.uid||source.id;
      for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){
        const externalSource=aura.sourceId?findPermanent(state,aura.sourceId):null;
        if(aura.sourceId&&(!externalSource||externalSource.suffocated)) continue;
        for(const target of zone.filter(unit=>unit.type==="Criatura"&&!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){
          if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(`support:${sourceId}:${aura.keyword}`);}
          if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId:aura.sourceId||sourceId});}
        }
      }
    }
    const female=entry.board.find(unit=>unit.page===171&&!unit.suffocated),male=entry.board.find(unit=>unit.page===172&&!unit.suffocated);
    if(female&&male){for(const target of [female,male]){target.grantedKeywords||=[];target.grantedKeywords.push("duelist:pair:Barreira Mágica","duelist:pair:Robusto");}}
  });
}

function requiredBlockerKeyword(state, attacker, owner){if(attacker.blockersRequireKeyword)return attacker.blockersRequireKeyword;const entry=state.players[owner],attachment=(entry.support||[]).find((card)=>card.attachedTo===(attacker.uid||attacker.id)&&!card.suffocated&&(card.staticModifiers||[]).some((item)=>item.type==="attachedBlockRestriction"));if(!attachment)return null;const rule=attachment.staticModifiers.find((item)=>item.type==="attachedBlockRestriction"),hasOther=permanentUnits(entry).some((card)=>card!==attachment&&card!==attacker&&(!rule.requiresOtherFactionConstant||subtype(card,rule.requiresOtherFactionConstant)));return hasOther?rule.blockersRequireKeyword:null;}
function refreshHeroRules(state) { state.players.forEach((entry) => { for (const unit of permanentUnits(entry)) unit.grantedKeywords = (unit.grantedKeywords || []).filter((value) => !String(value).startsWith("hero:zayan:")); if (entry.heroId === "zayan" && (entry.level || 1) >= 3) for (const unit of entry.board || []) if (!(unit.text || "").trim() && !unit.suffocated) { unit.grantedKeywords ||= []; unit.grantedKeywords.push("hero:zayan:Investida"); unit.summoning = false; } }); }
function refreshDynamicChoices(state) { if (state.pendingDecision) return; state.players.forEach((entry, owner) => { if (state.pendingDecision) return; for (const source of entry.board || []) { if (!source.dynamicStats?.copyStrongestAlly || source.suffocated) continue; const allies = entry.board.filter((candidate) => candidate !== source && !candidate.dynamicStats?.copyStrongestAlly), maximum = Math.max(0, ...allies.map((candidate) => baseAttack(state, candidate, owner))), tied = allies.filter((candidate) => baseAttack(state, candidate, owner) === maximum); if (tied.length === 1) source.dynamicStats.preferredSourceId = tied[0].uid || tied[0].id; else if (tied.length > 1 && !tied.some((candidate) => (candidate.uid || candidate.id) === source.dynamicStats.preferredSourceId)) { state.pendingDecision = { kind: "maria-stat-tie", owner, effect: { choices: tied.map((candidate) => candidate.uid || candidate.id), sourceId: source.uid || source.id }, context: { owner, sourceId: source.uid || source.id }, sourceName: source.name || "Maria Vai com as Outras" }; break; } } }); }
const unitOwner = (state, id) => state.players.findIndex((entry) => permanentUnits(entry).some((unit) => unit.uid === id || unit.id === id));
const targetScope = (value) => ({ anyCharacter: TargetScope.ANY_CHARACTER, enemyCharacter: TargetScope.ANY_CHARACTER, anyCreature: TargetScope.ANY_CREATURE, allyCreature: TargetScope.ALLY_CREATURE, enemyCreature: TargetScope.ENEMY_CREATURE, anyPermanent: TargetScope.ANY_PERMANENT, allyPermanent: TargetScope.ALLY_PERMANENT, enemyPermanent: TargetScope.ENEMY_PERMANENT, anotherAllyPermanent: TargetScope.ALLY_PERMANENT, creature: TargetScope.ANY_CREATURE }[value] || TargetScope.NONE);
function abilityTargetSteps(ability, sourceId = null) {
  if (ability.sourceText) return (targetPolicy(ability.sourceText).steps || []).filter((step) => step.role !== "sacrifice");
  return (ability.effects || []).flatMap((effect) => {
    const scope = targetScope(effect.target);
    if (effect.reusePreviousTarget) return [];
    const selections = effect.selections ?? (scope === TargetScope.NONE ? 0 : 1);
    const minimum = effect.minimumSelections ?? selections;
    return Array.from({ length: selections }, (_, index) => ({ scope, role: "effect", optional: index >= minimum, requiredSubtype: effect.requiredSubtype, requiredName: effect.requiredName, imageOnly: effect.imageOnly, maxCost: effect.maxCost, excludeIds: [...new Set([...(effect.excludeIds || []), ...(effect.excludeSource && sourceId ? [sourceId] : [])])], allowedIds: effect.allowedIds, requiresMarker: !!effect.requiresMarker, requiresEffectAppliedThisTurn: !!effect.requiresEffectAppliedThisTurn }));
  }).filter((step) => step.scope !== TargetScope.NONE);
}
function targetMatchesStep(state, target, id, step) {
  if ((step.excludeIds || []).includes(id)) return false;
  if (step.allowedIds?.length && !step.allowedIds.includes(id)) return false;
  if (step.requiredSubtype && !subtype(target, step.requiredSubtype)) return false;
  if (step.requiredName && String(target?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== String(step.requiredName).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) return false;
  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;
  if (step.maxCost != null && (target?.cost || 0) > step.maxCost) return false;
  if (step.requiresMarker && markerTotalForEngine(target) < 1) return false;
  if (step.requiresEffectAppliedThisTurn && target?.effectAppliedRound !== state.round) return false;
  return true;
}
function targetCandidates(state, owner, step) {
  const result = [];
  state.players.forEach((entry, targetOwner) => {
    for (const target of permanentUnits(entry)) {
      const id = target.uid || target.id;
      const targetKind = entry.board.includes(target) || target.type === "Criatura" ? "creature" : "permanent";
      if (isValidTarget(step, owner, targetOwner, targetKind) && targetMatchesStep(state, target, id, step)) result.push(id);
    }
    if (isValidTarget(step, owner, targetOwner, "hero") && !(step.excludeIds || []).includes(targetOwner === owner ? "ally-hero" : "enemy-hero")) result.push(targetOwner === owner ? "ally-hero" : "enemy-hero");
  });
  return result;
}
function canSatisfyTargetSteps(state, owner, steps) {
  const candidates = steps.map((step) => targetCandidates(state, owner, step));
  const choose = (index, used) => index >= candidates.length || (steps[index].optional && choose(index + 1, used)) || candidates[index].some((id) => {
    if (used.has(id)) return false;
    const next = new Set(used); next.add(id);
    return choose(index + 1, next);
  });
  return choose(0, new Set());
}
const directlyAppliedTargetEffects = new Set(["damage", "heal", "tap", "ready", "toggleTap", "addMarker", "moveMarker", "modifyStats", "conditionalStats", "grantKeyword", "grantSubtype", "combatRestriction", "suffocateWhileSourceInField", "suffocateUntilTurnEndAndDrawOwner", "immobilize", "grantCombatImmobilize", "freeze", "grantDamageShield", "grantDamageReductionShield", "tapUntilAnotherSpellEffect", "convertActionMarkersToPlusOneCounters"]);
function captureEffectTargets(state, effect, context) {
  if (!directlyAppliedTargetEffects.has(effect.type) || !context.effectSource?.name) return [];
  return (context.targetIds || []).map((id) => { const target = findPermanentById(state, id); return target ? { id, damage: Number(target.damage || 0) } : null; }).filter(Boolean);
}
function recordAppliedTargetEffects(state, effect, context, snapshots) {
  for (const snapshot of snapshots) {
    const target = findPermanentById(state, snapshot.id);
    if (!target || (effect.type === "damage" && Number(target.damage || 0) <= snapshot.damage)) continue;
    target.effectAppliedRound = state.round;
    target.effectAppliedSourceId = context.sourceId;
    const lock = target.staysExhaustedUntilSpellEffect;
    if (lock && context.effectSource?.type === "Feitiço" && context.sourceId !== lock.sourceId) { target.grantedKeywords = (target.grantedKeywords || []).filter((keyword) => keyword !== lock.keyword); delete target.staysExhaustedUntilSpellEffect; }
  }
}
function replayAbilityCandidates(state, owner, effect) {
  return (state.players[owner].board || []).filter((card) => (!effect.selector?.type || card.type === effect.selector.type) && (card.abilities || []).some((ability) => {
    if (ability.trigger !== effect.trigger) return false;
    const steps = abilityTargetSteps(ability);
    return !steps.length || canSatisfyTargetSteps(state, owner, steps);
  }));
}
function validateTargets(state, owner, abilities, command, source) {
  const targetIds = command.targetIds || []; const steps = abilities.flatMap(abilityTargetSteps); const minimum = steps.filter((step) => !step.optional).length;
  if (targetIds.length < minimum || targetIds.length > steps.length || new Set(targetIds).size !== targetIds.length) { if (steps.length || targetIds.length) throw new RulesViolation("invalid-target-count"); return; }
  targetIds.forEach((id, index) => { const step = steps[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - owner : id === "ally-hero" || id === "controller-hero" ? owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (step.requiredSubtype && (!target || !subtype(target, step.requiredSubtype))) throw new RulesViolation("invalid-target-subtype"); if ((step.excludeIds || []).includes(id) || targetOwner < 0 || (!hero && !target) || !isValidTarget(step, owner, targetOwner, targetKind) || (!hero && !targetMatchesStep(state, target, id, step)) || (step.requireExhausted && (!target || !target.exhausted))) throw new RulesViolation("invalid-target"); const barrier = target && hasKeyword(target, /barreira m[aá]gica/i); if (barrier && !/ignora.*barreira m[aá]gica/i.test(source?.text || "")) throw new RulesViolation("magic-barrier"); });
}
function preflightPlay(state, command, handlers) {
  const entry = state.players[command.owner];
  const card = entry?.hand?.find((candidate) => candidate.id === command.cardId);
  if (!card) throw new RulesViolation("card-not-in-hand");
  if (!canExecuteCard(card, handlers)) throw new RulesViolation("card-not-migrated");
  const accelerated = card.type === "Feitiço" && ((card.tags || []).some((tag) => /acelerado/i.test(tag)) || /^\s*acelerado\b/i.test(card.text || ""));
  if (state.active !== command.owner && !(accelerated && command.hasPriority)) throw new RulesViolation("not-your-priority");
  if (state.phase !== "principal" && !(accelerated && command.hasPriority)) throw new RulesViolation("wrong-phase");
  const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay" && conditionMatches(state, card, command.owner, ability.condition, { card }));
  const enterAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onEnter" && conditionMatches(state, card, command.owner, ability.condition, { card }));
  if (playAbilities.some((ability) => !playConditionMatches(state, command.owner, ability.playCondition) || ability.effects.some((effect) => effect.type === "replaySelectedAbility" && !replayAbilityCandidates(state, command.owner, effect).length))) throw new RulesViolation("play-condition-not-met");
  if (card.type !== "Criatura" || (command.targetIds || []).length) { const targetAbilities = card.type === "Criatura" ? enterAbilities : playAbilities, firstTargetCount = targetAbilities.reduce((sum, ability) => sum + abilityTargetSteps(ability).length, 0), validationCommand = card.type === "Criatura" && entry.heroId === "quarion" && (entry.level || 1) >= 3 ? { ...command, targetIds: (command.targetIds || []).slice(0, firstTargetCount) } : command; validateTargets(state, command.owner, targetAbilities, validationCommand, card); }
  for (const ability of playAbilities) validateCosts(state, ability, command);
  const staticDiscount = permanentUnits(entry).filter((source) => !source.suffocated).flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === command.owner) && (!modifier.firstEachTurn || !(entry.turnCardsPlayed || 0))).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
  const queuedDiscount = nextCardDiscount(entry, card, state.round);
  const cardModifier = card.costModifierExpiresRound != null && state.round >= card.costModifierExpiresRound ? 0 : card.costModifier || 0;
  const cost = Math.max(0, (card.cost || 0) + intrinsicCost(state, entry, card) + targetSurcharge(state, command.owner, card, command.targetIds) + cardModifier + staticDiscount - (queuedDiscount?.amount || 0));
  const paysLife = card.type === "Criatura" && !!entry.nextCreaturePaysLife;
  const available = accelerated && state.active !== command.owner ? entry.reserve : paysLife ? entry.life - (entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0) : entry.energy + (card.type !== "Criatura" ? entry.reserve : 0);
  if (available < cost) throw new RulesViolation(paysLife ? "not-enough-life" : "not-enough-energy");
  if (card.type === "Criatura") {
    const catInSupport = command.placementZone === "support" && entry.heroId === "rasmus" && (entry.level || 1) >= 3 && subtype(card, "Gato");
    if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot > 4) throw new RulesViolation("invalid-creature-slot");
    if (catInSupport) { if (entry.support.length >= 5 || entry.support.some((unit) => unit.slot === command.slot)) throw new RulesViolation("support-zone-full"); }
    else { const occupied = entry.board.find((unit) => unit.slot === command.slot); if ((occupied && entry.board.length < 5) || (!occupied && entry.board.length >= 5)) throw new RulesViolation("creature-zone-full"); }
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
      const zayanReplacements = entry.heroId === "zayan" && (entry.level || 1) >= 2 && !(unit.text || "").trim() ? entry.board.filter((card) => card !== unit) : [];
      if (!state.pendingDecision && zayanReplacements.length) { unit.damage = Math.max(0, (unit.hp || 1) + modifiers - 1); state.pendingDecision = { kind: "zayan-destruction-replacement", owner, effect: { type: "zayanDestructionReplacement", originalId: unit.uid || unit.id, lethal: true, choices: zayanReplacements.map((card) => card.uid || card.id) }, context: { owner, decisionOwner: owner, sourceId: unit.lastDamagedBy?.sourceId }, sourceName: "Zayan II" }; continue; }
      if (unit.returnCombatPairOnDefeat && unit.lastDamagedBy?.combat) {
        const winnerOwner = unit.lastDamagedBy.sourceOwner, winnerEntry = state.players[winnerOwner], winner = winnerEntry?.board.find((card) => (card.uid || card.id) === unit.lastDamagedBy.sourceId);
        entry.board.splice(entry.board.indexOf(unit), 1); const defeatedAttachments = entry.support.filter((card) => card.attachedTo === unit.uid); entry.support = entry.support.filter((card) => card.attachedTo !== unit.uid); for (const attachment of defeatedAttachments) if (!attachment.generatedImage && !attachment.imageCard) entry.grave.push(resetCardForZone(state, attachment)); if (!unit.generatedImage && !unit.imageCard) entry.hand.push({ ...resetCardForZone(state, unit), revealed: true, revealedTo: [0, 1] });
        if (winner) { winnerEntry.board.splice(winnerEntry.board.indexOf(winner), 1); const winnerAttachments = winnerEntry.support.filter((card) => card.attachedTo === winner.uid); winnerEntry.support = winnerEntry.support.filter((card) => card.attachedTo !== winner.uid); for (const attachment of winnerAttachments) if (!attachment.generatedImage && !attachment.imageCard) winnerEntry.grave.push(resetCardForZone(state, attachment)); if (!winner.generatedImage && !winner.imageCard) winnerEntry.hand.push({ ...resetCardForZone(state, winner), revealed: true, revealedTo: [0, 1] }); }
        stack.push({ kind: "event", event: { type: "onPermanentLeaves", owner, sourceId: unit.uid, card: unit, zone: "board", replacement: "gran-finale" } });
        continue;
      }
      const quarionKey = `quarion-hero-${owner}:quarion-level-2:turn`;
      if (entry.heroId === "quarion" && (entry.level || 1) >= 2 && state.active === owner && !(entry.abilityUses || {})[quarionKey]) {
        entry.abilityUses ||= {}; entry.abilityUses[quarionKey] = 1;
        entry.board.splice(entry.board.indexOf(unit), 1);
        const attachments = entry.support.filter((card) => card.attachedTo === unit.uid); entry.support = entry.support.filter((card) => card.attachedTo !== unit.uid);
        for (const attachment of attachments) if (!attachment.generatedImage && !attachment.imageCard) entry.grave.push(resetCardForZone(state, attachment));
        if (!unit.generatedImage && !unit.imageCard) entry.hand.push({ ...resetCardForZone(state, unit), revealed: true, revealedTo: [0, 1] });
        stack.push({ kind: "event", event: { type: "onPermanentLeaves", owner, sourceId: unit.uid, card: unit, zone: "board", replacement: "quarion-level-2" } });
        continue;
      }
      entry.board.splice(entry.board.indexOf(unit), 1);
      const attachments = entry.support.filter((card) => card.attachedTo === unit.uid);
      for (const ring of attachments.filter((card) => card.page === 150 && (card.linkedCreatures || []).includes(unit.uid || unit.id))) { const otherId = ring.linkedCreatures.find((id) => id !== (unit.uid || unit.id)), otherOwner = unitOwner(state, otherId), otherEntry = otherOwner >= 0 ? state.players[otherOwner] : null, other = otherEntry?.board.find((card) => (card.uid || card.id) === otherId); if (!other) continue; otherEntry.board.splice(otherEntry.board.indexOf(other), 1); const otherAttachments = otherEntry.support.filter((card) => card.attachedTo === otherId); otherEntry.support = otherEntry.support.filter((card) => card.attachedTo !== otherId); for (const attachment of otherAttachments) if (!attachment.generatedImage && !attachment.imageCard) otherEntry.grave.push(resetCardForZone(state, attachment)); if (!other.generatedImage && !other.imageCard) otherEntry.grave.push(resetCardForZone(state, other)); }
      entry.support = entry.support.filter((card) => card.attachedTo !== unit.uid);
      for (const attachment of attachments) { const survivesHost = (attachment.abilities || []).some((ability) => ability.trigger === "onAttachedHostDestroyed"); if (survivesHost) { attachment.attachedTo = undefined; attachment.slot = unit.slot; entry.support.push(attachment); stack.push({ kind: "event", event: { type: "onAttachedHostDestroyed", owner, sourceId: attachment.uid || attachment.id, card: attachment, host: unit } }); continue; } if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(resetCardForZone(state, attachment)); else entry.grave.push(resetCardForZone(state, attachment)); }
      if (!unit.generatedImage && !unit.imageCard) entry.grave.push(resetCardForZone(state, unit));
      stack.push({ kind: "event", event: { type: "onPermanentLeaves", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, zone: "board", destination: "grave" } });
      if (!unit.suppressDeathTrigger && !unit.generatedImage && !unit.imageCard) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } });
      entry.turnDeaths = (entry.turnDeaths || 0) + 1;
      if (entry.heroId === "tifon") entry.heroXP = (entry.heroXP || 0) + 1;
      stack.push({ kind: "event", event: { type: "onCreatureDestroyed", owner, cardId: unit.uid, card: unit, destroyedBySourceId: unit.lastDamagedBy?.sourceId, destroyedByOwner: unit.lastDamagedBy?.sourceOwner } });
    }
  });
}

function resetCardForZone(state, card) {
  const template=(state.cardCatalog||[]).find((item)=>item.page===card.page)||card;
  return { page:template.page,id:card.id,uid:card.uid,name:template.name,type:template.type,cost:template.cost,atk:template.atk,hp:template.hp,text:template.text,tags:[...(template.tags||[])],subtypes:[...(template.subtypes||[])],abilities:clone(template.abilities||[]),image:template.image,hero:template.hero,imageCard:template.imageCard,generatedImage:card.generatedImage };
}

function activeAbilities(state, event) {
  const result = [];
  if (event.type === "onCreatureEnter" && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
    if (event.owner !== owner) return;
    const chief = permanentUnits(entry).find((source) => source.page === 182 && !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects"));
    if (!chief || event.sourceId === chief.uid) return;
    const effects = (event.card.abilities || []).filter((ability) => ability.trigger === "onEnter").flatMap((ability) => ability.effects || []);
    if (effects.length) result.push({ source: chief, owner, ability: { id: `${chief.uid}-recruit-enter-copy`, effects, replaySourceId: event.card.uid || event.card.id } });
  });
  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
    if (event.owner !== owner) return;
    const saideiras = permanentUnits(entry).filter((source) => !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "recruitFirstActOnLeave"));
    if (!saideiras.length) return;
    const effects = (event.card.abilities || []).filter((ability) => ability.trigger === "onEnter").flatMap((ability) => ability.effects || []);
    if (!effects.length) return;
    const chiefCopies = permanentUnits(entry).some((source) => source.page === 182 && !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1;
    for (const source of saideiras) for (let copy = 0; copy < chiefCopies; copy++) result.push({ source, owner, ability: { id: `${source.uid}-recruit-leave-${copy}`, effects, replaySourceId: event.card.uid || event.card.id } });
  });
  if ((event.type === "onDestroyed" || event.type === "onPermanentLeaves") && event.card && !event.card.suffocated) for (const ability of event.card.abilities || []) if (ability.trigger === event.type && conditionMatches(state, event.card, event.owner, ability.condition, event) && usageAvailable(state, event.card, event.owner, ability)) {
    const tifonCopies = event.type === "onDestroyed" && state.players[event.owner]?.heroId === "tifon" && (state.players[event.owner]?.level || 1) >= 3 ? 2 : 1;
    const chiefCopies = subtype(event.card, "Recruta") && permanentUnits(state.players[event.owner]).some((source) => source.page === 182 && !source.suffocated && (source.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1;
    const repeats = tifonCopies * chiefCopies;
    for (let copy = 0; copy < repeats; copy++) result.push({ source: event.card, owner: event.owner, ability: copy ? { ...ability, id: `${ability.id}:repeat-${copy}` } : ability });
  }
  state.players.forEach((entry, owner) => {
      for (const source of permanentUnits(entry)) {
      if (source.suffocated) continue;
      for (const ability of source.abilities || []) if (!(source.page === 165 && event.type === "onDamageTaken" && ability.trigger === "onDamageTaken") && ability.trigger === event.type && eventAppliesToSource(event, source, owner) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) { const copies = subtype(source, "Recruta") && permanentUnits(entry).some((chief) => chief.page === 182 && !chief.suffocated && (chief.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1; for (let copy = 0; copy < copies; copy++) result.push({ source, owner, ability: copy ? { ...ability, id: `${ability.id}:chief-copy-${copy}` } : ability }); }
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
  state.players.forEach((entry, owner) => {
    if (entry.heroId !== "uruk" || event.type !== "onTurnEnd" || event.owner !== owner) return;
    const heroSource = { uid: `uruk-hero-${owner}`, id: `uruk-hero-${owner}`, name: "Uruk, a Encantriz", slot: -1 };
    if ((entry.level || 1) >= 1) result.push({ source: heroSource, owner, ability: { id: "uruk-hero-level-1", trigger: "onTurnEnd", effects: [{ type: "resolveLastSpellElement" }] } });
    if ((entry.level || 1) >= 3) result.push({ source: heroSource, owner, ability: { id: "uruk-hero-level-3", trigger: "onTurnEnd", effects: [{ type: "repeatLastSpell" }] } });
  });
  state.players.forEach((entry, owner) => {
    const heroSource = { uid: `${entry.heroId}-hero-${owner}`, id: `${entry.heroId}-hero-${owner}`, name: entry.heroId, slot: -1 };
    if (entry.heroId === "quarion" && (entry.level || 1) >= 1 && event.type === "onFirstActResolved" && event.owner === owner) {
      const ability = { id: "quarion-level-1", trigger: "onFirstActResolved", effects: [{ type: "draw", amount: 1 }], usageLimit: { count: 1, period: "turn" } };
      if (usageAvailable(state, heroSource, owner, ability)) result.push({ source: heroSource, owner, ability });
    }
    if (entry.heroId === "tifon" && event.type === "onCreatureDestroyed" && event.owner === owner) {
      const heroRule = getExplicitCardRule("p110"), heroAbilities = abilitiesForLevel(heroRule, entry.level || 1);
      for (const ability of heroAbilities.filter((candidate) => candidate.trigger === "onCreatureDestroyed" && conditionMatches(state, heroSource, owner, candidate.condition, event) && usageAvailable(state, heroSource, owner, candidate))) result.push({ source: heroSource, owner, ability });
    }
    if (entry.heroId === "rasmus" && (entry.level || 1) >= 2 && event.type === "onPlayerDamaged" && event.sourceOwner === owner && subtype(event.source || {}, "Gato") && event.amount > 0) result.push({ source: heroSource, owner, ability: { id: "rasmus-level-2", trigger: "onPlayerDamaged", effects: [{ type: "heal", amount: 1, target: "controllerHero" }] } });
    if (entry.heroId === "rasmus" && event.type === "onSpellCast" && event.owner === owner && String(event.card?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("cafe")) result.push({ source: heroSource, owner, ability: { id: "rasmus-level-1", trigger: "onSpellCast", effects: [{ type: "addMarker", target: "hero", marker: "coffee", amount: 1 }, { type: "threshold", marker: "coffee", amount: 10, reset: true, effects: [{ type: "createImage", name: "Café Especial", destination: "hand" }] }] } });
    if (entry.heroId === "ngoro" && event.type === "onInvestigate" && event.owner === owner) {
      result.push({ source: heroSource, owner, ability: { id: "ngoro-level-1-clue", trigger: "onInvestigate", effects: [{ type: "addMarker", target: "hero", marker: "clue", amount: 1 }] } });
    }
    /* The maintenance phase becomes visible before its resource decision. Ngoro
       must wait for that decision instead of opening a competing/duplicate UI. */
    if (entry.heroId === "ngoro" && event.type === "onMaintenance" && event.owner === owner && event.afterResourceChoice === true) result.push({ source: heroSource, owner, ability: { id: "ngoro-level-1-maintenance", trigger: "onMaintenance", effects: [{ type: "chooseDeckAndInvestigate", amount: 1 }] } });
    if (entry.heroId === "zayan" && event.type === "onCombatStart" && event.owner === owner && (entry.board || []).some((card) => !(card.text || "").trim())) result.push({ source: heroSource, owner, ability: { id: "zayan-level-1", trigger: "onCombatStart", effects: [{ type: "modifyStats", target: "allyCreature", vanillaOnly: true, attack: 1, health: 1, duration: "turn", selections: 1 }] } });
  });
  return result.sort((a, b) => a.owner - b.owner || (a.source.slot ?? 99) - (b.source.slot ?? 99) || String(a.ability.id).localeCompare(String(b.ability.id)));
}

export function executeCommand(inputState, command, options = {}) {
  const state = clone(inputState); const originalPhase = inputState.phase; const maxSteps = options.maxSteps ?? 512; const maxRepeats = options.maxRepeats ?? 4; const handlers = { ...defaultEffectHandlers, ...(options.handlers || {}) }; let actionLabel = command.type;
  if (command.type === "advancePhase" && state.phase === "manutencao" && state.players[state.active]?.skipNextTurn) { state.players[state.active].skipNextTurn = false; state.phase = "fim"; }
  const stack = [{ kind: "command", command }]; const trace = []; const repeats = new Map(); let steps = 0;
  while (stack.length) {
    refreshSupportAuras(state);
    refreshHeroRules(state);
    refreshDynamicChoices(state);
    if (++steps > maxSteps) throw new RulesLoopError(`Resolution exceeded ${maxSteps} steps`, trace);
    const key = fingerprint(state, stack); const count = (repeats.get(key) || 0) + 1; repeats.set(key, count); if (count > maxRepeats) throw new RulesLoopError("Repeated resolution state detected", trace);
    const item = stack.pop(); trace.push({ step: steps, kind: item.kind, type: item.command?.type || item.effect?.type || item.event?.type });
    if (state.pendingDecision && !(item.kind === "command" && item.command?.type === "resolveDecision")) { state.pendingDecision.continuation = [item, ...stack.splice(0), ...(state.pendingDecision.continuation || [])]; continue; }
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
      } else if (item.command.type === "beginForcedCombat") {
        const attacker = state.players[item.command.owner].board.find((card) => card.uid === item.command.attackerId), defender = state.players[1 - item.command.owner].board.find((card) => card.uid === item.command.defenderId);
        if (!attacker || !defender) throw new RulesViolation("invalid-forced-attack");
        state.pendingDecision = { kind: "forced-attack", owner: item.command.owner, effect: { type: "forceAttack", attackerId: attacker.uid, defenderId: defender.uid, attacker: { ready: true } }, context: { owner: item.command.owner, sourceId: attacker.uid }, sourceName: attacker.name };
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
        const accelerated = card.type === "Feitiço" && ((card.tags || []).some((tag) => /acelerado/i.test(tag)) || /^\s*acelerado\b/i.test(card.text || ""));
        if (state.active !== item.command.owner && !(accelerated && item.command.hasPriority)) throw new RulesViolation("not-your-priority");
        if (state.phase !== "principal" && !(accelerated && item.command.hasPriority)) throw new RulesViolation("wrong-phase");
        const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay" && conditionMatches(state, card, item.command.owner, ability.condition, { card })); if (playAbilities.some((ability) => !playConditionMatches(state, item.command.owner, ability.playCondition) || ability.effects.some((effect) => effect.type === "replaySelectedAbility" && !replayAbilityCandidates(state, item.command.owner, effect).length))) throw new RulesViolation("play-condition-not-met"); const enterAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onEnter" && conditionMatches(state, card, item.command.owner, ability.condition, { card }));
        if (card.type !== "Criatura" || (item.command.targetIds || []).length) { const targetAbilities = card.type === "Criatura" ? enterAbilities : playAbilities, firstTargetCount = targetAbilities.reduce((sum, ability) => sum + abilityTargetSteps(ability).length, 0), validationCommand = card.type === "Criatura" && entry.heroId === "quarion" && (entry.level || 1) >= 3 ? { ...item.command, targetIds: (item.command.targetIds || []).slice(0, firstTargetCount) } : item.command; validateTargets(state, item.command.owner, targetAbilities, validationCommand, card); }
        for (const ability of playAbilities) validateCosts(state, ability, item.command);
        const staticDiscount = permanentUnits(entry).filter((source) => !source.suffocated).flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === item.command.owner) && (!modifier.firstEachTurn || !(entry.turnCardsPlayed || 0))).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
        const queuedDiscount = nextCardDiscount(entry, card, state.round); const cardModifier = card.costModifierExpiresRound != null && state.round >= card.costModifierExpiresRound ? 0 : card.costModifier || 0; const cost = Math.max(0, (card.cost || 0) + intrinsicCost(state, entry, card) + targetSurcharge(state, item.command.owner, card, item.command.targetIds) + cardModifier + staticDiscount - (queuedDiscount?.amount || 0)); const spell = card.type === "Feitiço"; const canUseReserve = card.type !== "Criatura"; const paysLife = card.type === "Criatura" && !!entry.nextCreaturePaysLife;
        const available = accelerated && state.active !== item.command.owner ? entry.reserve : paysLife ? entry.life - (entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0) : entry.energy + (canUseReserve ? entry.reserve : 0);
        if (available < cost) throw new RulesViolation(paysLife ? "not-enough-life" : "not-enough-energy");
        for (const ability of playAbilities) payCosts(state, ability, item.command);
        if (paysLife) { recordLifeLoss(state, item.command.owner, cost, { sourceOwner: item.command.owner, sourceId: card.id, paidAsCost: true }); entry.nextCreaturePaysLife = false; }
        else if (accelerated) { const fromReserve = Math.min(entry.reserve, cost); entry.reserve -= fromReserve; entry.energy -= cost - fromReserve; }
        else if (canUseReserve) { const fromReserve = Math.min(entry.reserve, cost); entry.reserve -= fromReserve; entry.energy -= cost - fromReserve; } else { entry.energy -= cost; }
        if (queuedDiscount) entry.nextCardDiscounts = (entry.nextCardDiscounts || []).filter((rule) => rule !== queuedDiscount); entry.hand.splice(cardIndex, 1); for (const source of permanentUnits(entry)) if (typeof source.cardsPlayedAfterSelf === "number") source.cardsPlayedAfterSelf++; entry.cardsPlayed = (entry.cardsPlayed || 0) + 1; if (state.active === item.command.owner) entry.turnCardsPlayed = (entry.turnCardsPlayed || 0) + 1; if (state.active === item.command.owner && entry.heroId === "goblin") entry.goblinTurnCardsPlayed = (entry.goblinTurnCardsPlayed || 0) + 1; entry.namedCardsPlayedThisTurn ||= {}; const playedTokens = [...new Set([card.name, ...(card.tags || [])].filter(Boolean).map((value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()))]; if (playedTokens.some((value) => value.includes("cafe"))) playedTokens.push("cafe"); for (const token of playedTokens) entry.namedCardsPlayedThisTurn[token] = (entry.namedCardsPlayedThisTurn[token] || 0) + 1; if (spell) { entry.spellsPlayed = (entry.spellsPlayed || 0) + 1; entry.turnSpellsPlayed = (entry.turnSpellsPlayed || 0) + 1; } const permanent = card.type !== "Feitiço" || card.abilities?.some((ability) => ability.effects?.some((effect) => effect.type === "remainUntilTurnEnd"));
        if (permanent) {
          if (card.type === "Criatura") entry.nextCreatureTaxes = (entry.nextCreatureTaxes || []).filter((tax) => !(tax.createdRound == null || state.round > tax.createdRound));
          state.nextInstanceId = (state.nextInstanceId || 0) + 1;
          const unit = { ...card, _printedState: card._printedState ? structuredClone(card._printedState) : { name: card.name, type: card.type, cost: card.cost, atk: card.atk, hp: card.hp, text: card.text, tags: structuredClone(card.tags || []), subtypes: structuredClone(card.subtypes || []), abilities: structuredClone(card.abilities || []), page: card.page, id: card.id, image: card.image, hero: card.hero, imageCard: card.imageCard, generatedImage: card.generatedImage }, uid: item.command.instanceId || `${card.id}-${state.round}-${state.nextInstanceId}`, slot: item.command.slot ?? 0, enteredRound: state.round, attackedThisTurn: false, damage: 0, bonusAtk: 0, bonusHp: 0, exhausted: false, summoning: card.type === "Artefato" || (card.type === "Criatura" && !(entry.heroId === "zayan" && (entry.level || 1) >= 3 && !(card.text || "").trim()) && !((card.tags || []).some((tag) => /investida/i.test(String(tag))) && !(card.page === 29 && Math.max(0, (entry.turnCardsPlayed || 0) - 1) < 1))), frozen: false, stunned: false, suffocated: false, immobilized: false, defenseUses: 0, markers: card.markers ?? 0, modifiers: [] };
          if (card.type === "Criatura") { const catInSupport = item.command.placementZone === "support" && entry.heroId === "rasmus" && (entry.level || 1) >= 3 && subtype(card, "Gato"); if (catInSupport) { if (entry.support.length >= 5 || entry.support.some((existing) => existing.slot === unit.slot)) throw new RulesViolation("support-zone-full"); entry.support.push(unit); } else { const replaced = entry.board.find((existing) => existing.slot === unit.slot); if ((replaced && entry.board.length < 5) || (!replaced && entry.board.length >= 5)) throw new RulesViolation("creature-zone-full"); if (replaced) { entry.board = entry.board.filter((existing) => existing !== replaced); const attachments = entry.support.filter((attachment) => attachment.attachedTo === replaced.uid); entry.support = entry.support.filter((attachment) => attachment.attachedTo !== replaced.uid); for (const attachment of attachments) { if (attachment.generatedImage || attachment.imageCard) continue; if (attachment.page === 154) entry.obscuro.push(attachment); else entry.grave.push({ ...attachment, deathCause: "replaced" }); } if (!replaced.generatedImage && !replaced.imageCard) entry.obscuro.push({ ...replaced, lastZone: "board", deathCause: "replaced" }); stack.push({ kind: "event", event: { type: "onPermanentLeaves", owner: item.command.owner, sourceId: replaced.uid, cardId: replaced.uid, card: replaced, zone: "board" } }); } const preEntryControlledIds = entry.board.map((card) => card.uid || card.id); entry.board.push(unit); } entry.subtypesEnteredThisTurn ||= {}; for (const value of new Set([...(card.subtypes || []), ...(card.tags || [])])) entry.subtypesEnteredThisTurn[value] = (entry.subtypesEnteredThisTurn[value] || 0) + 1; stack.push({ kind: "event", event: { type: "onCreatureEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit, preEntryControlledIds: entry.board.filter((value) => value !== unit).map((value) => value.uid || value.id) } }); }
          else if (card.type === "Terreno") { if (entry.terrain && !entry.terrain.generatedImage) entry.grave.push(entry.terrain); entry.terrain = unit; }
          else { if (entry.support.length >= 5 || entry.support.some((existing) => existing.slot === unit.slot)) throw new RulesViolation("support-zone-full"); if (card.type === "Artefato") { const attached = entry.board.find((creature) => creature.uid === item.command.attachedTo); if (!attached && card.page !== 304) throw new RulesViolation("artifact-target-required"); if (attached) { if (entry.support.some((artifact) => artifact.attachedTo === attached.uid)) throw new RulesViolation("artifact-target-required"); unit.attachedTo = attached.uid; unit.slot = attached.slot; } } entry.support.push(unit); }
          const enter = enterAbilities;
          if (enter.length) stack.push({ kind: "event", event: { type: "onFirstActResolved", owner: item.command.owner, sourceId: unit.uid, card: unit } });
          const hasEnterTargets = (item.command.targetIds || []).length > 0;
          const enterEffectCanResolve = (effect) => hasEnterTargets || (targetScope(effect.target) === TargetScope.NONE && effect.relation !== "selectedTarget");
          const duplicateQuarionFirstAct = entry.heroId === "quarion" && (entry.level || 1) >= 3 && entry.quarionFirstActRound !== state.round && enter.length > 0;
          if (duplicateQuarionFirstAct) entry.quarionFirstActRound = state.round;
          for (const ability of enter.reverse()) {
            const resolvable = [...ability.effects].filter(enterEffectCanResolve), steps = abilityTargetSteps(ability, unit.uid || unit.id), supplied = item.command.targetIds || [];
            if (duplicateQuarionFirstAct && steps.length && supplied.length < steps.length * 2 && canSatisfyTargetSteps(state, item.command.owner, steps)) state.pendingDecision = { kind: "targets", owner: item.command.owner, effect: { replayEffects: resolvable }, context: { ...item.command, sourceId: unit.uid, effectSource: unit, targetIds: [] }, targetSteps: steps, sourceName: `Quarion III · ${unit.name || "Primeiro Ato"}` };
            const repetitions = duplicateQuarionFirstAct && (!steps.length || supplied.length >= steps.length * 2) ? 2 : 1;
            for (let repetition = repetitions - 1; repetition >= 0; repetition--) for (const effect of [...resolvable].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid, effectSource: unit, targetIds: steps.length ? supplied.slice(repetition * steps.length, (repetition + 1) * steps.length) : supplied } });
          }
          const staticAbilities = (unit.abilities || []).filter((ability) => ability.trigger === "static");
          for (const ability of staticAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid, effectSource: unit } });
        } else entry.grave.push(card);
        for (const ability of playAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: item.command.instanceId || card.id, effectSource: card } });
        if ((item.command.targetIds || []).length) { stack.push({ kind: "event", event: { type: "onTargetedByOpponent", owner: item.command.owner, sourceId: card.id, source: card, targetIds: item.command.targetIds } }); stack.push({ kind: "event", event: { type: "onAttachedCreatureTargeted", owner: item.command.owner, sourceId: card.id, source: card, targetIds: item.command.targetIds } }); }
        stack.push({ kind: "event", event: { type: "onCardPlayed", owner: item.command.owner, cardId: card.id, card } }); if (spell) stack.push({ kind: "event", event: { type: "onSpellCast", owner: item.command.owner, cardId: card.id, card, chosenElement: item.command.chosenElement } });
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
          recordLifeLoss(state, defenderOwner, attack, { sourceOwner: attackerOwner, sourceId: attacker.uid || attacker.id, damage: true });
          if (attack > 0) { attacker.damagedOwnersThisTurn ||= []; if (!attacker.damagedOwnersThisTurn.includes(defenderOwner)) attacker.damagedOwnersThisTurn.push(defenderOwner); }
          if (attack > 0 && hasKeyword(attacker, /roubo de vida/i)) attackerPlayer.life = Math.min(attackerPlayer.maxLife ?? 30, attackerPlayer.life + attack);
        } else {
          const combatBlocked = (attacker.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(defender, rule.cannotCombatSubtype)) || (defender.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(attacker, rule.cannotCombatSubtype)); const blockerKeyword = !attacker.suffocated ? requiredBlockerKeyword(state,attacker,attackerOwner) : null, requiredBlockerPattern = blockerKeyword ? new RegExp(String(blockerKeyword).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i") : null; if (defender.exhausted || defender.stunned || defender.cannotDefend || combatBlocked || (requiredBlockerPattern && !hasKeyword(defender, requiredBlockerPattern)) || hasKeyword(defender, /atordoado/i) || (defender.defenseUses || 0) >= defenderCapacity(defender)) throw new RulesViolation("invalid-defender");
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
          if (hasKeyword(attacker, /atropelar/i) && dealtByAttacker > defenderRemaining) { const overflow = dealtByAttacker - defenderRemaining; recordLifeLoss(state, defenderOwner, overflow, { sourceOwner: attackerOwner, sourceId: attacker.uid || attacker.id, damage: true }); damageDealtByAttacker += overflow; }
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
      } else if (item.command.type === "activateHero") {
        const entry = state.players[item.command.owner];
        const priorityHeroActivation = !!item.command.hasPriority;
        if (!priorityHeroActivation && (state.active !== item.command.owner || state.phase !== "principal")) throw new RulesViolation("not-your-turn");
        const page = HERO_RULE_PAGE[entry.heroId], rule = page ? getExplicitCardRule(`p${page}`) : null;
        const ability = abilitiesForLevel(rule, entry.level || 1).find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated");
        const source = { uid: `${entry.heroId}-hero-${item.command.owner}`, id: `${entry.heroId}-hero-${item.command.owner}`, name: entry.heroId, slot: -1 };
        if (!ability || !availabilityMatches(state, source, item.command.owner, ability.availability) || !usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-not-available");
        const activationSteps = abilityTargetSteps(ability);
        if (activationSteps.length && !(item.command.targetIds || []).length) { if (!canSatisfyTargetSteps(state, item.command.owner, activationSteps)) throw new RulesViolation("ability-not-available"); state.pendingDecision = { kind: "activation-targets", owner: item.command.owner, effect: {}, context: { owner: item.command.owner, sourceId: source.uid }, targetSteps: activationSteps, sourceName: source.name, command: { ...item.command } }; continue; }
        validateTargets(state, item.command.owner, [ability], item.command, source); validateCosts(state, ability, { ...item.command, sourceId: source.uid }); payCosts(state, ability, { ...item.command, sourceId: source.uid }); claimUsage(state, source, item.command.owner, ability); const heroSlot = abilitiesForLevel(rule, entry.level || 1).filter((candidate) => candidate.trigger === "activated").findIndex((candidate) => candidate.id === ability.id); if (heroSlot >= 0) entry.abilityUses[`${entry.heroId}-${ability.id === "ngoro-level-2" ? 1 : ability.id === "ngoro-level-3" ? 2 : heroSlot}`] = 1; actionLabel = source.name;
        for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: source.uid, effectSource: source } });
      } else if (item.command.type === "activate") {
        const entry = state.players[item.command.owner]; if (state.active !== item.command.owner) throw new RulesViolation("not-your-turn");
        const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === item.command.sourceId); let ability = source?.abilities?.find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated");
        /* Long-lived multiplayer rooms may contain a permanent serialized before
           its canonical activated ability was migrated. Restore only the missing
           printed ability from the authoritative catalog while preserving every
           runtime field (markers, damage, slot and status) on the live source. */
        if (source && !ability) { const printed = (state.cardCatalog || []).find((card) => card.page === source.page || card.id === source.id); const canonical = printed?.abilities?.find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated"); if (canonical) { source.abilities = [...(source.abilities || []), clone(canonical)]; ability = source.abilities.at(-1); } }
        if (!ability) throw new RulesViolation("ability-not-found"); if (source.summoning) throw new RulesViolation("summoning-sickness"); if (!canExecuteCard(source, handlers)) throw new RulesViolation("card-not-migrated"); if (!availabilityMatches(state, source, item.command.owner, ability.availability)) throw new RulesViolation("ability-not-available"); actionLabel = source.name || source.uid; if (!usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-limit-reached"); const isAuxiliary = entry.support.includes(source) || entry.terrain === source; if (isAuxiliary && (source.summoning || source.enteredRound === state.round || source.exhausted)) throw new RulesViolation("cannot-tap"); const activationSteps = abilityTargetSteps(ability).map((step) => ({ ...step, excludeIds: ability.effects?.some((effect) => effect.excludeCurrentAttachment) && source.attachedTo ? [...new Set([...(step.excludeIds || []), source.attachedTo])] : step.excludeIds || [] })); if (activationSteps.length && !(item.command.targetIds || []).length) { if (!canSatisfyTargetSteps(state, item.command.owner, activationSteps)) throw new RulesViolation("ability-not-available"); state.pendingDecision = { kind: "activation-targets", owner: item.command.owner, effect: {}, context: { owner: item.command.owner, sourceId: source.uid }, targetSteps: activationSteps, sourceName: source.name, command: { ...item.command } }; continue; } validateTargets(state, item.command.owner, [ability], item.command, source); validateCosts(state, ability, item.command); payCosts(state, ability, item.command); if (isAuxiliary && !(ability.costs || []).some((cost) => cost.type === "tap")) source.exhausted = true; claimUsage(state, source, item.command.owner, ability);
        /* A printed "Vire: Destrua este artefato e depois faça X" is an
           activated ability. The source remains available while X resolves;
           only the final self-destruction effect is placed at the end. */
        const selfDestruction = ability.effects.filter((effect) => effect.type === "destroy" && ["self", "this", "thisArtifact", "thisEnchantment"].includes(effect.target));
        const otherEffects = ability.effects.filter((effect) => !selfDestruction.includes(effect));
        const recruitCopies = subtype(source, "Recruta") && permanentUnits(entry).some((chief) => chief.page === 182 && !chief.suffocated && (chief.staticModifiers || []).some((modifier) => modifier.type === "doubleRecruitEffects")) ? 2 : 1; const repeatedEffects = Array.from({ length: recruitCopies }, () => otherEffects).flat(); [...repeatedEffects, ...selfDestruction].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));
        if ((item.command.targetIds || []).length) { stack.push({ kind: "event", event: { type: "onTargetedByOpponent", owner: item.command.owner, sourceId: source.uid, source, targetIds: item.command.targetIds } }); stack.push({ kind: "event", event: { type: "onAttachedCreatureTargeted", owner: item.command.owner, sourceId: source.uid, source, targetIds: item.command.targetIds } }); }
      } else if (item.command.type === "resolveDecision") {
        const decision = state.pendingDecision; if (!decision || (decision.owner !== item.command.owner && decision.context?.decisionOwner !== item.command.owner)) throw new RulesViolation("decision-not-owned");
        const continuation = decision.continuation || [];
        if (decision.kind === "search") {
          const entry = state.players[item.command.owner], effect = decision.effect, selectedIds = [...new Set(item.command.selectedCardIds || (item.command.selectedCardId ? [item.command.selectedCardId] : []))];
          const maximum = Math.min(effect.amount || 1, entry.deck.length), eligible = entry.deck.filter((card) => (!effect.types?.length || effect.types.includes(card.type)) && (!effect.subtype || hasSubtype(card, effect.subtype)) && (!effect.nameIncludes || String(card.name || "").toLowerCase().includes(String(effect.nameIncludes).toLowerCase())) && (!effect.vanillaOnly || !String(card.text || "").trim()) && (effect.minCost == null || (card.cost || 0) >= effect.minCost) && (effect.maxCost == null || (card.cost || 0) <= effect.maxCost) && (!effect.maxCostFromMarkerAmount || (card.cost || 0) <= Number(decision.context.markerAmount || 0)));
          if (selectedIds.length !== Math.min(maximum, eligible.length) || selectedIds.some((id) => !eligible.some((card) => card.uid === id || card.id === id))) throw new RulesViolation("invalid-search-selection");
          const selected = selectedIds.map((id) => { const index = entry.deck.findIndex((card) => card.uid === id || card.id === id); return entry.deck.splice(index, 1)[0]; });
          if (effect.destination === "hand") entry.hand.push(...selected.map((card) => effect.reveal || effect.name || effect.nameIncludes ? { ...card, revealed: true, revealedTo: [0, 1] } : card));
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
        if (decision.kind === "image-placement") {
          const targetOwner = Number(decision.effect.targetOwner), slot = Number(item.command.slot), placementZone = item.command.placementZone === "support" ? "support" : "creature";
          if (![0, 1].includes(targetOwner) || !Number.isInteger(slot) || slot < 0 || slot > 4) throw new RulesViolation("invalid-image-placement");
          const allowed = placementZone === "support" ? (decision.effect.supportSlots || []) : (decision.effect.creatureSlots || []);
          if (!allowed.includes(slot)) throw new RulesViolation("invalid-image-placement");
          const targetEntry = state.players[targetOwner];
          if (placementZone === "support" ? targetEntry.support.some((unit) => unit.slot === slot) : targetEntry.board.some((unit) => unit.slot === slot)) throw new RulesViolation("image-placement-occupied");
          state.pendingDecision = null; stack.push(...continuation);
          stack.push({ kind: "effect", effect: { type: "createImage", name: decision.effect.name, destination: "field" }, context: { ...decision.context, owner: targetOwner, decisionOwner: item.command.owner, slot, placementZone } });
          continue;
        }
        if (decision.kind === "investigate-selection") {
          const targetOwner = Number(decision.effect.targetOwner);
          if (![0, 1].includes(targetOwner)) throw new RulesViolation("invalid-investigation-target");
          const target = state.players[targetOwner], investigator = state.players[item.command.owner];
          const amount = Math.min(Math.max(1, Number(decision.effect.amount || 1)), target.deck.length);
          const topCards = target.deck.slice(0, amount), topIds = topCards.map((card) => card.uid || card.id);
          const selectedIds = [...new Set(item.command.selectedCardIds || [])];
          if (selectedIds.some((id) => !topIds.includes(id))) throw new RulesViolation("invalid-investigation-selection");
          target.deck.splice(0, amount);
          const selected = topCards.filter((card) => selectedIds.includes(card.uid || card.id)).map((card) => ({ ...card, revealed: true, revealedTo: [0, 1] }));
          const archived = topCards.filter((card) => !selectedIds.includes(card.uid || card.id)).map((card) => { const copy = { ...card }; delete copy.revealed; delete copy.revealedTo; return copy; });
          target.deck.unshift(...selected);
          for (const card of archived) {
            if ((investigator.archiveToGrave || 0) > 0) { investigator.archiveToGrave--; target.grave.push({ ...card, deathCause: "archived" }); }
            else target.deck.push(card);
          }
          state.pendingDecision = null;
          stack.push(...continuation);
          for (const card of [...selected].reverse()) stack.push({ kind: "event", event: { type: "onCardRevealed", owner: item.command.owner, targetOwner, sourceId: decision.context?.sourceId, card, cardType: card.type } });
          stack.push({ kind: "event", event: { type: "onInvestigate", owner: item.command.owner, targetOwner, sourceId: decision.context?.sourceId, cards: selected, amount } });
          continue;
        }
        if (decision.kind === "hand-limit-discard") {
          const entry = state.players[item.command.owner], ids = [...new Set(item.command.selectedCardIds || [])], amount = Math.min(decision.effect.amount || 0, entry.hand.length);
          if (ids.length !== amount || ids.some((id) => !entry.hand.some((card) => card.uid === id || card.id === id))) throw new RulesViolation("invalid-hand-selection");
          for (const id of ids) { const index = entry.hand.findIndex((card) => card.uid === id || card.id === id); entry.grave.push(entry.hand.splice(index, 1)[0]); }
          state.pendingDecision = null; stack.push(...continuation); continue;
        }
        if (decision.kind === "marker-payment-search") {
          const entry = state.players[item.command.owner], requested = decision.effect.amount || 5;
          const selections = item.command.markerSelections || Object.entries((item.command.targetIds || []).reduce((counts, id) => ({ ...counts, [id]: (counts[id] || 0) + 1 }), {})).map(([id, amount]) => ({ id, amount }));
          if (selections.reduce((sum, choice) => sum + Number(choice.amount || 0), 0) !== requested) throw new RulesViolation("invalid-marker-selection");
          for (const choice of selections) { const card = permanentUnits(entry).find((candidate) => (candidate.uid || candidate.id) === choice.id); if (!card || markerTotalForEngine(card) < choice.amount) throw new RulesViolation("invalid-marker-selection"); }
          for (const choice of selections) { const card = permanentUnits(entry).find((candidate) => (candidate.uid || candidate.id) === choice.id); removeMarkersForEngine(card, Number(choice.amount || 0)); }
          state.pendingDecision = { kind: "search", owner: item.command.owner, effect: { type: "search", amount: 1, types: decision.effect.types, destination: decision.effect.destination || "hand", shuffle: decision.effect.shuffle !== false }, context: decision.context, continuation };
          continue;
        }
        if (decision.kind === "zayan-destruction-replacement") {
          const original = findPermanentById(state, decision.effect.originalId), replacementId = item.command.targetIds?.[0];
          if (!original) { state.pendingDecision = null; stack.push(...continuation); continue; }
          if (item.command.choiceIndex === 1) { if (!replacementId || !(decision.effect.choices || []).includes(replacementId)) throw new RulesViolation("invalid-target"); const health = effectiveHealth(state, original, item.command.owner); original.damage = Math.min(original.damage || 0, Math.max(0, health - 1)); stack.push({ kind: "effect", effect: { type: "destroy", target: "selected" }, context: { ...decision.context, owner: decision.context.owner, targetIds: [replacementId], zayanReplacementResolved: true } }); }
          else stack.push({ kind: "effect", effect: { type: "destroy", target: "selected" }, context: { ...decision.context, targetIds: [decision.effect.originalId], zayanReplacementResolved: true } });
          if (decision.effect.remainingIds?.length) stack.push({ kind: "effect", effect: { type: "destroy", target: "selected" }, context: { ...decision.context, targetIds: decision.effect.remainingIds } });
          state.pendingDecision = null; stack.push(...continuation); continue;
        }
        if (decision.kind === "maria-stat-tie") { const chosen = item.command.targetIds?.[0], source = findPermanentById(state, decision.effect.sourceId); if (!source || !(decision.effect.choices || []).includes(chosen)) throw new RulesViolation("invalid-target"); source.dynamicStats ||= {}; source.dynamicStats.preferredSourceId = chosen; state.pendingDecision = null; stack.push(...continuation); continue; }
        if (decision.kind === "hand-discard-one") {
          const entry = state.players[item.command.owner], ids = [...new Set(item.command.selectedCardIds || [])];
          if (ids.length !== 1 || !entry.hand.some((card) => card.uid === ids[0] || card.id === ids[0])) throw new RulesViolation("invalid-hand-selection");
          const index = entry.hand.findIndex((card) => card.uid === ids[0] || card.id === ids[0]);
          entry.grave.push(entry.hand.splice(index, 1)[0]);
          state.pendingDecision = null; stack.push(...continuation); continue;
        }
        if (decision.kind === "grave-to-hand-many" || decision.kind === "grave-to-hand-and-banish") {
          const entry = state.players[item.command.owner], ids = [...new Set(item.command.selectedCardIds || [])], choices = decision.effect.choices || [], minimum = Math.min(decision.effect.minimum ?? 0, choices.length), maximum = Math.min(decision.effect.maximum ?? choices.length, choices.length);
          if (ids.length < minimum || ids.length > maximum || ids.some((id) => !choices.includes(id) || !entry.grave.some((card) => card.uid === id || card.id === id))) throw new RulesViolation("invalid-grave-selection");
          const selected = ids.map((id) => { const index = entry.grave.findIndex((card) => card.uid === id || card.id === id); return entry.grave.splice(index, 1)[0]; });
          entry.hand.push(...selected.map((card) => ({ ...card, revealed: true, revealedTo: [0, 1] })));
          if (decision.kind === "grave-to-hand-and-banish") entry.obscuro.push(...entry.grave.splice(0).map((card) => resetCardForZone(state, card)));
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
          const attackerId = item.command.attackerId || item.command.targetIds?.[0] || decision.effect.attackerId;
          const defenderId = item.command.defenderId || item.command.targetIds?.[1] || decision.effect.defenderId;
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
            || (attacker.summoning && !decision.effect.attacker?.allowSummoning)
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
            recordLifeLoss(state, defenderOwner, overflow, { sourceOwner: attackerOwner, sourceId: attacker.uid || attacker.id, damage: true });
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
          if (decision.effect.optional && item.command.choiceIndex == null && !(item.command.targetIds || []).length) { state.pendingDecision = null; stack.push(...continuation); continue; }
          if ((item.command.targetIds || []).length !== 1 || !findPermanentById(state, item.command.targetIds[0])) throw new RulesViolation("invalid-target");
        }
        if (decision.kind === "replay-ability") {
          const selected = permanentUnits(state.players[item.command.owner]).find((card) => (card.uid === item.command.selectedCardId || card.id === item.command.selectedCardId) && card.type === (decision.effect.selector?.type || card.type));
          const ability = selected?.abilities?.find((candidate) => candidate.trigger === decision.effect.trigger);
          if (!selected || !ability) throw new RulesViolation("card-choice-required");
          const targetSteps = abilityTargetSteps(ability, selected.uid || selected.id);
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
          if(ids.length){source.modifiers||=[];source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId:source.uid||source.id});}
          continue;
        }
        if (decision.kind === "targets" || decision.kind === "activation-targets") {
          const targetIds = item.command.targetIds || []; const steps = decision.targetSteps || [];
          const minimum = steps.filter((step) => !step.optional).length;
          if (targetIds.length < minimum || targetIds.length > steps.length || new Set(targetIds).size !== targetIds.length) throw new RulesViolation("invalid-target-count");
          targetIds.forEach((id, index) => { const step = steps[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - decision.owner : id === "ally-hero" || id === "controller-hero" ? decision.owner : Number(id.slice(-1))) : unitOwner(state, id); const target = hero || targetOwner < 0 ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const targetKind = hero ? "hero" : target && (target.type === "Criatura" || state.players[targetOwner].board.includes(target)) ? "creature" : "permanent"; if (targetOwner < 0 || (!hero && !target) || !isValidTarget(step, decision.owner, targetOwner, targetKind) || (!hero && !targetMatchesStep(state, target, id, step)) || (hero && ((step.requiredSubtype || step.requiredName || step.imageOnly || step.maxCost != null) || (step.excludeIds || []).includes(id)))) throw new RulesViolation("invalid-target"); });
          if (decision.kind === "activation-targets") { state.pendingDecision = null; stack.push(...continuation); stack.push({ kind: "command", command: { ...decision.command, targetIds } }); continue; }
        }
        state.pendingDecision = null; stack.push(...continuation); if (decision.kind === "repeat-choice" && decision.effect.remaining > 1) stack.push({ kind: "effect", effect: { ...decision.effect, type: "repeatChoiceForCoffeeCount", remaining: decision.effect.remaining - 1 }, context: decision.context }); const chosen = decision.effect.choices?.[item.command.choiceIndex] || decision.effect.replayEffects || [];
        const resolvedTargetIds=item.command.targetIds ?? decision.context?.targetIds ?? [];const targetSnapshots=resolvedTargetIds.map((id)=>{const owner=unitOwner(state,id);if(owner<0)return null;const target=permanentUnits(state.players[owner]).find((card)=>card.uid===id||card.id===id);return target?{id,owner,slot:target.slot}:null}).filter(Boolean);const decisionContext = { ...decision.context, decisionOwner: item.command.owner, choiceIndex: item.command.choiceIndex, selectedCardId: item.command.selectedCardId, targetIds: resolvedTargetIds, targetSnapshots };
        for (const effect of [...chosen].reverse()) stack.push({ kind: "effect", effect, context: decisionContext });
      } else if (item.command.type === "reposition") {
        const pending = state.pendingReposition;
        if (!pending || (pending.activeOwner != null ? pending.activeOwner !== item.command.owner : !pending.owners.includes(item.command.owner)) || pending.confirmed.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");
        const entry = state.players[item.command.owner];
        for (const move of item.command.moves || []) {
          const destination = move.slot;
          if (!Number.isInteger(destination) || destination < 0 || destination > 4) throw new RulesViolation("invalid-reposition");
          const creature = entry.board.find((card) => card.uid === move.sourceId);
          if (!creature) throw new RulesViolation("invalid-reposition-card");
          const origin = creature.slot;
          if (origin === destination) continue;
          const occupant = entry.board.find((card) => card.uid !== creature.uid && card.slot === destination);
          const originSupport = entry.support.find((card) => card.slot === origin);
          const destinationSupport = entry.support.find((card) => card.slot === destination);
          const movingArtifact = entry.support.find((card) => card.attachedTo === creature.uid);
          const occupantArtifact = occupant ? entry.support.find((card) => card.attachedTo === occupant.uid) : null;
          if (occupant) occupant.slot = origin;
          creature.slot = destination;
          if (movingArtifact || occupantArtifact) {
            if (originSupport) originSupport.slot = destination;
            if (destinationSupport) destinationSupport.slot = origin;
          }
        }
      } else if (item.command.type === "confirmReposition") {
        const pending = state.pendingReposition;
        if (!pending || (pending.activeOwner != null ? pending.activeOwner !== item.command.owner : !pending.owners.includes(item.command.owner)) || pending.confirmed.includes(item.command.owner)) throw new RulesViolation("reposition-unavailable");
        pending.confirmed.push(item.command.owner);
        const next = pending.owners.find((owner) => !pending.confirmed.includes(owner));
        if (next == null) state.pendingReposition = null;
        else { pending.activeOwner = next; pending.deadline = Date.now() + 30000; }
      } else if (item.command.type === "emit") stack.push({ kind: "event", event: item.command.event });
      else if (item.command.type === "advancePhase") {
        if (state.phase === "fim" && (item.command.handLimitSatisfied || state.players[state.active].hand.length <= 9)) bankEndingEnergy(state);
        if (state.pendingDecision || state.pendingReposition) throw new RulesViolation("interaction-pending"); if (state.phase === "fim" && !item.command.handLimitSatisfied && state.players[state.active].hand.length > 9) { state.pendingDecision = { kind: "hand-limit-discard", owner: state.active, effect: { amount: state.players[state.active].hand.length - 9 }, context: { owner: state.active }, sourceName: "Limite de mão", continuation: [{ kind: "command", command: { ...item.command, handLimitSatisfied: true } }] }; continue; } const order = ["manutencao", "principal", "combate", "fim"]; const index = order.indexOf(state.phase); if (state.phase === "fim") state.players.forEach((entry) => { for (const unit of permanentUnits(entry)) { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "turn"); unit.abilities = (unit.abilities || []).filter((ability) => !ability.temporary); unit.temporaryTags = []; unit.temporarySubtypes = []; unit.combatRestrictions = (unit.combatRestrictions || []).filter((rule) => rule.duration !== "turn"); unit.attackLimit = 1; unit.damageShields = (unit.damageShields || []).filter((shield) => shield.expires !== "turn" && shield.duration !== "turn"); } entry.nextElementEffects = (entry.nextElementEffects || []).filter((effect) => effect.expires !== "turn"); entry.damageShields = (entry.damageShields || []).filter((shield) => shield.expires !== "turn" && shield.duration !== "turn"); }); if (state.phase === "combate" && state.players[state.active].board.some((unit) => !unit.exhausted && !unit.attackedThisTurn && !unit.summoning && !unit.stunned && !hasKeyword(unit, /atordoado/i) && attackPermissionMet(unit) && hasKeyword(unit, /indom[aá]vel/i))) throw new RulesViolation("indomitable-must-attack"); if (state.phase === "combate") state.players.forEach((entry) => entry.board.forEach((unit) => { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "combat"); if ((unit.defenseUses || 0) > 0) unit.exhausted = true; })); const leavingPhase = state.phase; state.phase = order[(index + 1) % order.length]; if (leavingPhase === "manutencao" && state.phase === "principal") stack.push({ kind: "event", event: { type: "onMaintenanceExit", owner: state.active } }); if (state.phase === "fim") { stack.push({ kind: "event", event: { type: "onTurnEnd", owner: state.active } }); const due = (state.delayedEffects || []).filter((entry) => entry.timing === "turnEnd" && entry.owner === state.active); state.delayedEffects = (state.delayedEffects || []).filter((entry) => !due.includes(entry)); for (const delayed of due.reverse()) stack.push({ kind: "effect", effect: delayed.effect, context: delayed.context }); } if (state.phase === "combate") stack.push({ kind: "event", event: { type: "onCombatStart", owner: state.active } }); if (state.phase === "manutencao") { const previousActive = 1 - state.active; state.players[previousActive].goblinTurnCardsPlayed = 0; state.active = 1 - state.active; state.round += 1; state.players.forEach((candidate) => [...(candidate.hand || []), ...(candidate.deck || []), ...(candidate.grave || []), ...permanentUnits(candidate)].forEach((unit) => { if (unit.attackZeroUntilOwnerMaintenance === state.active) delete unit.attackZeroUntilOwnerMaintenance; })); state.players.forEach((candidate) => (candidate.board || []).forEach((unit) => { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.expiresOnMaintenanceOwner !== state.active); })); const entry = state.players[state.active]; entry.abilityUses = {}; entry.subtypesEnteredThisTurn = {}; entry.turnCardsPlayed = 0; entry.turnSpellsPlayed = 0; for (const unit of permanentUnits(entry)) { unit.modifiers = (unit.modifiers || []).filter((modifier) => modifier.duration !== "turn" && modifier.duration !== "combat"); unit.temporaryTags = []; unit.temporarySubtypes = []; unit.combatRestrictions = (unit.combatRestrictions || []).filter((rule) => rule.duration !== "turn"); unit.attackLimit = 1; unit.summoning = false; unit.attackedThisTurn = false; unit.attacksThisTurn = 0; unit.defenseUses = 0; const skipNextUntap = !!unit.skipNextUntap; const immobilized = unit.immobilized || hasKeyword(unit, /imobilizado/i); if (skipNextUntap) { unit.skipNextUntap = false; unit.exhausted = true; } else if (immobilized) { unit.immobilized = false; unit.tags = (unit.tags || []).filter((tag) => !/imobilizado/i.test(String(tag))); } else unit.exhausted = false; } for (const unit of entry.board || []) unit.damage = 0; stack.push({ kind: "event", event: { type: "onMaintenance", owner: state.active } }); }
      } else throw new RulesViolation("unknown-command");
    } else if (item.kind === "effect") {
      const replacements = state.players[item.context.owner]?.replacementEffects || [];
      const replacementIndex = item.context.replacementApplied ? -1 : replacements.findIndex((entry) => String(item.context.effectSource?.name || "").toLowerCase().includes(String(entry.nameIncludes || "").toLowerCase()));
      if (replacementIndex >= 0) { replacements.splice(replacementIndex, 1); stack.push({ kind: "effect", effect: item.effect, context: { ...item.context, replacementApplied: true } }); }
      if (item.effect.type === "replaySelectedAbility") item.context.replayCandidateIds = replayAbilityCandidates(state, item.context.owner, item.effect).map((card) => card.uid || card.id);
      const appliedTargetSnapshots = captureEffectTargets(state, item.effect, item.context);
      applyEffect(state, item.effect, item.context, handlers);
      recordAppliedTargetEffects(state, item.effect, item.context, appliedTargetSnapshots);
      if (state.pendingDecision && stack.length) { state.pendingDecision.continuation = [...stack.splice(0), ...(state.pendingDecision.continuation || [])]; }
      if (item.context.effectSource?.name && (item.context.targetIds || []).length) stack.push({ kind: "event", event: { type: "onNamedEffectApplied", owner: item.context.owner, sourceId: item.context.sourceId, effectSource: item.context.effectSource, card: item.context.effectSource, effect: item.effect, targetIds: item.context.targetIds } });
      cleanupLethal(state, stack);
      for (const event of (state.rulesEvents || []).splice(0).reverse()) stack.push({ kind: "event", event });
      if (state.pendingDecision && stack.length) state.pendingDecision.continuation = [...stack.splice(0), ...(state.pendingDecision.continuation || [])];
      stack.push({ kind: "event", event: { type: `after:${item.effect.type}`, owner: item.context.owner, sourceId: item.context.sourceId } });
    } else if (item.kind === "event") {
      if (item.event.type === "onDamageTaken" && item.event.amount > 0) {
        const targetOwner = unitOwner(state, item.event.targetId);
        const target = targetOwner >= 0 ? state.players[targetOwner].board.find((card) => (card.uid || card.id) === item.event.targetId) : null;
        if (target?.page === 165) {
          target.modifiers ||= [];
          target.modifiers.push({ attack: 1, health: 0, duration: "permanent", sourceId: target.uid || target.id });
        }
      }
      const triggered = activeAbilities(state, item.event); for (const trigger of triggered.reverse()) { claimUsage(state, trigger.source, trigger.owner, trigger.ability); const baseTargetSteps = abilityTargetSteps(trigger.ability, trigger.source.uid || trigger.source.id); const imageEntering = item.event.type === "onEnter" && (item.event.card?.generatedImage || item.event.card?.imageCard); const targetSteps = imageEntering ? baseTargetSteps.map((step) => ({ ...step, excludeIds: [...new Set([...(step.excludeIds || []), item.event.sourceId].filter(Boolean))] })) : baseTargetSteps; const context = { owner: trigger.owner, sourceId: trigger.ability.replaySourceId || trigger.source.uid, event: item.event, targetIds: trigger.ability.useEventTargets === false ? [] : item.event.targetIds || [] }; if (targetSteps.length && !context.targetIds.length) { if (!canSatisfyTargetSteps(state, trigger.owner, targetSteps)) continue; state.pendingDecision = { kind: "targets", owner: trigger.owner, effect: { replayEffects: trigger.ability.effects }, context, targetSteps, sourceName: trigger.ability.replaySourceId ? item.event.card?.name || "Primeiro Ato" : trigger.source.name || "efeito ativado" }; break; } for (const effect of [...trigger.ability.effects].reverse()) stack.push({ kind: "effect", effect, context }); }
    }
  }
  if (command.type === "advancePhase" && originalPhase === "fim" && state.phase === "manutencao") {
    const entry = state.players[state.active]; state.players.forEach((playerEntry) => { playerEntry.turnDeaths = 0; }); entry.lifeLostThisTurn = 0; entry.lifeLossEvents = 0; entry.cardsDrawnThisTurn = 0; entry.cardsMilledThisTurn = 0; entry.namedCardsPlayedThisTurn = {}; if (entry.heroId === "saymon") entry.heroXP = 0;
  }
  state.events = (state.events || 0) + 1; state.log ||= []; state.log.unshift({ id: `rules-${state.round}-${state.events}`, text: command.type === "playCard" ? `${actionLabel} foi jogada pelo motor de regras.` : command.type === "activate" ? `${actionLabel} ativou sua habilidade.` : `${actionLabel}: ${command.type}.`, tone: "effect" });
  if (["playCard"].includes(command.type)) if (!command.skipPriority && state.pendingAction && command.hasPriority) state.pendingResponse = { responder: state.pendingAction.actor, actor: command.owner, action: actionLabel, passes: 0 }; else if (!command.skipPriority && !state.pendingAction) state.pendingResponse = command.hasPriority ? null : { responder: 1 - command.owner, actor: command.owner, action: actionLabel, passes: 0 };
  return { state, trace, steps };
}
