import { hasSubtype } from "./subtypes.mjs";
import { isValidTarget } from "./targeting.mjs";

export class RulesViolation extends Error {
  constructor(code, message = code) { super(message); this.name = "RulesViolation"; this.code = code; }
}

const player = (state, owner) => state.players[owner];
const allUnits = (state) => state.players.flatMap((entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]);
const findUnit = (state, id) => allUnits(state).find((unit) => unit.uid === id || unit.id === id);
const heroOwner = (context, id) => id === "enemy-hero" ? 1 - context.owner : id === "ally-hero" || id === "controller-hero" ? context.owner : /^hero-[01]$/.test(id || "") ? Number(id.slice(-1)) : null;
const markerTotal = (card) => typeof card?.markers === "number" ? card.markers : Object.values(card?.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const setMarker = (card, marker, amount) => { if (typeof card.markers === "number" && marker === "action") card.markers = amount; else card.markers = { ...(typeof card.markers === "object" ? card.markers : {}), [marker]: amount }; };
const removeOneMarker = (card) => {
  if (typeof card?.markers === "number") { if (card.markers < 1) return false; card.markers--; return true; }
  const key = Object.keys(card?.markers || {}).find((name) => Number(card.markers[name] || 0) > 0);
  if (!key) return false;
  card.markers[key]--;
  return true;
};
const queueEvent = (state, event) => {
  if (event?.type === "onCreatureDestroyed" && !event.deathCountRecorded) {
    const entry = state.players[event.owner];
    if (entry) { entry.turnDeaths = (entry.turnDeaths || 0) + 1; if (entry.heroId === "tifon") entry.heroXP = (entry.heroXP || 0) + 1; }
    event = { ...event, deathCountRecorded: true };
  }
  state.rulesEvents ||= []; state.rulesEvents.push(event);
};
export function recordLifeLoss(state, owner, amount, metadata = {}) {
  const lost = Math.max(0, Number(amount || 0));
  if (!lost) return 0;
  const entry = player(state, owner);
  entry.life -= lost;
  entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + lost;
  entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1;
  if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1;
  queueEvent(state, { type: "onLifeLost", owner, sourceOwner: metadata.sourceOwner ?? owner, sourceId: metadata.sourceId, amount: lost, paidAsCost: !!metadata.paidAsCost, damage: !!metadata.damage, lifeLossIndex: entry.lifeLossEvents });
  return lost;
}
const selectedIds = (context) => context.targetIds?.length ? context.targetIds : context.targetId ? [context.targetId] : [];
const effectTargets = (state, effect, context) => {
  const ids = selectedIds(context);
  if (ids.length) return ids.map((id) => findUnit(state, id));
  if (effect.target === "alliedCreatures") return player(state, context.owner).board || [];
  if (effect.target === "enemyCreatures") return player(state, 1 - context.owner).board || [];
  if (effect.target === "allCreatures") return state.players.flatMap((entry) => entry.board || []);
  const source = findUnit(state, context.sourceId);
  const attached = source?.attachedTo ? findUnit(state, source.attachedTo) : null;
  return [effect.target === "attachedCreature" ? attached : attached || source];
};
const queueDecision = (state, effect, context, kind = effect.type) => { if (state.pendingDecision) throw new RulesViolation("decision-pending"); state.pendingDecision = { kind, effect, context, owner: context.decisionOwner ?? context.owner }; };
const keywordsOf = (card) => card?.suffocated ? [] : [...(card?.tags || []), ...(card?.temporaryTags || []), ...(card?.grantedKeywords || []).map((value) => String(value).replace(/^(?:attachment|support|duelist):[^:]+:/, ""))];
const hasKeyword = (card, pattern) => keywordsOf(card).some((tag) => pattern.test(String(tag)));
const normalizedName = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
const hasTrigger = (card, trigger) => (card?.abilities || []).some((ability) => ability.trigger === trigger);
const nextRandomIndex = (state, length) => {
  const seed = Number(state.randomSeed ?? (((state.round || 1) * 2654435761 + (state.events || 0) * 1013904223) >>> 0));
  state.randomSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return length > 0 ? state.randomSeed % length : -1;
};
const targetScopeForEffect = (target) => ({ anyCharacter: "anyCharacter", anyCreature: "anyCreature", allyCreature: "allyCreature", enemyCreature: "enemyCreature", anyPermanent: "anyPermanent", allyPermanent: "allyPermanent", enemyPermanent: "enemyPermanent", creature: "anyCreature" }[target]);
const targetStepsForEffects = (effects = []) => effects.flatMap((nested) => {
  const scope = targetScopeForEffect(nested.target);
  if (!scope || nested.reusePreviousTarget) return [];
  const selections = nested.selections ?? 1, minimum = nested.minimumSelections ?? selections;
  return Array.from({ length: selections }, (_, index) => ({ scope, role: "effect", optional: index >= minimum, requiredSubtype: nested.requiredSubtype, requiresMarker: !!nested.requiresMarker, requiresEffectAppliedThisTurn: !!nested.requiresEffectAppliedThisTurn }));
});
const replayTargetCandidates = (state, owner, step) => {
  const candidates = [];
  state.players.forEach((entry, targetOwner) => {
    for (const card of entry.board || []) {
      const id = card.uid || card.id;
      if (!isValidTarget(step, owner, targetOwner, "creature")) continue;
      if (step.requiredSubtype && !hasSubtype(card, step.requiredSubtype)) continue;
      if (step.requiresMarker && markerTotal(card) < 1) continue;
      if (step.requiresEffectAppliedThisTurn && card.effectAppliedRound !== state.round) continue;
      candidates.push(id);
    }
    if (isValidTarget(step, owner, targetOwner, "hero") && !step.requiredSubtype && !step.requiresMarker && !step.requiresEffectAppliedThisTurn) candidates.push(targetOwner === owner ? "ally-hero" : "enemy-hero");
  });
  return candidates;
};
const canSelectReplayTargets = (state, owner, steps) => {
  const candidates = steps.map((step) => replayTargetCandidates(state, owner, step));
  const choose = (index, used) => index >= steps.length || (steps[index].optional && choose(index + 1, used)) || candidates[index].some((id) => !used.has(id) && choose(index + 1, new Set([...used, id])));
  return choose(0, new Set());
};
const resolveStoredSpellReplay = (state, replay, context) => {
  if (!replay?.effects?.length) return;
  const replayContext = { ...context, sourceId: replay.sourceId, effectSource: replay.card, targetIds: [], targetId: undefined, chosenElement: replay.chosenElement, selectedImageName: replay.selectedImageName, cafeEffect: replay.cafeEffect, elementalTargetId: undefined };
  const targetSteps = targetStepsForEffects(replay.effects);
  if (targetSteps.length) {
    if (!canSelectReplayTargets(state, context.owner, targetSteps)) return;
    if (state.pendingDecision) throw new RulesViolation("decision-pending");
    state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: replay.effects }, context: replayContext, targetSteps, sourceName: `Uruk III · ${replay.card?.name || "último feitiço"}` };
    return;
  }
  for (let index = 0; index < replay.effects.length; index++) {
    applyEffect(state, replay.effects[index], replayContext);
    if (state.pendingDecision) { state.pendingDecision.continuation = [...(state.pendingDecision.continuation || []), ...replay.effects.slice(index + 1).reverse().map((nested) => ({ kind: "effect", effect: nested, context: replayContext }))]; break; }
  }
};
const effectiveUnitName = (state, unit) => {
  let name = unit?.name || "";
  for (const attachment of allUnits(state).filter((card) => card.attachedTo === unit?.uid && !card.suffocated)) {
    const rename = String(attachment.text || "").match(/se equipad[ao][^“\"]*[“\"]([^”\"]+)[”\"][\s\S]*?(?:agora\s+se\s+chama|passa\s+a\s+se\s+chamar)[^“\"]*[“\"]([^”\"]+)[”\"]/i);
    if (rename && normalizedName(name) === normalizedName(rename[1])) name = rename[2];
  }
  return name;
};
const sendDetachedArtifacts = (state, entry, creature, hostDestination) => {
  const owner = state.players.indexOf(entry);
  const attachments = (entry.support || []).filter((item) => item.attachedTo === creature.uid);
  for (const attachment of attachments.filter((item) => item.page === 150)) defaultEffectHandlers.followLinkedDestination(state, {}, { owner, sourceId: attachment.uid || attachment.id, event: { sourceId: creature.uid || creature.id, destination: ["hand", "grave", "obscuro"].includes(hostDestination) ? hostDestination : "obscuro" } });
  entry.support = (entry.support || []).filter((item) => item.attachedTo !== creature.uid);
  for (const attachment of attachments) {
    creature.modifiers = (creature.modifiers || []).filter((modifier) => modifier.sourceId !== (attachment.uid || attachment.id));
    creature.grantedKeywords = (creature.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith("attachment:" + (attachment.uid || attachment.id) + ":"));
    const survivesHost = (attachment.abilities || []).some((ability) => ability.trigger === "onAttachedHostDestroyed");
    if (survivesHost) {
      attachment.attachedTo = undefined;
      attachment.slot = creature.slot;
      entry.support.push(attachment);
      queueEvent(state, { type: "onAttachedHostDestroyed", owner, sourceId: attachment.uid || attachment.id, card: attachment, host: creature });
      continue;
    }
    if (attachment.generatedImage || attachment.imageCard) continue;
    const destination = attachment.page === 154 ? entry.obscuro : entry.grave;
    destination.push({ ...attachment, deathCause: "detached", lastZone: "support" });
  }
};
const cleanCardForHiddenZone = (card, metadata = {}) => {
  const printed = card?._printedState ? structuredClone(card._printedState) : null;
  const copy = { ...card, ...(printed || {}), ...metadata };
  for (const key of [
    "_printedState", "slot", "enteredRound", "exhausted", "summoning", "attackedThisTurn", "attacksThisTurn", "defenseUses",
    "damage", "bonusAtk", "bonusHp", "frozen", "stunned", "suffocated", "suffocatedUntilTurnEnd", "suffocatedBySources",
    "immobilized", "impacting", "activatedThisTurn", "markers", "modifiers", "grantedKeywords", "staticModifiers",
    "temporaryAtk", "temporaryHp", "temporaryTags", "temporarySubtypes", "combatRestrictions", "damageShields",
    "attachedTo", "linkedCreatures", "lastDamagedBy", "damagedOwnersThisTurn", "killedByRepeatSourceId",
    "costModifier", "costModifierExpires", "costModifierExpiresRound", "cardsPlayedAfterSelf", "targetClass", "selected",
    "effectAppliedRound", "effectAppliedSourceId", "staysExhaustedUntilSpellEffect", "skipNextUntap"
  ]) delete copy[key];
  return copy;
};
const cleanCardForHand = (card, metadata = {}) => { const copy = cleanCardForHiddenZone(card, metadata); delete copy.uid; return copy; };
const sendToPrintedGraveDestination = (entry, card, metadata = {}) => {
  if (card.generatedImage || card.imageCard) return;
  const destination = card.graveDestination === "obscuro" || card.page === 154 ? entry.obscuro : entry.grave;
  destination.push(cleanCardForHiddenZone(card, metadata));
};
const removeFromZones = (state, id, destination) => {
  for (const entry of state.players) {
    for (const zone of ["board", "support"]) {
      const index = (entry[zone] || []).findIndex((card) => card.uid === id || card.id === id);
      if (index < 0) continue;
      const card = entry[zone].splice(index, 1)[0];
      if (zone === "board") sendDetachedArtifacts(state, entry, card, destination);
      const owner = state.players.indexOf(entry);
      queueEvent(state, { type: "onPermanentLeaves", owner, sourceId: card.uid || card.id, card, zone, destination });
      return { card, owner, zone };
    }
    const terrain = entry.terrain;
    if (terrain && (terrain.uid === id || terrain.id === id)) {
      entry.terrain = null;
      const owner = state.players.indexOf(entry);
      queueEvent(state, { type: "onPermanentLeaves", owner, sourceId: terrain.uid || terrain.id, card: terrain, zone: "terrain", destination });
      return { card: terrain, owner, zone: "terrain" };
    }
  }
  return null;
};

export const defaultEffectHandlers = Object.freeze({
  draw(state, effect, context) {
    const owners = effect.target === "bothPlayers" ? [0, 1] : effect.target === "chosenOtherPlayer" ? [1 - (context.decisionOwner ?? context.owner)] : [context.owner];
    if (!effect.skipPrestidigitation && owners.length === 1) { const entry = player(state, owners[0]); if ([...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].some((card) => card.page === 271 && !card.suffocated)) { queueDecision(state, { type: "optionalDrawFrom", amount: effect.amount ?? 1, zonePosition: "bottom", fallback: "top" }, { ...context, owner: owners[0] }, "draw-position"); return; } }
    for (const owner of owners) { const entry = player(state, owner), cards = []; let amount = effect.amount ?? 1; while (amount-- > 0) { const card = entry.deck.shift(); if (!card) { entry.deckOut = true; break; } entry.hand.push(card); cards.push(card); } if (cards.length) { entry.cardsDrawnThisTurn = (entry.cardsDrawnThisTurn || 0) + cards.length; queueEvent(state, { type: "onCardsDrawn", owner, amount: cards.length, cards, sourceId: context.sourceId, outsideMaintenance: state.phase !== "manutencao" }); } }
  },
  discard(state, effect, context) {
    const entry = player(state, effect.target === "enemy" ? 1 - context.owner : context.owner); const amount = Math.min(effect.amount ?? 1, entry.hand.length);
    entry.grave.push(...entry.hand.splice(Math.max(0, entry.hand.length - amount), amount));
  },
  mill(state, effect, context) {
    const owner = effect.target === "enemy" ? 1 - context.owner : effect.target === "chooser" ? context.decisionOwner ?? context.owner : context.owner;
    const entry = player(state, owner), milled = entry.deck.splice(0, effect.amount ?? 1); entry.grave.push(...milled); const controller = player(state, context.owner); controller.cardsMilledThisTurn = (controller.cardsMilledThisTurn || 0) + milled.length;
  },
  damage(state, effect, context) {
    const ids = selectedIds(context); if (!ids.length) throw new RulesViolation("target-required");
    for (const targetId of ids) { const owner = heroOwner(context, targetId);
      const printedAmount = Math.max(0, (effect.amount ?? 0) + (context.effectSource?.spellDamageBonus || 0));
      if (owner != null) {
        const entry = player(state, owner); const shield = (entry.damageShields || []).find((item) => item.uses > 0);
        if (shield) { shield.uses--; entry.damageShields = entry.damageShields.filter((item) => item.uses > 0); }
        const amount = shield ? 0 : printedAmount;
        recordLifeLoss(state, owner, amount, { sourceOwner: context.owner, sourceId: context.sourceId, damage: true }); queueEvent(state, { type: "onPlayerDamaged", owner, sourceOwner: context.owner, sourceId: context.sourceId, source: context.effectSource, amount });
        if (amount > 0) queueEvent(state, { type: "onAttachedCreatureDamage", owner: context.owner, sourceId: context.sourceId, source: context.effectSource, targetIds: [targetId], amount }); continue;
      }
      const target = findUnit(state, targetId); if (!target) throw new RulesViolation("target-required");
      const targetOwner = state.players.findIndex((entry) => entry.board.includes(target));
      const remainingHealth = Math.max(0, (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0) - (target.damage || 0));
      const shield = (target.damageShields || []).find((item) => item.uses > 0); const shieldReduction = shield?.reduction ?? (shield ? Number.POSITIVE_INFINITY : 0); if (shield) { shield.uses--; target.damageShields = target.damageShields.filter((item) => item.uses > 0); }
      const robust = hasKeyword(target, /robusto/i) ? 1 : 0;
      const spellDamageImmune = context.effectSource?.type === "Feitiço" && targetOwner >= 0 && (player(state, targetOwner).support || []).some((attachment) => attachment.attachedTo === (target.uid || target.id) && !attachment.suffocated && attachment.page === 192 && target.page === 189);
      const amount = spellDamageImmune ? 0 : Math.max(0, printedAmount + (effect.additionalIfExhausted && target.exhausted ? effect.additionalIfExhausted : 0) - robust - shieldReduction); target.damage = (target.damage || 0) + amount; const source = findUnit(state, context.sourceId); if (amount > 0) target.lastDamagedBy = { sourceId: context.sourceId, sourceOwner: context.owner, combat: false }; if (source && amount > 0) { source.damagedOwnersThisTurn ||= []; if (!source.damagedOwnersThisTurn.includes(targetOwner)) source.damagedOwnersThisTurn.push(targetOwner); } const effectSource = context.effectSource || source; const sourceKeywords = keywordsOf(effectSource); if (amount > 0 && sourceKeywords.some((tag) => /toque da morte/i.test(String(tag)))) target.damage = Math.max(target.damage, (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0)); if (amount > 0 && sourceKeywords.some((tag) => /roubo de vida/i.test(String(tag)))) { const entry = player(state, context.owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + amount); } queueEvent(state, { type: "onDamageTaken", targetId, sourceOwner: context.owner, sourceId: context.sourceId, amount }); if (amount > 0) queueEvent(state, { type: "onAttachedCreatureDamage", owner: context.owner, sourceId: context.sourceId, source: effectSource, targetIds: [targetId], amount });
      if (context.effectSource?.spellDamageTrample && targetOwner >= 0 && amount > remainingHealth) {
        const overflow = amount - remainingHealth; recordLifeLoss(state, targetOwner, overflow, { sourceOwner: context.owner, sourceId: context.sourceId, damage: true });
        queueEvent(state, { type: "onPlayerDamaged", owner: targetOwner, sourceOwner: context.owner, sourceId: context.sourceId, source: context.effectSource, amount: overflow });
      }
    }
  },
  damageAll(state, effect, context) {
    const targets = state.players.flatMap((entry) => entry.board || []).filter((target) => effect.target !== "enemyCreatures" || state.players[1 - context.owner].board.includes(target));
    const amount = (effect.amount ?? 0) + (effect.amountPerEnemyCreature ?? 0) * (state.players[1 - context.owner].board?.length ?? 0);
    for (const target of targets) defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount }, { ...context, targetIds: [target.uid || target.id] });
  },
  damageAllWithLifesteal(state, effect, context) {
    const entry = player(state, context.owner), before = entry.life;
    let healed = 0;
    for (const target of state.players.flatMap((candidate) => candidate.board || [])) {
      const prior = target.damage || 0, remaining = Math.max(0, (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0) - prior);
      defaultEffectHandlers.damage(state, { type: "damage", amount: effect.amount || 0 }, { ...context, targetIds: [target.uid || target.id], effectSource: { ...(context.effectSource || {}), tags: (context.effectSource?.tags || []).filter((tag) => !/roubo de vida/i.test(String(tag))) } });
      healed += Math.min(remaining, Math.max(0, (target.damage || 0) - prior));
    }
    entry.life = Math.min(entry.maxLife ?? 30, before + healed);
  },
  fatalBite(state, effect, context) {
    const id = selectedIds(context)[0], target = findUnit(state, id);
    if (!target) throw new RulesViolation("target-required");
    defaultEffectHandlers.damage(state, { type: "damage", amount: effect.amount || 3 }, { ...context, targetIds: [id] });
    const owner = state.players.findIndex((entry) => (entry.board || []).includes(target));
    const health = (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0);
    if (owner >= 0 && (target.damage || 0) >= health && !hasKeyword(target, /indestrut[ií]vel/i)) {
      const removed = removeFromZones(state, id, "grave");
      if (removed && !removed.card.generatedImage && !removed.card.imageCard) {
        sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { deathCause: "fatal-bite" });
        if (!removed.card.suppressDeathTrigger) queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "fatal-bite" });
        if (removed.card.type === "Criatura") queueEvent(state, { type: "onCreatureDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, destroyedBySourceId: context.sourceId, destroyedByOwner: context.owner });
      }
      const caster = player(state, context.owner), spellIndex = caster.grave.findIndex((card) => card.page === 145 || (card.uid || card.id) === context.sourceId);
      if (spellIndex >= 0) caster.deck.push(cleanCardForHiddenZone(caster.grave.splice(spellIndex, 1)[0]));
    }
  },
  reduceEnemyAttackUntilControllerMaintenance(state, effect, context) {
    const amount = Math.max(0, Number(effect.amount || 0));
    for (const target of player(state, 1 - context.owner).board || []) {
      target.modifiers ||= [];
      target.modifiers.push({ attack: -amount, health: 0, duration: "untilControllerMaintenance", sourceId: context.sourceId, expiresOnMaintenanceOwner: context.owner });
    }
  },
  damageByAdjacentCount(state, effect, context) {
    const targetId = selectedIds(context)[0];
    const target = findUnit(state, targetId);
    if (!target) throw new RulesViolation("target-required");
    const owner = state.players.findIndex((entry) => (entry.board || []).includes(target));
    if (owner < 0) throw new RulesViolation("target-required");
    const board = player(state, owner).board || [];
    const slot = target.slot ?? board.indexOf(target);
    const adjacent = board.filter((unit) => unit !== target && Math.abs((unit.slot ?? board.indexOf(unit)) - slot) === 1).length;
    const amount = Math.max(0, Number(effect.baseAmount || 0) + adjacent * Number(effect.perAdjacent || 0));
    defaultEffectHandlers.damage(state, { type: "damage", amount }, { ...context, targetIds: [targetId] });
  },
  damageAdjacent(state, effect, context) {
    const selectedId = context.targetIds?.[0];
    const selected = findUnit(state, selectedId);
    const snapshots = [...(context.targetSnapshots || []), ...(context.event?.targetSnapshots || [])];
    const snapshot = snapshots.find((entry) => entry?.id === selectedId);
    const owner = selected ? state.players.findIndex((entry) => entry.board.includes(selected)) : snapshot?.owner;
    const board = owner != null && owner >= 0 ? player(state, owner).board : null;
    const slot = selected ? (selected.slot ?? board?.indexOf(selected)) : snapshot?.slot;
    if (!board || slot == null) return;
    for (const target of board.filter((unit) => Math.abs((unit.slot ?? board.indexOf(unit)) - slot) === 1)) defaultEffectHandlers.damage(state, { type: "damage", amount: effect.amount }, { ...context, targetIds: [target.uid || target.id] });
  },
  heal(state, effect, context) {
    if (effect.amountPerTurnedCreature) { const entry = player(state, context.owner); const amount = state.players.flatMap((candidate) => candidate.board || []).filter((unit) => unit.exhausted).length * effect.amountPerTurnedCreature; entry.life = Math.min(entry.maxLife ?? 30, entry.life + amount); return; }
    if (["controller", "controllerHero"].includes(effect.target)) { const entry = player(state, context.owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + (effect.amount ?? 0)); return; }
    const ids = selectedIds(context); if (!ids.length) throw new RulesViolation("target-required"); for (const id of ids) { const owner = heroOwner(context, id); if (owner != null) { const entry = player(state, owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + (effect.amount ?? 0)); continue; } const target = findUnit(state, id); if (!target) throw new RulesViolation("target-required"); target.damage = Math.max(0, (target.damage || 0) - (effect.amount ?? 0)); }
  },
  destroy(state, effect, context) {
    const ids = ["self", "this", "thisArtifact", "thisEnchantment"].includes(effect.target) ? [context.sourceId] : effect.target === "all" ? allUnits(state).map((unit) => unit.uid || unit.id) : context.targetIds || [];
    for (let index = 0; index < ids.length; index++) { const id = ids[index];
      const target = findUnit(state, id);
      if (!target || hasKeyword(target, /indestrut[ií]vel/i)) continue;
      const targetOwner = state.players.findIndex((entry) => entry.board.includes(target)), targetEntry = targetOwner >= 0 ? player(state, targetOwner) : null, replacements = targetEntry?.board.filter((card) => card !== target);
      if (!context.zayanReplacementResolved && targetEntry?.heroId === "zayan" && (targetEntry.level || 1) >= 2 && !(target.text || "").trim() && replacements?.length) { queueDecision(state, { type: "zayanDestructionReplacement", originalId: id, remainingIds: ids.slice(index + 1), choices: replacements.map((card) => card.uid || card.id) }, { ...context, decisionOwner: targetOwner }, "zayan-destruction-replacement"); return; }
      const removed = removeFromZones(state, id, "grave");
      if (!removed) continue;
      if (!removed.card.generatedImage && !removed.card.imageCard) sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { lastZone: removed.zone, deathCause: "destroy" });
      if (!removed.card.suppressDeathTrigger && !removed.card.generatedImage && !removed.card.imageCard) queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "destroy" });
      if (removed.card.type === "Criatura") queueEvent(state, { type: "onCreatureDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, destroyedBySourceId: context.sourceId, destroyedByOwner: context.owner });
    }
  },
  sacrifice(state, effect, context) {
    for (const id of context.sacrificeIds || []) { const removed = removeFromZones(state, id, "grave"); if (removed) sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { lastZone: removed.zone, deathCause: "sacrifice", suppressDeathTrigger: true }); }
  },
  banish(state, effect, context) {
    for (const id of context.targetIds || []) { const removed = removeFromZones(state, id, "obscuro"); if (removed) player(state, removed.owner).obscuro.push(cleanCardForHiddenZone(removed.card)); }
  },
  returnToHand(state, effect, context) {
    for (const id of context.targetIds || []) { const target = findUnit(state, id); if (!target) throw new RulesViolation("target-required"); if (effect.requireExhausted && !target.exhausted) throw new RulesViolation("target-must-be-exhausted"); if (effect.maxCost != null && (target.cost ?? 0) > effect.maxCost) throw new RulesViolation("target-cost-too-high"); const removed = removeFromZones(state, id, "hand"); if (removed && !removed.card.generatedImage && !removed.card.imageCard) player(state, removed.owner).hand.push(cleanCardForHand(removed.card, { revealed: true, revealedTo: [0, 1] })); }
  },
  returnAllCreaturesToOwnersHands(state) {
    const creatureIds = state.players.flatMap((entry) => (entry.board || []).map((card) => card.uid || card.id));
    for (const id of creatureIds) {
      const removed = removeFromZones(state, id, "hand");
      if (removed && !removed.card.generatedImage && !removed.card.imageCard) player(state, removed.owner).hand.push(cleanCardForHand(removed.card, { revealed: true, revealedTo: [0, 1] }));
    }
  },
  returnSelectedGraveCardsToHand(state, effect, context) {
    const entry = player(state, context.owner), choices = entry.grave.filter((card) => card.type === effect.cardType && (!effect.requiredTrigger || hasTrigger(card, effect.requiredTrigger))).map((card) => card.uid || card.id);
    if (!choices.length) throw new RulesViolation("play-condition-not-met");
    queueDecision(state, { ...effect, choices }, context, "grave-to-hand-many");
  },
  returnSelectedGraveCardsAndBanishRest(state, effect, context) {
    const entry = player(state, context.owner), choices = entry.grave.filter((card) => card.type === effect.cardType).map((card) => card.uid || card.id);
    queueDecision(state, { ...effect, choices }, context, "grave-to-hand-and-banish");
  },
  escapeCreatureAndTransferArtifacts(state, effect, context) {
    const id = context.targetIds?.[0], target = findUnit(state, id);
    if (!target || target.type !== "Criatura") throw new RulesViolation("target-required");
    const targetOwner = state.players.findIndex((entry) => (entry.board || []).includes(target));
    if (targetOwner < 0) throw new RulesViolation("target-required");
    const originalEntry = player(state, targetOwner), attachments = (originalEntry.support || []).filter((card) => card.attachedTo === (target.uid || target.id));
    originalEntry.support = (originalEntry.support || []).filter((card) => !attachments.includes(card));
    for (const artifact of attachments) {
      target.modifiers = (target.modifiers || []).filter((modifier) => modifier.sourceId !== (artifact.uid || artifact.id));
      target.grantedKeywords = (target.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith(`attachment:${artifact.uid || artifact.id}:`));
      const artifactOwner = targetOwner, newOwner = 1 - artifactOwner, receiver = player(state, newOwner);
      const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !(receiver.support || []).some((card) => card.slot === slot));
      artifact.attachedTo = undefined;
      artifact.slot = openSlot ?? artifact.slot ?? 0;
      receiver.support ||= [];
      receiver.support.push(artifact);
    }
    const removed = removeFromZones(state, id, "hand");
    if (!removed || removed.card.generatedImage || removed.card.imageCard) return;
    const returned = cleanCardForHand(removed.card, { revealed: true, revealedTo: [0, 1] });
    if (attachments.length) returned.costModifier = -(returned.cost || 0);
    player(state, removed.owner).hand.push(returned);
  },
  returnToHandWithSubtypeBonus(state, effect, context) {
    const id = context.targetIds?.[0], target = findUnit(state, id);
    if (!target) throw new RulesViolation("target-required");
    const qualifies = !effect.subtype || hasSubtype(target, effect.subtype), removed = removeFromZones(state, id, "hand");
    if (!removed || removed.card.generatedImage || removed.card.imageCard) return;
    const returned = cleanCardForHand(removed.card, { revealed: true, revealedTo: [0, 1] });
    if (qualifies && effect.freeThisTurn) { returned.costModifier = -(returned.cost || 0); returned.costModifierExpiresRound = (state.round || 0) + 1; }
    if (qualifies && effect.keywordOnNextPlay && !(returned.tags || []).some((tag) => normalizedName(tag) === normalizedName(effect.keywordOnNextPlay))) returned.tags = [...(returned.tags || []), effect.keywordOnNextPlay];
    player(state, removed.owner).hand.push(returned);
  },
  returnToHandAndTaxNextCreature(state, effect, context) {
    const id = context.targetIds?.[0], target = findUnit(state, id); if (!target) throw new RulesViolation("target-required");
    const removed = removeFromZones(state, id, "hand"); if (!removed) throw new RulesViolation("target-required");
    const enhanced = (player(state, context.owner).nextElementEffects || []).some((promise) => normalizedName(promise.element) === normalizedName("Ar"));
    if (!removed.card.generatedImage && !removed.card.imageCard) {
      const returned = cleanCardForHand(removed.card, { revealed: true, revealedTo: [0, 1] });
      if (enhanced) returned.attackZeroUntilOwnerMaintenance = context.owner;
      player(state, removed.owner).hand.push(returned);
    }
    const taxed = player(state, removed.owner); taxed.nextCreatureTaxes ||= []; taxed.nextCreatureTaxes.push({ amount: effect.tax || 1, createdRound: state.round, sourceId: context.sourceId });
  },
  tap(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.exhausted = true; },
  tapUntilAnotherSpellEffect(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.exhausted = true; const keyword = `Imobilizado · Abstinência de Café · ${context.sourceId}`; target.grantedKeywords ||= []; if (!target.grantedKeywords.includes(keyword)) target.grantedKeywords.push(keyword); target.staysExhaustedUntilSpellEffect = { sourceId: context.sourceId, keyword }; },
  ready(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.exhausted = false; },
  addMarker(state, effect, context) { const heroTarget = effect.target === "hero", targets = heroTarget ? [player(state, context.owner)] : (context.targetIds?.length ? context.targetIds.map((id) => findUnit(state, id)).filter(Boolean) : [findUnit(state, context.sourceId)].filter(Boolean)); if (!targets.length) throw new RulesViolation("target-required"); const key = effect.marker || "action", natureBonus = player(state, context.owner).heroId === "natureza" && (player(state, context.owner).level || 1) >= 2 && key === "action" ? 1 : 0, amount = (effect.amount ?? 1) + natureBonus; for (const target of targets) { setMarker(target, key, (typeof target.markers === "object" ? target.markers[key] || 0 : target.markers || 0) + amount); if (heroTarget && key === "clue") target.heroXP = Number(target.heroXP || 0) + amount; } },
  moveMarkerToSelf(state, effect, context) { const source = findUnit(state, context.sourceId), donor = findUnit(state, context.targetIds?.[0]); if (!source || !donor) return; if (!removeOneMarker(donor)) throw new RulesViolation("not-enough-markers"); setMarker(source, "action", (typeof source.markers === "object" ? source.markers.action || 0 : source.markers || 0) + 1); },
  convertActionMarkersToPlusOneCounters(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); const amount = typeof target.markers === "object" ? Number(target.markers.action || 0) : Number(target.markers || 0); if (amount < 1) return; setMarker(target, "action", 0); setMarker(target, "plusOne", (typeof target.markers === "object" ? Number(target.markers.plusOne || 0) : 0) + amount); target.modifiers ||= []; target.modifiers.push({ attack: amount, health: amount, duration: "permanent", sourceId: context.sourceId, markerBased: "plusOne" }); },
  modifyStats(state, effect, context) { const targets = effectTargets(state, effect, context); if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { if (effect.subtype && !hasSubtype(target, effect.subtype)) throw new RulesViolation("invalid-target-subtype"); target.modifiers ||= []; const sourceId=context.sourceId; if (effect.duration === "attached" && target.modifiers.some((item) => item.sourceId === sourceId && item.attack === (effect.attack || 0) && item.health === (effect.health || 0))) continue; target.modifiers.push({ attack: effect.attack || 0, health: effect.health || 0, duration: effect.duration || "permanent", ...(effect.duration === "untilNextTurn" ? { expiresRound: (state.round || 0) + 2 } : {}), ...(effect.duration === "attached" ? { sourceId } : {}) }); } },
  attachedSpellDamageImmunity(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "attachedSpellDamageImmunity" && item.requiredPage === effect.requiredPage)) source.staticModifiers.push({ type: "attachedSpellDamageImmunity", requiredPage: effect.requiredPage }); },
  attachedConditionalKeyword(state, effect, context) { const source=findUnit(state,context.sourceId); const target=source?.attachedTo?findUnit(state,source.attachedTo):null; if(!target||normalizedName(effectiveUnitName(state,target))!==normalizedName(effect.attachedName))return; target.grantedKeywords ||= []; const value=`attachment:${source.uid || source.id}:${effect.keyword}`; if(!target.grantedKeywords.includes(value))target.grantedKeywords.push(value); },
  optionalSacrificeBuff(state, effect, context) { const source=findUnit(state,context.sourceId); const choices=(player(state,context.owner).board||[]).filter((card)=>card.uid!==source?.uid).map((card)=>card.uid); if(!source||!choices.length)return; queueDecision(state,{...effect,choices},context,"optional-sacrifice-buff"); },
  attachedConditionalStats(state, effect, context) { const source = findUnit(state, context.sourceId); const target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!target) throw new RulesViolation("artifact-target-required"); const excluded = (effect.excludedNames || []).map(normalizedName); if (excluded.includes(normalizedName(effectiveUnitName(state, target)))) return; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", target: "attachedCreature" }, context); },
  validateAttachedSubtype(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!source || !target || (effect.subtype && !hasSubtype(target, effect.subtype))) throw new RulesViolation("invalid-attachment-target"); },
  attachedStats(state, effect, context) { defaultEffectHandlers.modifyStats(state, { type: "modifyStats", target: "attachedCreature", attack: effect.attack || 0, health: effect.health || 0, duration: "attached" }, context); },
  attachedKeyword(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!source || !target) throw new RulesViolation("artifact-target-required"); target.grantedKeywords ||= []; const value = `attachment:${source.uid || source.id}:${effect.keyword}`; if (effect.keyword && !target.grantedKeywords.includes(value)) target.grantedKeywords.push(value); },
  reattachArtifact(state, effect, context) {
    const entry = player(state, context.owner), source = findUnit(state, context.sourceId), chosenId = selectedIds(context)[0];
    if (!source) throw new RulesViolation("artifact-not-found");
    const eligible = (entry.board || []).filter((card) => (!effect.subtype || hasSubtype(card, effect.subtype)) && card.uid !== source.attachedTo);
    if (!chosenId) { if (!eligible.length) return; if (state.pendingDecision) throw new RulesViolation("decision-pending"); state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ ...effect }] }, context: { ...context, targetIds: [] }, targetSteps: [{ scope: "allyCreature", role: "effect", requiredSubtype: effect.subtype, excludeIds: source.attachedTo ? [source.attachedTo] : [] }], sourceName: source.name || "Artefato" }; return; }
    const target = eligible.find((card) => card.uid === chosenId || card.id === chosenId); if (!target) throw new RulesViolation("invalid-target");
    if ((effect.energyCost || 0) > 0) { if (entry.energy < effect.energyCost) throw new RulesViolation("not-enough-energy"); entry.energy -= effect.energyCost; }
    const previous = source.attachedTo ? findUnit(state, source.attachedTo) : null; if (previous) { previous.modifiers = (previous.modifiers || []).filter((modifier) => modifier.sourceId !== (source.uid || source.id)); previous.grantedKeywords = (previous.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith(`attachment:${source.uid || source.id}:`)); }
    source.attachedTo = target.uid; source.slot = target.slot;
    if (effect.attack || effect.health) defaultEffectHandlers.attachedStats(state, effect, context);
    if (effect.keyword) defaultEffectHandlers.attachedKeyword(state, effect, context);
  },
  optionalReequipArtifact(state, effect, context) { const entry = player(state, context.owner), source = findUnit(state, context.sourceId); if (!source || entry.energy < (effect.energyCost || 0)) return; const eligible = (entry.board || []).filter((card) => (!effect.subtype || hasSubtype(card, effect.subtype)) && card.uid !== source.attachedTo); if (!eligible.length) return; queueDecision(state, { type: "optionalReequipArtifact", choices: [[], [{ type: "reattachArtifact", target: "allyCreature", requiredSubtype: effect.subtype, selections: 1, subtype: effect.subtype, energyCost: effect.energyCost, attack: effect.attack, keyword: effect.keyword }]] }, context, "choice"); },
  conditionalAttachedBonus(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!source || !target) return; if (effect.requiredSubtype && !hasSubtype(target, effect.requiredSubtype)) return; if (effect.attack || effect.health) defaultEffectHandlers.modifyStats(state, { type: "modifyStats", target: "attachedCreature", attack: effect.attack || 0, health: effect.health || 0, duration: "attached" }, context); if (effect.keyword) { target.grantedKeywords ||= []; const value = "attachment:" + (source.uid || source.id) + ":" + effect.keyword; if (!target.grantedKeywords.includes(value)) target.grantedKeywords.push(value); } },
  returnNamedFromGraveToHand(state, effect, context) {
    const entry = player(state, context.owner);
    const index = entry.grave.findIndex((card) => normalizedName(card.name) === normalizedName(effect.name));
    if (index < 0) return;
    entry.hand.push(entry.grave.splice(index, 1)[0]);
  },
  conditionalDrawByControlledSubtype(state, effect, context) { const entry = player(state, context.owner); const controlled = [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]; const amount = controlled.some((card) => !effect.subtype || hasSubtype(card, effect.subtype)) ? (effect.ifTrue ?? 0) : (effect.ifFalse ?? 0); if (amount > 0) defaultEffectHandlers.draw(state, { type: "draw", amount }, context); },
  gainEnergy(state, effect, context) { const entry = player(state, context.owner); const key = effect.destination === "reserve" ? "reserve" : "energy"; const cap = key === "reserve" ? 3 : entry.maxEnergy; entry[key] = Math.min(cap, entry[key] + (effect.amount ?? 0)); },
  fillReserve(state, effect, context) { player(state, context.owner).reserve = 3; },
  gainMaxEnergy(state, effect, context) { const entry = player(state, context.owner); entry.maxEnergy = Math.min(10, (entry.maxEnergy || 0) + (effect.amount || 1)); },
  grantTeamReserveTapAbility(state, effect, context) { for (const target of player(state, context.owner).board || []) { target.abilities ||= []; if (!target.abilities.some((ability) => ability.id === `stabilize:${context.sourceId}`)) target.abilities.push({ id: `stabilize:${context.sourceId}`, trigger: "activated", costs: [{ type: "tap", amount: 1 }], effects: [{ type: "gainEnergy", amount: 1, destination: "reserve" }], temporary: true }); } },
  freezeEnemyBoard(state, effect, context) { for (const target of player(state, 1 - context.owner).board || []) { const alreadyFrozen = target.frozen || hasKeyword(target, /congelado/i); if (alreadyFrozen && effect.damageAlreadyFrozen) defaultEffectHandlers.damage(state, { type: "damage", amount: effect.damageAlreadyFrozen }, { ...context, targetIds: [target.uid] }); target.frozen = true; target.tags ||= []; if (!target.tags.some((tag) => /congelado/i.test(String(tag)))) target.tags.push("Congelado"); } },
  applyGoblinThresholds(state, effect, context) { const entry = player(state, context.owner); const count = entry.turnCardsPlayed || 0; for (const target of entry.board.filter((card) => hasSubtype(card, "Goblin"))) { target.temporaryTags ||= []; target.temporaryTags = target.temporaryTags.filter((tag) => !String(tag).startsWith("parque:")); if (count >= 4) target.temporaryTags.push("parque:Atropelar"); if (count >= 5) { target.temporaryTags.push("parque:Investida"); target.summoning = false; } if (count >= 6) target.temporaryTags.push("parque:Último Suspiro"); if (count >= 7) target.temporaryTags.push("parque:Toque da Morte"); } },
  grantNextCardDiscount(state, effect, context) { const entry = player(state, context.owner); entry.nextCardDiscounts ||= []; entry.nextCardDiscounts.push({ amount: effect.amount || 0, type: effect.typeOnly, typeNot: effect.typeNot, expires: effect.duration || "turn", expiresRound: (state.round || 0) + 1 }); },
  returnAllyToHandWithComboDiscount(state, effect, context) {
    const entry = player(state, context.owner);
    const id = context.targetIds?.[0];
    const target = entry.board.find((card) => (card.uid || card.id) === id);
    if (!target) throw new RulesViolation("target-required");
    const removed = removeFromZones(state, id);
    if (!removed || removed.owner !== context.owner) throw new RulesViolation("invalid-target");
    const card = cleanCardForHand(removed.card);
    const combo = Math.max(0, Number(entry.turnCardsPlayed || 0) - 1) >= 1;
    if (combo) {
      card.costModifier = (card.costModifier || 0) - (effect.amount || 0);
      card.costModifierExpires = effect.duration || "turn";
      card.costModifierExpiresRound = (state.round || 0) + 1;
    }
    entry.hand.push(card);
  },
  destroyCreatureUpToTurnCardsPlayed(state, effect, context) {
    const limit = Math.max(0, Number(player(state, context.owner).turnCardsPlayed || 0));
    const eligible = state.players.flatMap((entry) => entry.board || []).filter((card) => Number(card.cost || 0) <= limit);
    const chosenId = context.targetIds?.[0];
    if (!chosenId) {
      if (!eligible.length) return;
      if (state.pendingDecision) throw new RulesViolation("decision-pending");
      state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ ...effect }] }, context: { ...context, targetIds: [] }, targetSteps: [{ scope: "anyCreature", role: "effect", maxCost: limit }], sourceName: context.effectSource?.name || "Zoiudo" };
      return;
    }
    const target = eligible.find((card) => (card.uid || card.id) === chosenId);
    if (!target) throw new RulesViolation("target-cost-too-high");
    defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, { ...context, targetIds: [chosenId] });
  },
  discountReturnedCard(state, effect, context) { const id = context.targetIds?.[0]; const card = player(state, context.owner).hand.find((candidate) => candidate.uid === id || candidate.id === id); if (card) { card.costModifier = (card.costModifier || 0) - (effect.amount || 0); card.costModifierExpires = effect.duration || "turn"; card.costModifierExpiresRound = (state.round || 0) + 1; } },
  destroyByCardsPlayedThisTurn(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); const limit = Math.max(0, player(state, context.owner).turnCardsPlayed || 0); if ((target.cost || 0) > limit) throw new RulesViolation("target-cost-too-high"); defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); },
  damageAndMarkRepeat(state, effect, context) {
    const target = findUnit(state, context.targetIds?.[0]);
    if (!target) throw new RulesViolation("target-required");
    defaultEffectHandlers.damage(state, { ...effect, type: "damage" }, context);
    const owner = state.players.findIndex((entry) => (entry.board || []).includes(target));
    const healthBonus = (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0);
    if (owner >= 0 && (target.damage || 0) >= (target.hp || 1) + healthBonus) target.killedByRepeatSourceId = context.sourceId;
  },
  disableReserveStorage(state, effect, context) { player(state, context.owner).noReserveStorageThisTurn = true; },
  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },
  damageFromSpellsThisTurn(state, effect, context) { const count = player(state, context.owner).turnSpellsPlayed || 0; defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: count * (effect.amountPerSpell || 0) }, context); },
  modifyStatsFromTurnCardsPlayed(state, effect, context) { const count = player(state, context.owner).turnCardsPlayed || 0; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", attack: count * (effect.attackPerCard || 0), health: count * (effect.healthPerCard || 0) }, context); },
  damageFromSacrificedAttack(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: context.paidSacrificeAttack || 0 }, context); },
  configureResurrected(state, effect, context) { const target = findUnit(state, context.resurrectedId); if (!target) return; const cardsPlayedBeforeThis = Math.max(0, (player(state, context.owner).turnCardsPlayed || 0) - 1); if (effect.grantKeywordIfCombo && cardsPlayedBeforeThis > 0) { target.temporaryTags ||= []; if (!target.temporaryTags.includes(effect.grantKeywordIfCombo)) target.temporaryTags.push(effect.grantKeywordIfCombo); target.summoning = false; } if (effect.destroyAtTurnEnd) { state.delayedEffects ||= []; state.delayedEffects.push({ timing: "turnEnd", owner: context.owner, effect: { type: "destroy", target: "selected" }, context: { ...context, targetIds: [target.uid || target.id] } }); } },
  protectAlliedDragonsOncePerTurn(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "protectAlliedDragonsOncePerTurn")) source.staticModifiers.push({ type: "protectAlliedDragonsOncePerTurn" }); } },
  replaceImage(state, effect, context) {
    const entry = player(state, context.owner);
    const candidates = (entry.board || []).filter((card) =>
      (card.generatedImage || card.imageCard) && normalizedName(card.name) === normalizedName(effect.oldName)
    );
    const chosenId = selectedIds(context)[0] || (candidates.length === 1 ? (candidates[0].uid || candidates[0].id) : null);

    // The printed condition is optional: without the smaller Image, the spell
    // still resolves at its normal cost and simply creates the upgraded Image.
    if (!candidates.length) {
      defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.newName, destination: "field" }, context);
      return;
    }

    // When one or more eligible Images exist, the controller must decide which
    // physical Image is replaced. This is authoritative and therefore mirrors
    // correctly in multiplayer instead of letting the client silently pick one.
    if (!chosenId) {
      if (state.pendingDecision) throw new RulesViolation("decision-pending");
      state.pendingDecision = {
        kind: "targets",
        owner: context.owner,
        effect: { replayEffects: [{ ...effect }] },
        context: { ...context, targetIds: [] },
        targetSteps: [{ scope: "allyCreature", role: "effect", requiredName: effect.oldName, imageOnly: true }],
        sourceName: context.effectSource?.name || `Substituir ${effect.oldName}`,
      };
      return;
    }

    const old = candidates.find((card) => (card.uid || card.id) === chosenId);
    if (!old) throw new RulesViolation("invalid-target", `Escolha uma Imagem de ${effect.oldName} que você controla.`);
    const slot = old.slot;
    removeFromZones(state, old.uid || old.id);
    defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.newName, destination: "field" }, { ...context, slot, targetIds: [] });
  },
  transformFromHandOrDeck(state, effect, context) { const entry = player(state, context.owner); let card = entry.hand.find((candidate) => normalizedName(candidate.name) === normalizedName(effect.name)); if (card) entry.hand.splice(entry.hand.indexOf(card), 1); else { const index = entry.deck.findIndex((candidate) => normalizedName(candidate.name) === normalizedName(effect.name)); if (index >= 0) card = entry.deck.splice(index, 1)[0]; } if (!card) throw new RulesViolation("card-choice-required"); const source = findUnit(state, context.sourceId), slot = source?.slot; if (source && effect.replaceSelf) removeFromZones(state, source.uid || source.id); const unit = { ...structuredClone(card), uid: `${card.id}-${state.round}-ascended`, slot: slot ?? 0, enteredRound: state.round, attackedThisTurn: false, summoning: true, exhausted: false, damage: 0, modifiers: [], abilities: card.abilities || [] }; entry.board.push(unit); if (effect.shuffle && entry.deck.length > 1) entry.deck.push(entry.deck.shift()); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: unit.uid, cardId: unit.uid, card: unit }); },
  snapshotStatsFromHand(state, effect, context) { const source = findUnit(state, context.sourceId); const count = player(state, context.owner).hand.length; if (source) defaultEffectHandlers.modifyStats(state, { type: "modifyStats", attack: count * (effect.attackPerCard || 0), health: count * (effect.healthPerCard || 0), duration: "permanent" }, { ...context, targetIds: [source.uid || source.id] }); },
  snapshotHealthFromFactionConstants(state, effect, context) { const entry = player(state, context.owner), source = findUnit(state, context.sourceId); const count = allUnits(state).filter((card) => allUnits(state).includes(card) && (card.tags || []).some((tag) => normalizedName(tag) === normalizedName(effect.faction))).length; if (source) { source.hp = Math.max(1, count); source.damage = 0; } },
  optionalDrawWithCreatureCostDamage(state, effect, context) { queueDecision(state, { ...effect, choices: [[], [{ type: "drawAndDamageIfCreature" }]] }, context, "choice"); },
  drawAndDamageIfCreature(state, effect, context) { const entry = player(state, context.owner), card = entry.deck.shift(); if (!card) { entry.deckOut = true; return; } entry.hand.push(card); if (card.type === "Criatura") defaultEffectHandlers.loseLife(state, { type: "loseLife", amount: card.cost || 0, target: "controllerHero" }, context); },
  counterPendingAction(state) { if (!state.pendingAction) throw new RulesViolation("nothing-to-counter"); state.pendingAction = null; state.pendingResponse = null; },
  linkCreatures(state, effect, context) { const artifact = findUnit(state, context.sourceId), first = artifact?.attachedTo && findUnit(state, artifact.attachedTo), second = findUnit(state, context.targetIds?.[0]); if (!artifact || !first || !second || first === second) throw new RulesViolation("invalid-target"); artifact.linkedCreatures = [first.uid || first.id, second.uid || second.id]; },
  followLinkedDestination(state, effect, context) { const artifact = findUnit(state, context.sourceId), ids = artifact?.linkedCreatures || []; if (!ids.includes(context.event?.sourceId)) return; const otherId = ids.find((id) => id !== context.event.sourceId), destination = ["hand", "grave", "obscuro"].includes(context.event?.destination) ? context.event.destination : "obscuro", removed = removeFromZones(state, otherId, destination); if (!removed || removed.card.generatedImage || removed.card.imageCard) return; const entry = player(state, removed.owner); if (destination === "hand") entry.hand.push(cleanCardForHand(removed.card, { revealed: true, revealedTo: [0, 1] })); else if (destination === "grave") sendToPrintedGraveDestination(entry, removed.card, { deathCause: "linked" }); else entry.obscuro.push(cleanCardForHiddenZone(removed.card)); },
  gainTemporaryEnergy(state, effect, context) { player(state, context.owner).energy += effect.amount || 0; },
  skipNextMaxEnergyIncrease(state, effect, context) { player(state, context.owner).skipNextMaxEnergyIncrease = true; },
  destroyExhaustedAndHealCost(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target || (effect.requireExhausted && !target.exhausted)) throw new RulesViolation("target-must-be-exhausted"); const amount = target.cost || 0; defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); defaultEffectHandlers.heal(state, { type: "heal", amount, target: "controllerHero" }, context); },
  suffocateUntilTurnEndAndDrawOwner(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.suffocated = true; target.suffocatedUntilTurnEnd = true; const owner = state.players.findIndex((entry) => [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].includes(target)); defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, { ...context, owner }); },
  suffocateWhileSourceInField(state, effect, context) { const source = findUnit(state, context.sourceId), target = findUnit(state, context.targetIds?.[0]); if (!source || !target || source === target) throw new RulesViolation("target-required"); target.suffocatedBySources = [...new Set([...(target.suffocatedBySources || []), source.uid || source.id])]; target.suffocated = true; },
  releaseSuffocatedBySource(state, effect, context) { const sourceId = context.event?.sourceId || context.sourceId; for (const target of allUnits(state)) { target.suffocatedBySources = (target.suffocatedBySources || []).filter((id) => id !== sourceId); if (!target.suffocatedBySources.length && !target.suffocatedUntilTurnEnd) target.suffocated = false; } },
  payLifeOrDestroySelf(state, effect, context) { const entry = player(state, context.owner), source = findUnit(state, context.sourceId), amount = effect.amount || 0, minimum = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0; if (source && entry.life - amount >= minimum) defaultEffectHandlers.loseLife(state, { type: "loseLife", amount, target: "controllerHero" }, context); else if (source) defaultEffectHandlers.destroy(state, { type: "destroy", target: "self" }, context); },
  resolveCrimsonCastle(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; if (source.crimsonLifeLossRound !== state.round) { source.crimsonLifeLossRound = state.round; source.crimsonLifeLossCount = 0; } const count = ++source.crimsonLifeLossCount; if (count === 1) { defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, context); return; } if (count === 2) { state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ type: "damage", target: "anyCharacter", amount: 2 }] }, context, targetSteps: [{ scope: "anyCharacter", role: "effect" }], sourceName: "Castelo Carmesim" }; return; } if (count === 3) { defaultEffectHandlers.heal(state, { type: "heal", amount: 2, target: "controllerHero" }, context); return; } if (count >= 4) defaultEffectHandlers.heal(state, { type: "heal", amount: 1, target: "controllerHero" }, context); },
  destroyIfDamagedControllerThisTurn(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target || !(target.damagedOwnersThisTurn || []).includes(context.owner)) return; defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); },
  destroyAtTurnEndUnlessCombat(state, effect, context) { const targetId = context.targetIds?.[0]; state.delayedEffects ||= []; state.delayedEffects.push({ timing: "turnEnd", owner: state.active, effect: { type: "destroyUnlessCombat", targetId }, context: { ...context, targetIds: [targetId] } }); },
  destroyUnlessCombat(state, effect, context) { const target = findUnit(state, effect.targetId); if (target && !target.participatedInCombatThisTurn) defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, { ...context, targetIds: [effect.targetId] }); },
  spellTargetSurcharge(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.spellTargetSurcharge = effect.amount || 1; },
  banishUntilSourceLeaves(state, effect, context) { const source = findUnit(state, context.sourceId), targetId = context.targetIds?.[0], removed = removeFromZones(state, targetId); if (!source || !removed) throw new RulesViolation("target-required"); source.temporarilyBanished ||= []; source.temporarilyBanished.push({ card: removed.card, owner: removed.owner, zone: removed.zone }); },
  returnBanishedBySource(state, effect, context) { const source = context.event?.card?.uid === context.sourceId ? context.event.card : findUnit(state, context.sourceId); for (const record of source?.temporarilyBanished || []) { const entry = player(state, record.owner); if (record.zone === "board" && entry.board.length < 5) entry.board.push({ ...record.card, slot: Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)) }); else entry.hand.push(cleanCardForHand(record.card, { revealed: true, revealedTo: [0, 1] })); } if (source) source.temporarilyBanished = []; },
  loseLifeFromCardsDrawn(state, effect, context) { defaultEffectHandlers.loseLife(state, { type: "loseLife", amount: context.event?.amount || 0, target: "controllerHero" }, { ...context, owner: context.event?.owner ?? context.owner }); },
  revealDrawnCards(state, effect, context) { const owner = context.event?.owner ?? context.owner; for (const card of context.event?.cards || []) { card.revealed = true; card.revealedTo = [0, 1]; } player(state, owner).revealedHandIds = [...new Set([...(player(state, owner).revealedHandIds || []), ...(context.event?.cards || []).map((card) => card.uid || card.id)])]; },
  commanderRule(state, effect, context) { const entry = player(state, context.owner), source = entry.board.find((unit) => unit.slot === effect.centerSlot); entry.commanderId = source?.uid || null; if (!source) return; source.modifiers ||= []; source.modifiers = source.modifiers.filter((item) => item.sourceId !== `hero:${context.owner}:commander`); source.modifiers.push({ attack: effect.attack || 0, health: 0, duration: "commander", sourceId: `hero:${context.owner}:commander` }); if (effect.keyword) { source.grantedKeywords ||= []; if (!source.grantedKeywords.includes(effect.keyword)) source.grantedKeywords.push(effect.keyword); } },
  commanderCombatReplacement(state, effect, context) { player(state, context.owner).commanderCombatReplacement = true; },
  enableChampionCombat(state, effect, context) { state.globalRules ||= []; if (!state.globalRules.some((rule) => rule.type === "enableChampionCombat" && rule.owner === context.owner)) state.globalRules.push({ type: "enableChampionCombat", owner: context.owner }); },
  faithfulSquireRedirect(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.canRedirectAllyDamage = true; },
  optionalSacrificeThenFillRecruits(state, effect, context) { const entry = player(state, context.owner); queueDecision(state, { ...effect, choices: entry.board.map((card) => card.uid), maximum: entry.board.length }, context, "sacrifice-and-fill"); },
  buffFromSpellsThisTurn(state, effect, context) { const count = player(state, context.owner).turnSpellsPlayed || 0; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", attack: count * (effect.attackPerSpell || 0), health: count * (effect.healthPerSpell || 0) }, context); },
  purgeSpellsAndCreateImage(state, effect, context) { const entry = player(state, context.owner); entry.oncePerGame ||= {}; if (effect.oncePerGame && entry.oncePerGame[context.sourceId]) throw new RulesViolation("once-per-game"); entry.oncePerGame[context.sourceId] = true; for (const zone of ["hand", "deck"]) { const removed = entry[zone].filter((card) => card.type === "Feitiço"); entry[zone] = entry[zone].filter((card) => card.type !== "Feitiço"); entry.grave.push(...removed); } if (entry.deck.length > 1) entry.deck.push(entry.deck.shift()); defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.name, destination: "field" }, context); },
  counterEvent(state, effect, context) { if (context.event) context.event.countered = true; },
  dynamicCatStats(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.dynamicStats = { subtypeCountAcrossFields: "Gato" }; },
  linkDestroyCreatures(state, effect, context) { const source = findUnit(state, context.sourceId), target = findUnit(state, context.targetIds?.[0]); if (!source || !target || source === target) throw new RulesViolation("invalid-target"); source.linkedDestroyId = target.uid || target.id; target.linkedDestroyId = source.uid || source.id; },
  destroyLinkedCreature(state, effect, context) { const source = context.event?.card?.uid === context.sourceId ? context.event.card : findUnit(state, context.sourceId); if (!source?.linkedDestroyId) return; const leavingId = context.event?.sourceId, sourceId = source.uid || source.id; const otherId = leavingId === sourceId ? source.linkedDestroyId : leavingId === source.linkedDestroyId ? sourceId : null; if (otherId) defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, { ...context, targetIds: [otherId] }); },
  grantDamageReductionShield(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damageShields ||= []; target.damageShields.push({ uses: effect.uses || 1, reduction: effect.reduction || 1, sourceId: context.sourceId, expires: effect.duration }); },
  grantCombatImmobilize(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.abilities ||= []; target.abilities.push({ id: `combat-immobilize:${context.sourceId}`, trigger: "onCombatDamage", temporaryUntilNextTurn: true, effects: [{ type: "immobilizeCombatOpponent" }] }); },
  immobilize(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.immobilized = true; },
  immobilizeCombatOpponent(state, effect, context) { const target = findUnit(state, context.event?.targetIds?.[0]); if (target) target.immobilized = true; },
  repeatChoiceForCoffeeCount(state, effect, context) { const count = effect.remaining ?? player(state, context.owner).coffeeSpellsThisTurn ?? player(state, context.owner).coffeeSpells ?? 0; if (count > 0) queueDecision(state, { ...effect, remaining: count }, context, "repeat-choice"); },
  chooseDeckAndInvestigate(state, effect, context) { queueDecision(state, { ...effect, choices: [[{ type: "investigate", amount: effect.amount, target: "controllerDeck" }], [{ type: "investigate", amount: effect.amount, target: "opponentDeck" }]] }, context, "choice"); },
  optionalClueChoice(state, effect, context) { const hero = player(state, context.owner), available = Math.max(typeof hero.markers === "object" ? hero.markers.clue || 0 : Number(hero.markers || 0), Number(hero.heroXP || 0)); if (available < effect.cost) return; queueDecision(state, { ...effect, choices: [[], [{ type: "spendCluesAndDraw", amount: effect.cost }], [{ type: "spendCluesAndMill", amount: effect.cost, mill: 2 }]] }, context, "choice"); },
  spendCluesAndDraw(state, effect, context) { const entry = player(state, context.owner); entry.markers.clue -= effect.amount; entry.heroXP = Math.max(0, Number(entry.heroXP || 0) - effect.amount); defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, context); },
  spendCluesAndMill(state, effect, context) { const entry = player(state, context.owner); entry.markers.clue -= effect.amount; entry.heroXP = Math.max(0, Number(entry.heroXP || 0) - effect.amount); defaultEffectHandlers.mill(state, { type: "mill", amount: effect.mill, target: "enemy" }, context); },
  millFromDirectDamage(state, effect, context) { if (!(context.event?.targetIds || []).some((id) => /hero/.test(id))) return; defaultEffectHandlers.mill(state, { type: "mill", amount: context.event.amount || 0, target: "enemy" }, context); },
  vanillaDestructionReplacement(state, effect, context) { player(state, context.owner).vanillaDestructionReplacement = true; },
  cannotAttack(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.cannotAttack = true; },
  becomeVanilla(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; source.abilities = []; source.tags = []; source.grantedKeywords = []; source.temporaryTags = []; source.temporarySubtypes = []; source.staticModifiers = []; source.modifiers = (source.modifiers || []).filter((modifier) => (modifier.attack || 0) <= 0 && (modifier.health || 0) <= 0); delete source.dynamicStats; delete source.attackPermission; source.text = ""; source.cannotAttack = false; },
  extraActionMarker(state, effect, context) { player(state, context.owner).extraActionMarker = true; },
  lifeCostsCannotKill() {},
  returnFirstDeadCreatureToHand() {},
  doubleFirstFirstAct() {},
  conditionalAttachedKeyword(state, effect, context) { const entry = player(state, context.owner), source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; const hasOther = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].some((card) => card !== source && (card.tags || []).some((tag) => normalizedName(tag) === normalizedName(effect.requiresOtherFactionConstant))); if (target && hasOther) defaultEffectHandlers.keyword(state, { type: "keyword", keyword: effect.keyword }, context); },
  grantCharacterDamageShield(state, effect, context) { const id = context.targetIds?.[0], owner = heroOwner(context, id); if (owner != null) { const entry = player(state, owner); entry.damageShields ||= []; entry.damageShields.push({ uses: effect.uses || 1, sourceId: context.sourceId, expires: effect.duration }); } else defaultEffectHandlers.grantDamageShield(state, effect, context); },
  grantHeroDamageShield(state, effect, context) { const entry = player(state, context.owner); entry.damageShields ||= []; entry.damageShields.push({ uses: effect.uses || 1, sourceId: context.sourceId, expires: effect.duration }); },
  grantNextElementEffect(state, effect, context) { const entry = player(state, context.owner); entry.nextElementEffects ||= []; entry.nextElementEffects.push({ element: effect.element, keyword: effect.keyword, expires: effect.duration }); },
  consumeAllEnergyForDamage(state, effect, context) { const entry = player(state, context.owner), amount = (entry.energy || 0) + (entry.reserve || 0); entry.energy = 0; entry.reserve = 0; defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount }, context); },
  destroyIfEffectAppliedThisTurn(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target || target.effectAppliedRound !== state.round) throw new RulesViolation("invalid-target"); defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); },
  banishOwnCreatureWithMostPlusOneCounters(state, effect, context) {
    const entry = player(state, context.owner), creatures = entry.board || [];
    if (!creatures.length) return;
    const count = (card) => typeof card.markers === "object" ? Number(card.markers.plusOne || 0) : 0;
    const maximum = Math.max(...creatures.map(count)), tied = creatures.filter((card) => count(card) === maximum);
    if (tied.length === 1) { defaultEffectHandlers.banish(state, { type: "banish" }, { ...context, targetIds: [tied[0].uid || tied[0].id] }); return; }
    if (state.pendingDecision) throw new RulesViolation("decision-pending");
    state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ type: "banish" }] }, context: { ...context, targetIds: [] }, targetSteps: [{ scope: "allyCreature", role: "effect", allowedIds: tied.map((card) => card.uid || card.id) }], sourceName: "CRIATURA 7" };
  },
  randomDiscardAndResolveByType(state, effect, context) {
    const entry = player(state, context.owner);
    if (!entry.hand.length) return;
    const index = nextRandomIndex(state, entry.hand.length), discarded = entry.hand.splice(index, 1)[0];
    entry.grave.push(cleanCardForHiddenZone(discarded, { discardedBy: context.sourceId }));
    if (discarded.type === "Criatura") {
      if (state.pendingDecision) throw new RulesViolation("decision-pending");
      state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ type: "damage", amount: discarded.cost || 0, target: "anyCharacter", selections: 1 }] }, context: { ...context, effectSource: discarded, targetIds: [] }, targetSteps: [{ scope: "anyCharacter", role: "effect" }], sourceName: "Descarte Estratégico" };
      return;
    }
    if (discarded.type === "Feitiço") {
      const accelerated = (discarded.tags || []).some((tag) => /acelerado/i.test(String(tag))) || /^\s*acelerado\b/i.test(String(discarded.text || ""));
      if (!accelerated) {
        const opponent = 1 - context.owner, opponentEntry = player(state, opponent);
        if (opponentEntry.hand.length) queueDecision(state, { amount: 1 }, { ...context, decisionOwner: opponent }, "hand-discard-one");
        return;
      }
      const replayEffects = (discarded.abilities || []).filter((ability) => ability.trigger === "onPlay").flatMap((ability) => ability.effects || []), targetSteps = targetStepsForEffects(replayEffects);
      entry.spellsPlayed = (entry.spellsPlayed || 0) + 1;
      if (state.active === context.owner) entry.turnSpellsPlayed = (entry.turnSpellsPlayed || 0) + 1;
      queueEvent(state, { type: "onSpellCast", owner: context.owner, sourceId: discarded.id, card: discarded });
      queueEvent(state, { type: "onCardPlayed", owner: context.owner, sourceId: discarded.id, card: discarded });
      if (targetSteps.length) {
        if (state.pendingDecision) throw new RulesViolation("decision-pending");
        state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects }, context: { ...context, sourceId: discarded.id, effectSource: discarded, targetIds: [] }, targetSteps, sourceName: discarded.name || "Feitiço acelerado descartado" };
        return;
      }
      const replayContext = { ...context, sourceId: discarded.id, effectSource: discarded, targetIds: [] };
      for (let replayIndex = 0; replayIndex < replayEffects.length; replayIndex++) {
        applyEffect(state, replayEffects[replayIndex], replayContext);
        if (state.pendingDecision) { state.pendingDecision.continuation = [...(state.pendingDecision.continuation || []), ...replayEffects.slice(replayIndex + 1).reverse().map((nested) => ({ kind: "effect", effect: nested, context: replayContext }))]; break; }
      }
      return;
    }
    if (discarded.type === "Terreno") {
      const opponent = 1 - context.owner;
      if (state.active === opponent) state.phase = "fim";
      else player(state, opponent).skipNextTurn = true;
    }
  },
  createUniqueImage(state, effect, context) { if (allUnits(state).some((card) => normalizedName(card.name) === normalizedName(effect.name))) throw new RulesViolation("unique-image-already-present"); defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.name, destination: "field" }, context); },
  createSelectedMasteryImage(state, effect, context) { const allowed = ["Maestria Elemental: Piromancia", "Maestria Elemental: Hidromancia", "Maestria Elemental: Geomancia", "Maestria Elemental: Aeromancia"]; const name = context.selectedImageName; if (!allowed.includes(name) || !(player(state, context.owner).extraDeck || []).some((card) => normalizedName(card.name) === normalizedName(name))) throw new RulesViolation("mastery-image-choice-required"); defaultEffectHandlers.createUniqueImage(state, { type: "createUniqueImage", name }, context); },
  geomancyChoice(state, effect, context) { if (!state.players.some((entry) => entry.board.length)) return; queueDecision(state, { ...effect, optional: true, choices: [[{ type: "reduceStatFloor", stat: "attack", amount: effect.amount, minimum: effect.minimum }], [{ type: "reduceStatFloor", stat: "health", amount: effect.amount, minimum: effect.minimum }]] }, context, "choice-target"); },
  reduceStatFloor(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); const base = effect.stat === "attack" ? target.atk || 0 : target.hp || 1, existing = (target.modifiers || []).reduce((sum, item) => sum + (effect.stat === "attack" ? item.attack || 0 : item.health || 0), 0), reduction = Math.min(effect.amount || 0, Math.max(0, base + existing - (effect.minimum || 1))); defaultEffectHandlers.modifyStats(state, { type: "modifyStats", attack: effect.stat === "attack" ? -reduction : 0, health: effect.stat === "health" ? -reduction : 0, duration: "permanent" }, context); },
  empowerSpellDamage(state, effect, context) { if (!context.event?.card) return; context.event.card.spellDamageBonus = (context.event.card.spellDamageBonus || 0) + (effect.additionalDamage || 0); context.event.card.spellDamageTrample = !!effect.trample; },
  grantRobustIfSpellPlayedThisTurn(state, effect, context) { if (!(player(state, context.owner).turnSpellsPlayed || 0)) return; const source = findUnit(state, context.sourceId); if (source) { source.grantedKeywords ||= []; if (!source.grantedKeywords.includes("Robusto")) source.grantedKeywords.push("Robusto"); } },
  resolveLastSpellElement(state, effect, context) { const entry = player(state, context.owner), element = entry.lastSpellElement; if (element === "Terra") defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, context); else if (element === "Água") defaultEffectHandlers.heal(state, { type: "heal", amount: 1, target: "controllerHero" }, context); else if (element === "Ar") defaultEffectHandlers.gainEnergy(state, { type: "gainEnergy", amount: 1, destination: "main" }, context); else if (element === "Fogo") { if (state.pendingDecision) throw new RulesViolation("decision-pending"); state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ type: "damage", target: "anyCharacter", selections: 1, amount: 1 }] }, context, targetSteps: [{ scope: "anyCharacter", role: "effect" }], sourceName: "Uruk I · Fogo" }; } },
  repeatLastSpell(state, effect, context) {
    const entry = player(state, context.owner), replay = entry.lastSpellReplay;
    delete entry.lastSpellReplay;
    if (!replay?.effects?.length) return;
    if (state.pendingDecision) { state.pendingDecision.continuation = [...(state.pendingDecision.continuation || []), { kind: "effect", effect: { type: "repeatStoredSpell", replay }, context }]; return; }
    resolveStoredSpellReplay(state, replay, context);
  },
  repeatStoredSpell(state, effect, context) { resolveStoredSpellReplay(state, effect.replay, context); },
  damageEnemyHero(state, effect, context) { defaultEffectHandlers.damage(state, { type: "damage", amount: effect.amount || 0 }, { ...context, targetIds: ["enemy-hero"] }); },
  doubleLastBreath() {},
  damageHeroFromTurnDeaths(state, effect, context) { const amount = effect.global ? state.players.reduce((sum, entry) => sum + Number(entry.turnDeaths || 0), 0) : (player(state, context.owner).turnDeaths || 0); defaultEffectHandlers.damage(state, { type: "damage", amount }, { ...context, targetIds: ["enemy-hero"] }); },
  resurrectByDoubleMarkerCost(state, effect, context) { const source = findUnit(state, context.sourceId), entry = player(state, context.owner); const eligible = entry.grave.filter((card) => card.type === effect.cardType && (card.cost || 0) * 2 <= markerTotal(source)); if (!eligible.length) throw new RulesViolation("ability-not-available"); queueDecision(state, { ...effect, choices: eligible.map((card) => card.uid || card.id) }, context, "grave-resurrect"); },
  healFromMarkersRemoved(state, effect, context) { const entry = player(state, context.owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + (context.markerAmount || 0)); },
  moveCardsFromHandToDeckBottom(state, effect, context) { queueDecision(state, effect, context, "hand-to-deck-bottom"); },
  moveMarker(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); const key = effect.marker || "action"; setMarker(target, key, (typeof target.markers === "object" ? target.markers[key] || 0 : target.markers || 0) + (effect.amount || 1)); },
  consolidateMarkersAndDamage(state, effect, context) { const entry = player(state, context.owner); const source = findUnit(state, context.sourceId); if (!source) return; let moved = 0; for (const card of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) { if (card === source) continue; const amount = typeof card.markers === "number" ? card.markers : Object.values(card.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0); moved += amount; card.markers = typeof card.markers === "number" ? 0 : {}; } setMarker(source, effect.marker || "action", markerTotal(source) + moved); recordLifeLoss(state, 1 - context.owner, Math.floor(markerTotal(source) / (effect.divisor || 3)), { sourceOwner: context.owner, sourceId: context.sourceId }); },
  grantKeyword(state, effect, context) { if ((effect.minimumSelections ?? 1) === 0 && !selectedIds(context).length && effect.target) return; const targets = effectTargets(state, effect, context); if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { if (effect.subtype && !hasSubtype(target, effect.subtype)) throw new RulesViolation("invalid-target-subtype"); const keyword = effect.keyword || effect.raw; const zone = effect.duration === "turn" ? "temporaryTags" : "grantedKeywords"; target[zone] ||= []; if (keyword && !target[zone].includes(keyword)) target[zone].push(keyword); } },
  keyword(state, effect, context) { const source = findUnit(state, context.sourceId); const target = source?.attachedTo ? findUnit(state, source.attachedTo) : source; const keyword = effect.keyword || effect.raw; if (target && keyword) { const zone = effect.duration === "turn" ? "temporaryTags" : "tags"; target[zone] ||= []; if (!target[zone].includes(keyword)) target[zone].push(keyword); if (/investida/i.test(String(keyword))) target.summoning = false; } },
  loseLife(state, effect, context) { const owner = effect.target === "spellControllerHero" ? context.event?.owner ?? context.owner : context.owner; recordLifeLoss(state, owner, effect.amount ?? 0, { sourceOwner: context.owner, sourceId: context.sourceId, paidAsCost: false }); },
  payLifeCost(state, effect, context) { const entry = player(state, context.owner), amount = Math.max(0, Number(effect.amount || 0)), minimumLife = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0; if (entry.life - amount < minimumLife) throw new RulesViolation("not-enough-life"); recordLifeLoss(state, context.owner, amount, { sourceOwner: context.owner, sourceId: context.sourceId, paidAsCost: true }); },
  nextCreaturePaysLife(state, effect, context) { player(state, context.owner).nextCreaturePaysLife = true; },
  graveReplacement(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.graveDestination = effect.destination || "obscuro"; },
  increaseVitality(state, effect, context) { const id = context.targetIds?.[0]; const owner = heroOwner(context, id); if (owner != null) { const entry = player(state, owner); entry.maxLife = (entry.maxLife ?? 30) + (effect.amount ?? 0); entry.life += effect.amount ?? 0; } else defaultEffectHandlers.modifyStats(state, { type: "modifyStats", health: effect.amount, duration: effect.duration }, context); },
  toggleTap(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.exhausted = !target.exhausted; },
  grantDamageShield(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damageShields ||= []; target.damageShields.push({ uses: effect.uses ?? 1, sourceId: context.sourceId, expires: effect.duration }); },
  skipNextUntap(state, effect, context) { for (const target of effectTargets(state, effect, context)) { if (!target) throw new RulesViolation("target-required"); target.skipNextUntap = true; } },
  removeMarker(state, effect, context) { const target = findUnit(state, context.sourceId); if (!target || markerTotal(target) < effect.amount) throw new RulesViolation("not-enough-markers"); const current = typeof target.markers === "object" ? target.markers[effect.marker] || 0 : target.markers; setMarker(target, effect.marker || "action", current - effect.amount); },
  doubleMarkers(state) { for (const target of allUnits(state)) { if (typeof target.markers === "number") target.markers *= 2; else for (const key of Object.keys(target.markers || {})) target.markers[key] *= 2; } },
  halveMaxEnergy(state, effect, context) { const entry = player(state, context.owner); entry.maxEnergy = Math.ceil(entry.maxEnergy / 2); entry.energy = Math.min(entry.energy, entry.maxEnergy); },
  retrieve(state, effect, context) { const entry = player(state, context.owner); const zone = entry[effect.zone] || []; const index = zone.findIndex((card) => (!effect.name || card.name === effect.name) && (!context.selectedCardId || card.id === context.selectedCardId)); if (index < 0) { if (!effect.optional) throw new RulesViolation("card-choice-required"); return; } entry[effect.destination].push(zone.splice(index, 1)[0]); },
  createImage(state, effect, context) {
    const owner = effect.destination === "activePlayerField" ? state.active : context.owner;
    const entry = player(state, owner);
    const catalog = [...(entry.extraDeck || []), ...(state.cardCatalog || [])];
    const base = catalog.find((card) => card.name === effect.name) || { id: `image:${effect.name}`, name: effect.name, type: "Criatura", atk: 1, hp: 1, tags: [] };
    state.nextGeneratedId = (state.nextGeneratedId || 0) + 1;
    const copy = { ...structuredClone(base), uid: `${base.id}-image-${state.round}-${state.nextGeneratedId}`, generatedImage: true, imageCard: true, enteredRound: state.round, attackedThisTurn: false, summoning: base.type === "Artefato" || (base.type === "Criatura" && !(base.tags || []).some((tag) => /investida/i.test(String(tag)))), exhausted: false, damage: 0, slot: context.slot ?? 0, abilities: base.abilities || [] };
    if (effect.destination === "hand") { entry.hand.push({ ...copy, revealed: true, revealedTo: [0, 1] }); return; }
    if (base.type === "Terreno") {
      if (entry.terrain && !effect.mandatory) throw new RulesViolation("terrain-zone-full");
      if (entry.terrain && !entry.terrain.generatedImage && !entry.terrain.imageCard) entry.grave.push({ ...entry.terrain, lastZone: "terrain" });
      entry.terrain = copy;
    } else if (base.type === "Criatura") {
      const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot));
      if (openSlot == null) { if (effect.mandatory) { queueDecision(state, effect, { ...context, owner }, "replace-for-mandatory-image"); return; } throw new RulesViolation("field-full"); }
      copy.slot = context.slot != null && !entry.board.some((unit) => unit.slot === context.slot) ? context.slot : openSlot;
      entry.board.push(copy);
    } else {
      const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.support.some((unit) => unit.slot === slot));
      if (openSlot == null) throw new RulesViolation("support-zone-full");
      if (base.type === "Artefato" && base.page !== 304) {
        const host = entry.board.find((unit) => unit.uid === context.attachedTo);
        if (!host) throw new RulesViolation("artifact-target-required");
        copy.attachedTo = host.uid; copy.slot = host.slot;
      } else copy.slot = context.slot != null && !entry.support.some((unit) => unit.slot === context.slot) ? context.slot : openSlot;
      entry.support.push(copy);
    }
    queueEvent(state, { type: "onEnter", owner, sourceId: copy.uid, cardId: copy.uid, card: copy });
    if (base.type === "Criatura") queueEvent(state, { type: "onCreatureEnter", owner, sourceId: copy.uid, cardId: copy.uid, card: copy });
  },
  resurrect(state, effect, context) { const entry = player(state, context.owner); if (effect.choose && !context.selectedCardId) { const choices = entry.grave.filter((card) => card.type === effect.cardType && (effect.maxCost == null || card.cost <= effect.maxCost) && (!effect.subtype || hasSubtype(card, effect.subtype))).map((card) => card.uid || card.id); if (!choices.length) { if (effect.optionalIfNoChoices) return; throw new RulesViolation("card-choice-required"); } queueDecision(state, { ...effect, choices }, context, "zone-card"); return; } const index = entry.grave.findIndex((card) => card.type === effect.cardType && (effect.cost == null || card.cost === effect.cost) && (effect.maxCost == null || card.cost <= effect.maxCost) && (!effect.subtype || hasSubtype(card, effect.subtype)) && (!context.selectedCardId || card.id === context.selectedCardId || card.uid === context.selectedCardId)); if (index < 0) { if (!effect.optional) throw new RulesViolation("card-choice-required"); return; } const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)); if (openSlot == null) throw new RulesViolation("creature-zone-full"); const card = entry.grave.splice(index, 1)[0]; const copy = { ...card, uid: `${card.id}-${state.round}-resurrected`, enteredRound: state.round, attackedThisTurn: false, damage: 0, exhausted: false, summoning: true, slot: context.slot != null && !entry.board.some((unit) => unit.slot === context.slot) ? context.slot : openSlot }; context.resurrectedId = copy.uid; entry.board.push(copy); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: copy.uid, cardId: copy.uid, card: copy }); queueEvent(state, { type: "onCreatureEnter", owner: context.owner, sourceId: copy.uid, cardId: copy.uid, card: copy }); },
  returnSelfToField(state, effect, context) { const entry = player(state, context.owner); const index = entry.grave.findIndex((card) => card.uid === context.sourceId || card.id === context.sourceId); const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)); if (index >= 0 && openSlot != null) { const copy = { ...entry.grave.splice(index, 1)[0], enteredRound: state.round, attackedThisTurn: false, damage: 0, exhausted: false, summoning: false, slot: openSlot }; entry.board.push(copy); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); queueEvent(state, { type: "onCreatureEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); } },
  returnSelfToHand(state, effect, context) { const removed = removeFromZones(state, context.sourceId, "hand"); if (removed && !removed.card.generatedImage && !removed.card.imageCard) player(state, removed.owner).hand.push(cleanCardForHand(removed.card, { revealed: true, revealedTo: [0, 1] })); },
  moveSelf(state, effect, context) { const removed = removeFromZones(state, context.sourceId); if (!removed) return; const entry = player(state, removed.owner); if (effect.destination === "obscuro") entry.obscuro.push(removed.card); else if (effect.destination === "grave") sendToPrintedGraveDestination(entry, removed.card); },
  moveTopToBottom(state, effect, context) { const owners = effect.target === "bothPlayers" ? [0, 1] : [context.owner]; for (const owner of owners) { const entry = player(state, owner); const card = entry.deck.shift(); if (card) entry.deck.push(card); } },
  investigate(state, effect, context) {
    const targetOwner = effect.target === "opponentDeck" ? 1 - context.owner : effect.target === "damagedPlayerDeck" ? context.event?.owner ?? context.owner : context.owner;
    const amount = Math.min(Math.max(1, effect.amount || 1), player(state, targetOwner).deck.length);
    if (!amount) return;
    queueDecision(state, { ...effect, amount, targetOwner, cards: player(state, targetOwner).deck.slice(0, amount).map((card) => structuredClone(card)) }, context, "investigate-selection");
  },
  opponentChoice(state, effect, context) { queueDecision(state, effect, { ...context, decisionOwner: 1 - context.owner }, "choice"); },
  controllerChoice(state, effect, context) { queueDecision(state, effect, context, "choice"); },
  openRepositionWindow(state, effect, context) { const first=state.active; state.pendingReposition = { owners: [first, 1-first], confirmed: [], activeOwner:first, moveAttachments:true, sourceId:context.sourceId, deadline:Date.now()+30000 }; },
  forceAttack(state, effect, context) { queueDecision(state, effect, context, "forced-attack"); },
  forceSelfCombatEnteringCreature(state, effect, context) {
    const attacker = findUnit(state, context.sourceId), defender = findUnit(state, context.event?.sourceId);
    if (!attacker || !defender || attacker.exhausted || attacker.summoning || attacker.stunned || attacker.cannotAttack) return;
    state.pendingAction = { type: "beginForcedCombat", owner: context.owner, attackerId: attacker.uid || attacker.id, defenderId: defender.uid || defender.id, skipPriority: true };
    state.pendingResponse = { responder: 1 - context.owner, actor: context.owner, action: `ataque automático de ${attacker.name || "Extrator da Lua Sangrenta"}`, passes: 0 };
  },
  replaySelectedAbility(state, effect, context) {
    const candidates = (player(state, context.owner).board || []).filter((card) => (!context.replayCandidateIds || context.replayCandidateIds.includes(card.uid || card.id)) && (!effect.selector?.type || card.type === effect.selector.type) && (card.abilities || []).some((ability) => ability.trigger === effect.trigger));
    if (!candidates.length) throw new RulesViolation("ability-not-available");
    queueDecision(state, { ...effect, choices: candidates.map((card) => [{ type: "selectFirstAct", id: card.uid || card.id, name: card.name }]) }, context, "replay-ability");
  },
  replayTopGraveAbility(state, effect, context) { const entry = player(state, context.owner); const top = entry.grave.at(-1); const found = top?.abilities?.find((candidate) => candidate.trigger === effect.trigger); if (!found || top.type !== effect.requireType) throw new RulesViolation("ability-not-available"); const replayContext = { ...context, sourceId: top.uid || top.id, effectSource: top }; const copies = effect.doubledByTifon && entry.heroId === "tifon" && (entry.level || 1) >= 3 ? 2 : 1; const sequence = Array.from({ length: copies }, () => found.effects || []).flat(); for (let index = 0; index < sequence.length; index++) { applyEffect(state, sequence[index], replayContext); if (state.pendingDecision) { state.pendingDecision.continuation = [...(state.pendingDecision.continuation || []), ...sequence.slice(index + 1).reverse().map((nested) => ({ kind: "effect", effect: nested, context: replayContext }))]; break; } } },
  repeatDamageUntilDeaths(state, effect, context) { const ids = [...new Set(context.targetIds || [])]; if (ids.length < (effect.minimumSelections || 1) || ids.length > (effect.selections || ids.length)) throw new RulesViolation("invalid-target-count"); const owners = ids.map((id) => state.players.findIndex((entry) => entry.board.some((card) => (card.uid || card.id) === id))); if (owners.some((owner) => owner < 0) || owners.some((owner) => owners.filter((value) => value === owner).length > (effect.maximumPerPlayer || Infinity))) throw new RulesViolation("invalid-target-count"); let deaths = 0; for (let round = 0; round < 100 && deaths < effect.stopAfterDeaths; round++) { const alive = ids.map((id) => findUnit(state, id)).filter(Boolean); if (!alive.length) break; for (const target of alive) target.damage = (target.damage || 0) + effect.amount; for (const target of alive) { const hp = (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0); if (target.damage >= hp) { const removed = removeFromZones(state, target.uid || target.id); if (removed) { deaths++; if (!removed.card.generatedImage && !removed.card.imageCard) sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { deathCause: "effect" }); } } } } },
  drawWithPenalty(state, effect, context) { const amount = Math.max(effect.min, Math.min(effect.max, context.amount ?? effect.max)); const entry = player(state, context.owner); let nonCreatures = 0; for (let i = 0; i < amount; i++) { const card = entry.deck.shift(); if (!card) break; entry.hand.push(card); if (card.type !== "Criatura") nonCreatures++; } recordLifeLoss(state, context.owner, nonCreatures * effect.penaltyPerNonCreature.amount, { sourceOwner: context.owner, sourceId: context.sourceId }); },
  costModifier(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push(effect); } },
  supportAura(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "supportAura" && item.keyword === effect.keyword && item.attack === effect.attack && item.health === effect.health)) source.staticModifiers.push(effect); } },
  subtypeAura(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "subtypeAura" && item.subtype === effect.subtype)) source.staticModifiers.push({ ...effect, type: "subtypeAura" }); } },
  conditionalStats(state, effect, context) { const ids = selectedIds(context); const targets = ids.length ? ids.map((id) => findUnit(state, id)) : [findUnit(state, context.sourceId)]; if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { const modifier = effect.alternate && target.name === effect.alternate.targetName ? effect.alternate : effect; target.modifiers ||= []; target.modifiers.push({ attack: modifier.attack || 0, health: modifier.health || 0, duration: effect.duration || "permanent", condition: effect.condition }); } },
  attachedStats(state, effect, context) { const source = findUnit(state, context.sourceId); const target = findUnit(state, source?.attachedTo); if (target) defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", duration: "attached" }, { ...context, targetIds: [target.uid] }); },
  countedChoice(state, effect, context) { const source = findUnit(state, context.sourceId); const counterSource = effect.counterScope === "player" ? player(state, context.owner) : source; const count = counterSource?.[effect.counter] || 0; const branch = effect.branches.find((candidate) => count >= candidate.min && (candidate.max == null || count <= candidate.max)); for (const nested of branch?.effects || []) applyEffect(state, nested, { ...context, count }); },
  damageHeroPerCount(state, effect, context) { recordLifeLoss(state, context.owner, (context.count || 0) * effect.amount, { sourceOwner: context.owner, sourceId: context.sourceId }); },
  drawPerMarkersRemoved(state, effect, context) { defaultEffectHandlers.draw(state, { type: "draw", amount: Math.floor((context.markerAmount || 0) / effect.divisor) }, context); },
  threshold(state, effect, context) { const target = effect.target === "hero" ? player(state, context.owner) : findUnit(state, context.sourceId); const amount = typeof target?.markers === "object" ? target.markers[effect.marker] || 0 : 0; if (amount >= effect.amount) { if (effect.reset) setMarker(target, effect.marker, 0); for (const nested of effect.effects || []) applyEffect(state, nested, context); } },
  cannotDefend(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.cannotDefend = true; },
  cannotBeDestroyedForSpace(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.cannotBeDestroyedForSpace = true; },
  grantUntilTurnEnd(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.abilities ||= []; source.abilities.push({ ...effect.ability, temporary: true }); } },
  remainUntilTurnEnd(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.remainUntilTurnEnd = true; },
  trackCardsPlayedAfterSelf(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.cardsPlayedAfterSelf = 0; },
  grantSubtype(state, effect, context) { for (const target of effectTargets(state, effect, context)) { if (!target) throw new RulesViolation("target-required"); const zone = effect.duration === "turn" ? "temporarySubtypes" : "subtypes"; target[zone] ||= []; if (!target[zone].includes(effect.subtype)) target[zone].push(effect.subtype); } },
  combatRestriction(state, effect, context) { for (const target of effectTargets(state, effect, context)) { if (!target) throw new RulesViolation("target-required"); target.combatRestrictions ||= []; target.combatRestrictions.push({ cannotCombatSubtype: effect.cannotCombatSubtype, duration: effect.duration || "permanent" }); } },
  grantAdditionalAttack(state, effect, context) { for (const target of effectTargets(state, effect, context)) { if (!target) throw new RulesViolation("target-required"); target.attackLimit = Math.max(target.attackLimit || 1, 1 + (effect.amount || 1)); target.attacksThisTurn ||= target.attackedThisTurn ? 1 : 0; } },
  scheduleEffect(state, effect, context) { state.delayedEffects ||= []; state.delayedEffects.push({ timing: effect.timing, owner: context.owner, effect: effect.effect, context: { ...context, targetIds: selectedIds(context) } }); },
  createImagesAcrossFields(state, effect, context) { let remaining = effect.amount || 1; for (const owner of [context.owner, 1 - context.owner]) while (remaining > 0 && player(state, owner).board.length < 5) { defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.name, destination: "field" }, { ...context, owner }); remaining--; } },
  levelHero(state, effect, context) { const entry = player(state, context.owner); entry.level = Math.min(effect.maximum || 3, (entry.level || 1) + (effect.amount || 1)); },
  archiveToGrave(state, effect, context) { player(state, context.owner).archiveToGrave = (player(state, context.owner).archiveToGrave || 0) + (effect.amount || 1); },
  modifySelfCost(state, effect, context) { const entry = player(state, context.owner); const card = entry.hand.find((candidate) => candidate.id === context.sourceId); if (card) card.costModifier = (card.costModifier || 0) + effect.amount; },
  additionalTargetCost(state, effect, context) { queueDecision(state, effect, context, "additional-target-cost"); },
  optionalRedirect(state, effect, context) { queueDecision(state, effect, context, "redirect"); },
  optionalDrawFrom(state, effect, context) { queueDecision(state, effect, context, "draw-position"); },
  peekTop(state, effect, context) { state.peekedCards = [0, 1].map((owner) => player(state, owner).deck[0]?.id || null); },
  copyStrongestAllyStats(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.dynamicStats = { copyStrongestAlly: true }; },
  dynamicSubtypeStats(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.dynamicStats = { attackSubtype: effect.attackSubtype, healthSubtype: effect.healthSubtype }; },
  dynamicMilledAttack(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.dynamicStats = { cardsMilledThisTurn: true }; },
  entersExhausted(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.exhausted = true; },
  drawIfPriorSpell(state, effect, context) { const prior = Math.max(0, (player(state, context.owner).turnSpellsPlayed || 0) - 1); defaultEffectHandlers.draw(state, { type: "draw", amount: (effect.base || 1) + (prior > 0 ? effect.additional || 0 : 0) }, context); },
  drawIfPriorNamedCard(state, effect, context) { const prior = Math.max(0, (player(state, context.owner).namedCardsPlayedThisTurn?.[normalizedName(effect.nameIncludes)] || 0) - 1); defaultEffectHandlers.draw(state, { type: "draw", amount: (effect.base || 1) + (prior > 0 ? effect.additional || 0 : 0) }, context); },
  damagePerSubtype(state, effect, context) { const count = state.players.flatMap((entry) => entry.board || []).filter((card) => hasSubtype(card, effect.subtype)).length; defaultEffectHandlers.damage(state, { type: "damage", amount: count * (effect.amount || 1) }, { ...context, targetIds: selectedIds(context).length ? selectedIds(context) : ["enemy-hero"] }); },
  redrawHand(state, effect, context) { const entry = player(state, context.owner), amount = entry.hand.length; entry.grave.push(...entry.hand.splice(0)); defaultEffectHandlers.draw(state, { type: "draw", amount }, context); },
  strategicDraw(state, effect, context) { const entry = player(state, context.owner); let remaining = Math.max(1, entry.deck.length + 1); while (remaining-- > 0) { const card = entry.deck.shift(); if (!card) { entry.deckOut = true; return; } entry.hand.push(card); entry.cardsDrawnThisTurn = (entry.cardsDrawnThisTurn || 0) + 1; queueEvent(state, { type: "onCardsDrawn", owner: context.owner, amount: 1, cards: [card], sourceId: context.sourceId, outsideMaintenance: state.phase !== "manutencao" }); if (card.type === "Criatura") { recordLifeLoss(state, context.owner, Math.max(0, card.cost || 0), { sourceOwner: context.owner, sourceId: context.sourceId }); return; } if (card.type === "Feitiço") continue; if (card.type === "Terreno") { entry.hand.splice(entry.hand.indexOf(card), 1); entry.grave.push(card); } return; } },
  attachedKillGrowth(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!target || normalizedName(target.name) !== normalizedName(effect.requiredName)) return; target.name = effect.renamedTo || target.name; target.abilities ||= []; const id = `attachment-kill-${source.uid || source.id}`, growth = { type: "modifyStats", target: "self", attack: effect.attack || 1, health: 0, duration: "permanent" }; if (!target.abilities.some((ability) => ability.id === id)) target.abilities.push({ id, trigger: "onCreatureDestroyed", costs: [], condition: { eventCausedBySelf: true }, effects: [growth] }); },
  attachedSupportAura(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!target) return; const special = normalizedName(target.name) === normalizedName(effect.requiredName); if (special && effect.renamedTo) target.name = effect.renamedTo; target.staticModifiers ||= []; target.staticModifiers.push({ type: "supportAura", attack: special ? effect.alternateAttack : effect.attack, health: special ? effect.alternateHealth : effect.health, sourceId: source.uid || source.id }); },
  granFinale(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!target || normalizedName(target.name) !== normalizedName(effect.requiredName)) return; target.name = effect.renamedTo || target.name; target.returnCombatPairOnDefeat = true; },
  conditionalAttachedBlockRestriction(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source?.attachedTo) return; source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "attachedBlockRestriction")) source.staticModifiers.push({ ...effect, type: "attachedBlockRestriction" }); },
  controllerLifeThresholdStats(state, effect, context) { if (player(state, context.owner).life <= effect.lifeAtMost) defaultEffectHandlers.modifyStats(state, effect, context); },
  snapshotStats(state, effect, context) { const entry = player(state, context.owner); const source = findUnit(state, context.sourceId); const count = entry.board.filter((unit) => unit !== source && hasSubtype(unit, effect.attackPerOtherSubtype.subtype)).length; if (source) defaultEffectHandlers.modifyStats(state, { type: "modifyStats", attack: count * effect.attackPerOtherSubtype.amount, duration: "permanent" }, { ...context, targetIds: [source.uid] }); },
  search(state, effect, context) { queueDecision(state, effect, context, "search"); },
  replaceFirstAct(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; source.abilities = (source.abilities || []).filter((ability) => ability.trigger !== "onEnter"); source.abilities.push({ id: `${source.id || source.uid}-replacement-first-act`, trigger: "onEnter", costs: [], effects: effect.effects || [] }); source.firstActReplaced = true; },
  replayAbility(state, effect, context) { queueDecision(state, effect, context, "replay-ability"); },
  recruitFirstActOnLeave(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push({ type: "recruitFirstActOnLeave" }); } },
  doubleRecruitEffects(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push({ type: "doubleRecruitEffects" }); } },
  doubleNextNamedEffect(state, effect, context) { player(state, context.owner).replacementEffects ||= []; player(state, context.owner).replacementEffects.push(effect); },
  copyEventEffect(state, effect, context) { if (context.event?.effect) applyEffect(state, context.event.effect, { ...context, targetIds: [context.sourceId] }); },
  allowSubtypeInZone(state, effect) { state.globalRules ||= []; state.globalRules.push(effect); },
  attackPermission(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.attackPermission = effect; },
  removeMarkersFromConstants(state, effect, context) { queueDecision(state, effect, context, "remove-markers-from-constants"); },
  selectMarkersThenSearch(state, effect, context) { const entry = player(state, context.owner), constants = [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])], choices = constants.filter((card) => markerTotal(card) > 0).map((card) => ({ id: card.uid || card.id, markers: markerTotal(card) })); if (choices.reduce((sum, choice) => sum + choice.markers, 0) < effect.amount || !entry.deck.some((card) => effect.types.includes(card.type))) throw new RulesViolation("ability-not-available"); queueDecision(state, { ...effect, choices }, context, "marker-payment-search"); },
  playCondition() {},
  availability() {},
  unsupported() { throw new RulesViolation("unsupported-effect", "Card effect has not been migrated to a primitive"); },
});

export function applyEffect(state, effect, context, handlers = defaultEffectHandlers) {
  const handler = handlers[effect.type]; if (!handler) throw new RulesViolation("unknown-effect", `Unknown effect: ${effect.type}`);
  handler(state, effect, context); return state;
}
