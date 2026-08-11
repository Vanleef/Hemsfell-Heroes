import { hasSubtype } from "./subtypes.mjs";

export class RulesViolation extends Error {
  constructor(code, message = code) { super(message); this.name = "RulesViolation"; this.code = code; }
}

const player = (state, owner) => state.players[owner];
const allUnits = (state) => state.players.flatMap((entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])]);
const findUnit = (state, id) => allUnits(state).find((unit) => unit.uid === id || unit.id === id);
const heroOwner = (context, id) => id === "enemy-hero" ? 1 - context.owner : id === "ally-hero" || id === "controller-hero" ? context.owner : /^hero-[01]$/.test(id || "") ? Number(id.slice(-1)) : null;
const markerTotal = (card) => typeof card?.markers === "number" ? card.markers : Object.values(card?.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const setMarker = (card, marker, amount) => { if (typeof card.markers === "number" && marker === "action") card.markers = amount; else card.markers = { ...(typeof card.markers === "object" ? card.markers : {}), [marker]: amount }; };
const queueEvent = (state, event) => { state.rulesEvents ||= []; state.rulesEvents.push(event); };
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
const keywordsOf = (card) => card?.suffocated ? [] : [...(card?.tags || []), ...(card?.temporaryTags || []), ...(card?.grantedKeywords || []).map((value) => String(value).replace(/^(?:attachment|support):[^:]+:/, ""))];
const hasKeyword = (card, pattern) => keywordsOf(card).some((tag) => pattern.test(String(tag)));
const normalizedName = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
const effectiveUnitName = (state, unit) => {
  let name = unit?.name || "";
  for (const attachment of allUnits(state).filter((card) => card.attachedTo === unit?.uid && !card.suffocated)) {
    const rename = String(attachment.text || "").match(/se equipad[ao][^“\"]*[“\"]([^”\"]+)[”\"][\s\S]*?(?:agora\s+se\s+chama|passa\s+a\s+se\s+chamar)[^“\"]*[“\"]([^”\"]+)[”\"]/i);
    if (rename && normalizedName(name) === normalizedName(rename[1])) name = rename[2];
  }
  return name;
};
const sendDetachedArtifacts = (entry, creature) => {
  const attachments = (entry.support || []).filter((item) => item.attachedTo === creature.uid);
  entry.support = (entry.support || []).filter((item) => item.attachedTo !== creature.uid);
  for (const attachment of attachments) {
    creature.modifiers = (creature.modifiers || []).filter((modifier) => modifier.sourceId !== (attachment.uid || attachment.id));
    creature.grantedKeywords = (creature.grantedKeywords || []).filter((keyword) => !String(keyword).startsWith(`attachment:${attachment.uid || attachment.id}:`));
    if (attachment.generatedImage || attachment.imageCard) continue;
    const destination = attachment.page === 154 ? entry.obscuro : entry.grave;
    destination.push({ ...attachment, deathCause: "detached", lastZone: "support" });
  }
};
const sendToPrintedGraveDestination = (entry, card, metadata = {}) => {
  if (card.generatedImage || card.imageCard) return;
  const destination = card.graveDestination === "obscuro" || card.page === 154 ? entry.obscuro : entry.grave;
  destination.push({ ...card, ...metadata });
};
const removeFromZones = (state, id) => {
  for (const entry of state.players) {
    for (const zone of ["board", "support"]) {
      const index = (entry[zone] || []).findIndex((card) => card.uid === id || card.id === id);
      if (index < 0) continue;
      const card = entry[zone].splice(index, 1)[0];
      if (zone === "board") sendDetachedArtifacts(entry, card);
      const owner = state.players.indexOf(entry);
      queueEvent(state, { type: "onPermanentLeaves", owner, sourceId: card.uid || card.id, card, zone });
      return { card, owner, zone };
    }
    const terrain = entry.terrain;
    if (terrain && (terrain.uid === id || terrain.id === id)) {
      entry.terrain = null;
      const owner = state.players.indexOf(entry);
      queueEvent(state, { type: "onPermanentLeaves", owner, sourceId: terrain.uid || terrain.id, card: terrain, zone: "terrain" });
      return { card: terrain, owner, zone: "terrain" };
    }
  }
  return null;
};

export const defaultEffectHandlers = Object.freeze({
  draw(state, effect, context) {
    const owners = effect.target === "bothPlayers" ? [0, 1] : effect.target === "chosenOtherPlayer" ? [1 - (context.decisionOwner ?? context.owner)] : [context.owner];
    if (!effect.skipPrestidigitation && owners.length === 1) { const entry = player(state, owners[0]); if ([...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].some((card) => card.page === 271 && !card.suffocated)) { queueDecision(state, { type: "optionalDrawFrom", amount: effect.amount ?? 1, zonePosition: "bottom", fallback: "top" }, { ...context, owner: owners[0] }, "draw-position"); return; } }
    for (const owner of owners) { const entry = player(state, owner), cards = []; let amount = effect.amount ?? 1; while (amount-- > 0) { const card = entry.deck.shift(); if (!card) { entry.deckOut = true; break; } entry.hand.push(card); cards.push(card); } if (cards.length) queueEvent(state, { type: "onCardsDrawn", owner, amount: cards.length, cards, sourceId: context.sourceId, outsideMaintenance: state.phase !== "manutencao" }); }
  },
  discard(state, effect, context) {
    const entry = player(state, effect.target === "enemy" ? 1 - context.owner : context.owner); const amount = Math.min(effect.amount ?? 1, entry.hand.length);
    entry.grave.push(...entry.hand.splice(Math.max(0, entry.hand.length - amount), amount));
  },
  mill(state, effect, context) {
    const owner = effect.target === "enemy" ? 1 - context.owner : effect.target === "chooser" ? context.decisionOwner ?? context.owner : context.owner;
    const entry = player(state, owner); entry.grave.push(...entry.deck.splice(0, effect.amount ?? 1));
  },
  damage(state, effect, context) {
    const ids = selectedIds(context); if (!ids.length) throw new RulesViolation("target-required");
    for (const targetId of ids) { const owner = heroOwner(context, targetId);
      if (owner != null) { const amount = Math.max(0, effect.amount ?? 0); player(state, owner).life -= amount; queueEvent(state, { type: "onPlayerDamaged", owner, sourceOwner: context.owner, sourceId: context.sourceId, source: context.effectSource, amount }); if (amount > 0) queueEvent(state, { type: "onAttachedCreatureDamage", owner: context.owner, sourceId: context.sourceId, source: context.effectSource, targetIds: [targetId], amount }); continue; }
      const target = findUnit(state, targetId); if (!target) throw new RulesViolation("target-required");
      const shield = (target.damageShields || []).find((item) => item.uses > 0); const shieldReduction = shield?.reduction ?? (shield ? Number.POSITIVE_INFINITY : 0); if (shield) { shield.uses--; target.damageShields = target.damageShields.filter((item) => item.uses > 0); }
      const robust = hasKeyword(target, /robusto/i) ? 1 : 0;
      const amount = Math.max(0, (effect.amount ?? 0) + (effect.additionalIfExhausted && target.exhausted ? effect.additionalIfExhausted : 0) - robust - shieldReduction); target.damage = (target.damage || 0) + amount; const source = findUnit(state, context.sourceId); if (source && amount > 0) { const damagedOwner = state.players.findIndex((entry) => entry.board.includes(target)); source.damagedOwnersThisTurn ||= []; if (!source.damagedOwnersThisTurn.includes(damagedOwner)) source.damagedOwnersThisTurn.push(damagedOwner); } const effectSource = context.effectSource || source; const sourceKeywords = keywordsOf(effectSource); if (amount > 0 && sourceKeywords.some((tag) => /toque da morte/i.test(String(tag)))) target.damage = Math.max(target.damage, (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0)); if (amount > 0 && sourceKeywords.some((tag) => /roubo de vida/i.test(String(tag)))) { const entry = player(state, context.owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + amount); } queueEvent(state, { type: "onDamageTaken", targetId, sourceOwner: context.owner, sourceId: context.sourceId, amount }); if (amount > 0) queueEvent(state, { type: "onAttachedCreatureDamage", owner: context.owner, sourceId: context.sourceId, source: effectSource, targetIds: [targetId], amount });
    }
  },
  damageAll(state, effect, context) {
    const targets = state.players.flatMap((entry) => entry.board || []).filter((target) => effect.target !== "enemyCreatures" || state.players[1 - context.owner].board.includes(target));
    const amount = (effect.amount ?? 0) + (effect.amountPerEnemyCreature ?? 0) * (state.players[1 - context.owner].board?.length ?? 0);
    for (const target of targets) defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount }, { ...context, targetIds: [target.uid || target.id] });
  },
  damageAdjacent(state, effect, context) {
    const selected = findUnit(state, context.targetIds?.[0]); if (!selected) throw new RulesViolation("target-required");
    const entry = state.players.find((candidate) => candidate.board.includes(selected));
    for (const target of entry?.board.filter((unit) => Math.abs((unit.slot ?? entry.board.indexOf(unit)) - (selected.slot ?? entry.board.indexOf(selected))) === 1) || []) defaultEffectHandlers.damage(state, { type: "damage", amount: effect.amount }, { ...context, targetIds: [target.uid] });
  },
  heal(state, effect, context) {
    if (effect.amountPerTurnedCreature) { const entry = player(state, context.owner); const amount = state.players.flatMap((candidate) => candidate.board || []).filter((unit) => unit.exhausted).length * effect.amountPerTurnedCreature; entry.life = Math.min(entry.maxLife ?? 30, entry.life + amount); return; }
    if (["controller", "controllerHero"].includes(effect.target)) { const entry = player(state, context.owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + (effect.amount ?? 0)); return; }
    const ids = selectedIds(context); if (!ids.length) throw new RulesViolation("target-required"); for (const id of ids) { const owner = heroOwner(context, id); if (owner != null) { const entry = player(state, owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + (effect.amount ?? 0)); continue; } const target = findUnit(state, id); if (!target) throw new RulesViolation("target-required"); target.damage = Math.max(0, (target.damage || 0) - (effect.amount ?? 0)); }
  },
  destroy(state, effect, context) {
    const ids = ["self", "this", "thisArtifact", "thisEnchantment"].includes(effect.target) ? [context.sourceId] : effect.target === "all" ? allUnits(state).map((unit) => unit.uid || unit.id) : context.targetIds || [];
    for (const id of ids) {
      const target = findUnit(state, id);
      if (!target || hasKeyword(target, /indestrut[ií]vel/i)) continue;
      const removed = removeFromZones(state, id);
      if (!removed) continue;
      if (!removed.card.generatedImage && !removed.card.imageCard) {
        sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { lastZone: removed.zone, deathCause: "destroy" });
        queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "destroy" });
      }
      if (removed.card.type === "Criatura") queueEvent(state, { type: "onCreatureDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id });
    }
  },
  sacrifice(state, effect, context) {
    for (const id of context.sacrificeIds || []) { const removed = removeFromZones(state, id); if (removed) sendToPrintedGraveDestination(player(state, removed.owner), removed.card, { lastZone: removed.zone, deathCause: "sacrifice", suppressDeathTrigger: true }); }
  },
  banish(state, effect, context) {
    for (const id of context.targetIds || []) { const removed = removeFromZones(state, id); if (removed) player(state, removed.owner).obscuro.push(removed.card); }
  },
  returnToHand(state, effect, context) {
    for (const id of context.targetIds || []) { const target = findUnit(state, id); if (!target) throw new RulesViolation("target-required"); if (effect.requireExhausted && !target.exhausted) throw new RulesViolation("target-must-be-exhausted"); if (effect.maxCost != null && (target.cost ?? 0) > effect.maxCost) throw new RulesViolation("target-cost-too-high"); const removed = removeFromZones(state, id); if (removed) player(state, removed.owner).hand.push(removed.card); }
  },
  tap(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.exhausted = true; },
  ready(state, effect, context) { const target = findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); target.exhausted = false; },
  addMarker(state, effect, context) { const target = effect.target === "hero" ? player(state, context.owner) : findUnit(state, context.targetIds?.[0] || context.sourceId); if (!target) throw new RulesViolation("target-required"); const key = effect.marker || "action"; setMarker(target, key, (typeof target.markers === "object" ? target.markers[key] || 0 : target.markers || 0) + (effect.amount ?? 1)); },
  modifyStats(state, effect, context) { const targets = effectTargets(state, effect, context); if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { if (effect.subtype && !hasSubtype(target, effect.subtype)) throw new RulesViolation("invalid-target-subtype"); target.modifiers ||= []; const sourceId=context.sourceId; if (effect.duration === "attached" && target.modifiers.some((item) => item.sourceId === sourceId && item.attack === (effect.attack || 0) && item.health === (effect.health || 0))) continue; target.modifiers.push({ attack: effect.attack || 0, health: effect.health || 0, duration: effect.duration || "permanent", ...(effect.duration === "untilNextTurn" ? { expiresRound: (state.round || 0) + 2 } : {}), ...(effect.duration === "attached" ? { sourceId } : {}) }); } },
  attachedConditionalKeyword(state, effect, context) { const source=findUnit(state,context.sourceId); const target=source?.attachedTo?findUnit(state,source.attachedTo):null; if(!target||normalizedName(effectiveUnitName(state,target))!==normalizedName(effect.attachedName))return; target.grantedKeywords ||= []; const value=`attachment:${source.uid || source.id}:${effect.keyword}`; if(!target.grantedKeywords.includes(value))target.grantedKeywords.push(value); },
  optionalSacrificeBuff(state, effect, context) { const source=findUnit(state,context.sourceId); const choices=(player(state,context.owner).board||[]).filter((card)=>card.uid!==source?.uid).map((card)=>card.uid); if(!source||!choices.length)return; queueDecision(state,{...effect,choices},context,"optional-sacrifice-buff"); },
  attachedConditionalStats(state, effect, context) { const source = findUnit(state, context.sourceId); const target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!target) throw new RulesViolation("artifact-target-required"); const excluded = (effect.excludedNames || []).map(normalizedName); if (excluded.includes(normalizedName(effectiveUnitName(state, target)))) return; defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", target: "attachedCreature" }, context); },
  gainEnergy(state, effect, context) { const entry = player(state, context.owner); const key = effect.destination === "reserve" ? "reserve" : "energy"; const cap = key === "reserve" ? 3 : entry.maxEnergy; entry[key] = Math.min(cap, entry[key] + (effect.amount ?? 0)); },
  gainMaxEnergy(state, effect, context) { const entry = player(state, context.owner); entry.maxEnergy = Math.min(10, (entry.maxEnergy || 0) + (effect.amount || 1)); entry.energy = Math.min(10, (entry.energy || 0) + (effect.amount || 1)); },
  grantTeamReserveTapAbility(state, effect, context) { for (const target of player(state, context.owner).board || []) { target.abilities ||= []; if (!target.abilities.some((ability) => ability.id === `stabilize:${context.sourceId}`)) target.abilities.push({ id: `stabilize:${context.sourceId}`, trigger: "activated", costs: [{ type: "tap", amount: 1 }], effects: [{ type: "gainEnergy", amount: 1, destination: "reserve" }], temporary: true }); } },
  freezeEnemyBoard(state, effect, context) { for (const target of player(state, 1 - context.owner).board || []) { const alreadyFrozen = target.frozen || hasKeyword(target, /congelado/i); if (alreadyFrozen && effect.damageAlreadyFrozen) defaultEffectHandlers.damage(state, { type: "damage", amount: effect.damageAlreadyFrozen }, { ...context, targetIds: [target.uid] }); target.frozen = true; target.tags ||= []; if (!target.tags.some((tag) => /congelado/i.test(String(tag)))) target.tags.push("Congelado"); } },
  applyGoblinThresholds(state, effect, context) { const entry = player(state, context.owner); const count = entry.turnCardsPlayed || 0; for (const target of entry.board.filter((card) => hasSubtype(card, "Goblin"))) { target.temporaryTags ||= []; target.temporaryTags = target.temporaryTags.filter((tag) => !String(tag).startsWith("parque:")); if (count >= 4) target.temporaryTags.push("parque:Atropelar"); if (count >= 5) { target.temporaryTags.push("parque:Investida"); target.summoning = false; } if (count >= 6) target.temporaryTags.push("parque:Último Suspiro"); if (count >= 7) target.temporaryTags.push("parque:Toque da Morte"); } },
  grantNextCardDiscount(state, effect, context) { const entry = player(state, context.owner); entry.nextCardDiscounts ||= []; entry.nextCardDiscounts.push({ amount: effect.amount || 0, type: effect.typeOnly, typeNot: effect.typeNot, expires: effect.duration || "turn", expiresRound: (state.round || 0) + 1 }); },
  discountReturnedCard(state, effect, context) { const id = context.targetIds?.[0]; const card = player(state, context.owner).hand.find((candidate) => candidate.uid === id || candidate.id === id); if (card) { card.costModifier = (card.costModifier || 0) - (effect.amount || 0); card.costModifierExpires = effect.duration || "turn"; card.costModifierExpiresRound = (state.round || 0) + 1; } },
  damageFromCardsPlayedThisTurn(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: player(state, context.owner).turnCardsPlayed || 0 }, context); },
  damageFromSacrificedAttack(state, effect, context) { defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount: context.paidSacrificeAttack || 0 }, context); },
  configureResurrected(state, effect, context) { const target = findUnit(state, context.resurrectedId); if (!target) return; if (effect.grantKeywordIfCombo && (player(state, context.owner).turnCardsPlayed || 0) > 0) { target.temporaryTags ||= []; target.temporaryTags.push(effect.grantKeywordIfCombo); target.summoning = false; } if (effect.destroyAtTurnEnd) { state.delayedEffects ||= []; state.delayedEffects.push({ timing: "turnEnd", owner: context.owner, effect: { type: "destroy", target: "selected" }, context: { ...context, targetIds: [target.uid || target.id] } }); } },
  protectAlliedDragonsOncePerTurn(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "protectAlliedDragonsOncePerTurn")) source.staticModifiers.push({ type: "protectAlliedDragonsOncePerTurn" }); } },
  replaceImage(state, effect, context) { const entry = player(state, context.owner); const old = entry.board.find((card) => card.generatedImage && normalizedName(card.name) === normalizedName(effect.oldName)); const slot = old?.slot; if (old) removeFromZones(state, old.uid || old.id); defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.newName, destination: "field" }, { ...context, slot }); },
  transformFromHandOrDeck(state, effect, context) { const entry = player(state, context.owner); let card = entry.hand.find((candidate) => normalizedName(candidate.name) === normalizedName(effect.name)); if (card) entry.hand.splice(entry.hand.indexOf(card), 1); else { const index = entry.deck.findIndex((candidate) => normalizedName(candidate.name) === normalizedName(effect.name)); if (index >= 0) card = entry.deck.splice(index, 1)[0]; } if (!card) throw new RulesViolation("card-choice-required"); const source = findUnit(state, context.sourceId), slot = source?.slot; if (source && effect.replaceSelf) removeFromZones(state, source.uid || source.id); const unit = { ...structuredClone(card), uid: `${card.id}-${state.round}-ascended`, slot: slot ?? 0, enteredRound: state.round, attackedThisTurn: false, summoning: true, exhausted: false, damage: 0, modifiers: [], abilities: card.abilities || [] }; entry.board.push(unit); if (effect.shuffle && entry.deck.length > 1) entry.deck.push(entry.deck.shift()); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: unit.uid, cardId: unit.uid, card: unit }); },
  snapshotStatsFromHand(state, effect, context) { const source = findUnit(state, context.sourceId); const count = player(state, context.owner).hand.length; if (source) defaultEffectHandlers.modifyStats(state, { type: "modifyStats", attack: count * (effect.attackPerCard || 0), health: count * (effect.healthPerCard || 0), duration: "permanent" }, { ...context, targetIds: [source.uid || source.id] }); },
  snapshotHealthFromFactionConstants(state, effect, context) { const entry = player(state, context.owner), source = findUnit(state, context.sourceId); const count = allUnits(state).filter((card) => allUnits(state).includes(card) && (card.tags || []).some((tag) => normalizedName(tag) === normalizedName(effect.faction))).length; if (source) { source.hp = Math.max(1, count); source.damage = 0; } },
  optionalDrawWithCreatureCostDamage(state, effect, context) { queueDecision(state, { ...effect, choices: [[], [{ type: "drawAndDamageIfCreature" }]] }, context, "choice"); },
  drawAndDamageIfCreature(state, effect, context) { const entry = player(state, context.owner), card = entry.deck.shift(); if (!card) { entry.deckOut = true; return; } entry.hand.push(card); if (card.type === "Criatura") defaultEffectHandlers.loseLife(state, { type: "loseLife", amount: card.cost || 0, target: "controllerHero" }, context); },
  counterPendingAction(state) { if (!state.pendingAction) throw new RulesViolation("nothing-to-counter"); state.pendingAction = null; state.pendingResponse = null; },
  linkCreatures(state, effect, context) { const artifact = findUnit(state, context.sourceId), first = artifact?.attachedTo && findUnit(state, artifact.attachedTo), second = findUnit(state, context.targetIds?.[0]); if (!artifact || !first || !second || first === second) throw new RulesViolation("invalid-target"); artifact.linkedCreatures = [first.uid || first.id, second.uid || second.id]; },
  followLinkedDestination(state, effect, context) { const artifact = findUnit(state, context.sourceId), ids = artifact?.linkedCreatures || []; if (!ids.includes(context.event?.sourceId)) return; const otherId = ids.find((id) => id !== context.event.sourceId), removed = removeFromZones(state, otherId); if (!removed) return; const destination = context.event?.destination || (context.event?.zone === "obscuro" ? "obscuro" : "grave"); player(state, removed.owner)[destination].push(removed.card); },
  gainTemporaryEnergy(state, effect, context) { player(state, context.owner).energy += effect.amount || 0; },
  skipNextMaxEnergyIncrease(state, effect, context) { player(state, context.owner).skipNextMaxEnergyIncrease = true; },
  destroyExhaustedAndHealCost(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target || (effect.requireExhausted && !target.exhausted)) throw new RulesViolation("target-must-be-exhausted"); const amount = target.cost || 0; defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); defaultEffectHandlers.heal(state, { type: "heal", amount, target: "controllerHero" }, context); },
  suffocateUntilTurnEndAndDrawOwner(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.suffocated = true; target.suffocatedUntilTurnEnd = true; const owner = state.players.findIndex((entry) => [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].includes(target)); defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, { ...context, owner }); },
  destroyIfDamagedControllerThisTurn(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target || !(target.damagedOwnersThisTurn || []).includes(context.owner)) return; defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, context); },
  destroyAtTurnEndUnlessCombat(state, effect, context) { const targetId = context.targetIds?.[0]; state.delayedEffects ||= []; state.delayedEffects.push({ timing: "turnEnd", owner: state.active, effect: { type: "destroyUnlessCombat", targetId }, context: { ...context, targetIds: [targetId] } }); },
  destroyUnlessCombat(state, effect, context) { const target = findUnit(state, effect.targetId); if (target && !target.participatedInCombatThisTurn) defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, { ...context, targetIds: [effect.targetId] }); },
  spellTargetSurcharge(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.spellTargetSurcharge = effect.amount || 1; },
  banishUntilSourceLeaves(state, effect, context) { const source = findUnit(state, context.sourceId), targetId = context.targetIds?.[0], removed = removeFromZones(state, targetId); if (!source || !removed) throw new RulesViolation("target-required"); source.temporarilyBanished ||= []; source.temporarilyBanished.push({ card: removed.card, owner: removed.owner, zone: removed.zone }); },
  returnBanishedBySource(state, effect, context) { const source = context.event?.card?.uid === context.sourceId ? context.event.card : findUnit(state, context.sourceId); for (const record of source?.temporarilyBanished || []) { const entry = player(state, record.owner); if (record.zone === "board" && entry.board.length < 5) entry.board.push({ ...record.card, slot: Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)) }); else entry.hand.push(record.card); } if (source) source.temporarilyBanished = []; },
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
  optionalClueChoice(state, effect, context) { const hero = player(state, context.owner), available = typeof hero.markers === "object" ? hero.markers.clue || 0 : 0; if (available < effect.cost) return; queueDecision(state, { ...effect, choices: [[], [{ type: "spendCluesAndDraw", amount: effect.cost }], [{ type: "spendCluesAndMill", amount: effect.cost, mill: 2 }]] }, context, "choice"); },
  spendCluesAndDraw(state, effect, context) { const entry = player(state, context.owner); entry.markers.clue -= effect.amount; defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, context); },
  spendCluesAndMill(state, effect, context) { const entry = player(state, context.owner); entry.markers.clue -= effect.amount; defaultEffectHandlers.mill(state, { type: "mill", amount: effect.mill, target: "enemy" }, context); },
  millFromDirectDamage(state, effect, context) { if (!(context.event?.targetIds || []).some((id) => /hero/.test(id))) return; defaultEffectHandlers.mill(state, { type: "mill", amount: context.event.amount || 0, target: "enemy" }, context); },
  vanillaDestructionReplacement(state, effect, context) { player(state, context.owner).vanillaDestructionReplacement = true; },
  cannotAttack(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.cannotAttack = true; },
  becomeVanilla(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; source.abilities = []; source.tags = []; source.grantedKeywords = []; source.temporaryTags = []; source.staticModifiers = []; source.text = ""; source.cannotAttack = false; },
  extraActionMarker(state, effect, context) { player(state, context.owner).extraActionMarker = true; },
  conditionalAttachedKeyword(state, effect, context) { const entry = player(state, context.owner), source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; const hasOther = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].some((card) => card !== source && (card.tags || []).some((tag) => normalizedName(tag) === normalizedName(effect.requiresOtherFactionConstant))); if (target && hasOther) defaultEffectHandlers.keyword(state, { type: "keyword", keyword: effect.keyword }, context); },
  grantCharacterDamageShield(state, effect, context) { const id = context.targetIds?.[0], owner = heroOwner(context, id); if (owner != null) { const entry = player(state, owner); entry.damageShields ||= []; entry.damageShields.push({ uses: effect.uses || 1, sourceId: context.sourceId, expires: effect.duration }); } else defaultEffectHandlers.grantDamageShield(state, effect, context); },
  grantNextElementEffect(state, effect, context) { const entry = player(state, context.owner); entry.nextElementEffects ||= []; entry.nextElementEffects.push({ element: effect.element, keyword: effect.keyword, expires: effect.duration }); },
  consumeAllEnergyForDamage(state, effect, context) { const entry = player(state, context.owner), amount = (entry.energy || 0) + (entry.reserve || 0); entry.energy = 0; entry.reserve = 0; defaultEffectHandlers.damage(state, { ...effect, type: "damage", amount }, context); },
  createUniqueImage(state, effect, context) { if (allUnits(state).some((card) => normalizedName(card.name) === normalizedName(effect.name))) throw new RulesViolation("unique-image-already-present"); defaultEffectHandlers.createImage(state, { type: "createImage", name: effect.name, destination: "field" }, context); },
  geomancyChoice(state, effect, context) { queueDecision(state, { ...effect, choices: [[{ type: "reduceStatFloor", stat: "attack", amount: effect.amount, minimum: effect.minimum }], [{ type: "reduceStatFloor", stat: "health", amount: effect.amount, minimum: effect.minimum }]] }, context, "choice-target"); },
  reduceStatFloor(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); const base = effect.stat === "attack" ? target.atk || 0 : target.hp || 1, existing = (target.modifiers || []).reduce((sum, item) => sum + (effect.stat === "attack" ? item.attack || 0 : item.health || 0), 0), reduction = Math.min(effect.amount || 0, Math.max(0, base + existing - (effect.minimum || 1))); defaultEffectHandlers.modifyStats(state, { type: "modifyStats", attack: effect.stat === "attack" ? -reduction : 0, health: effect.stat === "health" ? -reduction : 0, duration: "permanent" }, context); },
  resolveLastSpellElement(state, effect, context) { const entry = player(state, context.owner), element = entry.lastSpellElement; if (element === "Terra") defaultEffectHandlers.draw(state, { type: "draw", amount: 1 }, context); else if (element === "Água") defaultEffectHandlers.heal(state, { type: "heal", amount: 1, target: "controllerHero" }, context); else if (element === "Ar") defaultEffectHandlers.gainEnergy(state, { type: "gainEnergy", amount: 1, destination: "main" }, context); else if (element === "Fogo") queueDecision(state, { choices: [], target: "anyCharacter", selections: 1, amount: 1 }, context, "element-damage-target"); },
  repeatLastSpell(state, effect, context) { const entry = player(state, context.owner); if (entry.lastSpellEffects) for (const nested of entry.lastSpellEffects) applyEffect(state, nested, context); },
  damageHeroFromTurnDeaths(state, effect, context) { const amount = player(state, context.owner).turnDeaths || 0; defaultEffectHandlers.damage(state, { type: "damage", amount }, { ...context, targetIds: ["enemy-hero"] }); },
  resurrectByDoubleMarkerCost(state, effect, context) { const source = findUnit(state, context.sourceId), entry = player(state, context.owner); const eligible = entry.grave.filter((card) => card.type === effect.cardType && (card.cost || 0) * 2 <= markerTotal(source)); if (!eligible.length) throw new RulesViolation("ability-not-available"); queueDecision(state, { ...effect, choices: eligible.map((card) => card.uid || card.id) }, context, "grave-resurrect"); },
  healFromMarkersRemoved(state, effect, context) { const entry = player(state, context.owner); entry.life = Math.min(entry.maxLife ?? 30, entry.life + (context.markerAmount || 0)); },
  moveCardsFromHandToDeckBottom(state, effect, context) { queueDecision(state, effect, context, "hand-to-deck-bottom"); },
  moveMarker(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); const key = effect.marker || "action"; setMarker(target, key, (typeof target.markers === "object" ? target.markers[key] || 0 : target.markers || 0) + (effect.amount || 1)); },
  consolidateMarkersAndDamage(state, effect, context) { const entry = player(state, context.owner); const source = findUnit(state, context.sourceId); if (!source) return; let moved = 0; for (const card of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) { if (card === source) continue; const amount = typeof card.markers === "number" ? card.markers : Object.values(card.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0); moved += amount; card.markers = typeof card.markers === "number" ? 0 : {}; } setMarker(source, effect.marker || "action", markerTotal(source) + moved); player(state, 1 - context.owner).life -= Math.floor(markerTotal(source) / (effect.divisor || 3)); },
  grantKeyword(state, effect, context) { const targets = effectTargets(state, effect, context); if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { if (effect.subtype && !hasSubtype(target, effect.subtype)) throw new RulesViolation("invalid-target-subtype"); const keyword = effect.keyword || effect.raw; const zone = effect.duration === "turn" ? "temporaryTags" : "grantedKeywords"; target[zone] ||= []; if (keyword && !target[zone].includes(keyword)) target[zone].push(keyword); } },
  keyword(state, effect, context) { const source = findUnit(state, context.sourceId); const target = source?.attachedTo ? findUnit(state, source.attachedTo) : source; const keyword = effect.keyword || effect.raw; if (target && keyword) { const zone = effect.duration === "turn" ? "temporaryTags" : "tags"; target[zone] ||= []; if (!target[zone].includes(keyword)) target[zone].push(keyword); if (/investida/i.test(String(keyword))) target.summoning = false; } },
  loseLife(state, effect, context) { const owner = effect.target === "spellControllerHero" ? context.event?.owner ?? context.owner : context.owner; const amount = effect.amount ?? 0; const entry = player(state, owner); entry.life -= amount; entry.lifeLostThisTurn = (entry.lifeLostThisTurn || 0) + amount; entry.lifeLossEvents = (entry.lifeLossEvents || 0) + 1; if (entry.heroId === "saymon") entry.heroXP = (entry.heroXP || 0) + 1; queueEvent(state, { type: "onLifeLost", owner, sourceOwner: context.owner, sourceId: context.sourceId, amount, paidAsCost: false }); },
  nextCreaturePaysLife(state, effect, context) { player(state, context.owner).nextCreaturePaysLife = true; },
  graveReplacement(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.graveDestination = effect.destination || "obscuro"; },
  increaseVitality(state, effect, context) { const id = context.targetIds?.[0]; const owner = heroOwner(context, id); if (owner != null) { const entry = player(state, owner); entry.maxLife = (entry.maxLife ?? 30) + (effect.amount ?? 0); entry.life += effect.amount ?? 0; } else defaultEffectHandlers.modifyStats(state, { type: "modifyStats", health: effect.amount, duration: effect.duration }, context); },
  toggleTap(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.exhausted = !target.exhausted; },
  grantDamageShield(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damageShields ||= []; target.damageShields.push({ uses: effect.uses ?? 1, sourceId: context.sourceId }); },
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
    const copy = { ...structuredClone(base), uid: `${base.id}-image-${state.round}-${state.nextGeneratedId}`, generatedImage: true, imageCard: true, enteredRound: state.round, attackedThisTurn: false, summoning: false, exhausted: false, damage: 0, slot: context.slot ?? 0, abilities: base.abilities || [] };
    if (effect.destination === "hand") { entry.hand.push(copy); return; }
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
  resurrect(state, effect, context) { const entry = player(state, context.owner); if (effect.choose && !context.selectedCardId) { const choices = entry.grave.filter((card) => card.type === effect.cardType && (effect.maxCost == null || card.cost <= effect.maxCost) && (!effect.subtype || hasSubtype(card, effect.subtype))).map((card) => card.uid || card.id); if (!choices.length) throw new RulesViolation("card-choice-required"); queueDecision(state, { ...effect, choices }, context, "zone-card"); return; } const index = entry.grave.findIndex((card) => card.type === effect.cardType && (effect.cost == null || card.cost === effect.cost) && (effect.maxCost == null || card.cost <= effect.maxCost) && (!effect.subtype || hasSubtype(card, effect.subtype)) && (!context.selectedCardId || card.id === context.selectedCardId || card.uid === context.selectedCardId)); if (index < 0) { if (!effect.optional) throw new RulesViolation("card-choice-required"); return; } const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)); if (openSlot == null) throw new RulesViolation("creature-zone-full"); const card = entry.grave.splice(index, 1)[0]; const copy = { ...card, uid: `${card.id}-${state.round}-resurrected`, enteredRound: state.round, attackedThisTurn: false, damage: 0, exhausted: false, summoning: true, slot: context.slot != null && !entry.board.some((unit) => unit.slot === context.slot) ? context.slot : openSlot }; context.resurrectedId = copy.uid; entry.board.push(copy); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: copy.uid, cardId: copy.uid, card: copy }); queueEvent(state, { type: "onCreatureEnter", owner: context.owner, sourceId: copy.uid, cardId: copy.uid, card: copy }); },
  returnSelfToField(state, effect, context) { const entry = player(state, context.owner); const index = entry.grave.findIndex((card) => card.uid === context.sourceId || card.id === context.sourceId); const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)); if (index >= 0 && openSlot != null) { const copy = { ...entry.grave.splice(index, 1)[0], enteredRound: state.round, attackedThisTurn: false, damage: 0, exhausted: false, summoning: false, slot: openSlot }; entry.board.push(copy); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); queueEvent(state, { type: "onCreatureEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); } },
  returnSelfToHand(state, effect, context) { const removed = removeFromZones(state, context.sourceId); if (removed) player(state, removed.owner).hand.push(removed.card); },
  moveSelf(state, effect, context) { const removed = removeFromZones(state, context.sourceId); if (!removed) return; const entry = player(state, removed.owner); if (effect.destination === "obscuro") entry.obscuro.push(removed.card); else if (effect.destination === "grave") sendToPrintedGraveDestination(entry, removed.card); },
  moveTopToBottom(state, effect, context) { const owners = effect.target === "bothPlayers" ? [0, 1] : [context.owner]; for (const owner of owners) { const entry = player(state, owner); const card = entry.deck.shift(); if (card) entry.deck.push(card); } },
  investigate(state, effect, context) { const targetOwner = effect.target === "opponentDeck" ? 1 - context.owner : context.owner; const target = player(state, targetOwner); const viewed = target.deck.splice(0, Math.max(1, effect.amount || 1)); if (!viewed.length) return; const revealed = viewed.shift(); target.deck.unshift(revealed); const controller = player(state, context.owner); for (const archived of viewed) { if ((controller.archiveToGrave || 0) > 0) { controller.archiveToGrave--; target.grave.push({ ...archived, deathCause: "archived" }); } else target.deck.push(archived); } queueEvent(state, { type: "onInvestigate", owner: context.owner, targetOwner, sourceId: context.sourceId, card: revealed, amount: 1 }); queueEvent(state, { type: "onCardRevealed", owner: context.owner, targetOwner, sourceId: context.sourceId, card: revealed, cardType: revealed.type }); },
  opponentChoice(state, effect, context) { queueDecision(state, effect, { ...context, decisionOwner: 1 - context.owner }, "choice"); },
  controllerChoice(state, effect, context) { queueDecision(state, effect, context, "choice"); },
  openRepositionWindow(state, effect, context) { state.pendingReposition = { owners: [0, 1], confirmed: [], moveAttachments: true, sourceId: context.sourceId }; },
  forceAttack(state, effect, context) { queueDecision(state, effect, context, "forced-attack"); },
  replaySelectedAbility(state, effect, context) {
    const candidates = (player(state, context.owner).board || []).filter((card) => (!context.replayCandidateIds || context.replayCandidateIds.includes(card.uid || card.id)) && (!effect.selector?.type || card.type === effect.selector.type) && (card.abilities || []).some((ability) => ability.trigger === effect.trigger));
    if (!candidates.length) throw new RulesViolation("ability-not-available");
    queueDecision(state, { ...effect, choices: candidates.map((card) => [{ type: "selectFirstAct", id: card.uid || card.id, name: card.name }]) }, context, "replay-ability");
  },
  replayTopGraveAbility(state, effect, context) { const entry = player(state, context.owner); const top = entry.grave.at(-1); const found = top?.abilities?.find((candidate) => candidate.trigger === effect.trigger); if (!found || top.type !== effect.requireType) throw new RulesViolation("ability-not-available"); for (const nested of found.effects || []) applyEffect(state, nested, { ...context, sourceId: top.uid || top.id, effectSource: top }); },
  repeatDamageUntilDeaths(state, effect, context) { const ids = context.targetIds || []; if (ids.length !== effect.targets.perPlayer * 2) throw new RulesViolation("invalid-target-count"); let deaths = 0; for (let round = 0; round < 100 && deaths < effect.stopAfterDeaths; round++) { const alive = ids.map((id) => findUnit(state, id)).filter(Boolean); for (const target of alive) target.damage = (target.damage || 0) + effect.amount; for (const target of alive) { const hp = (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0); if (target.damage >= hp) { const removed = removeFromZones(state, target.uid); if (removed) { deaths++; if (!removed.card.generatedImage) player(state, removed.owner).grave.push({ ...removed.card, deathCause: "effect" }); } } } } },
  drawWithPenalty(state, effect, context) { const amount = Math.max(effect.min, Math.min(effect.max, context.amount ?? effect.max)); const entry = player(state, context.owner); let nonCreatures = 0; for (let i = 0; i < amount; i++) { const card = entry.deck.shift(); if (!card) break; entry.hand.push(card); if (card.type !== "Criatura") nonCreatures++; } entry.life -= nonCreatures * effect.penaltyPerNonCreature.amount; },
  costModifier(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push(effect); } },
  supportAura(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; if (!source.staticModifiers.some((item) => item.type === "supportAura" && item.keyword === effect.keyword && item.attack === effect.attack && item.health === effect.health)) source.staticModifiers.push(effect); } },
  conditionalStats(state, effect, context) { const ids = selectedIds(context); const targets = ids.length ? ids.map((id) => findUnit(state, id)) : [findUnit(state, context.sourceId)]; if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { const modifier = effect.alternate && target.name === effect.alternate.targetName ? effect.alternate : effect; target.modifiers ||= []; target.modifiers.push({ attack: modifier.attack || 0, health: modifier.health || 0, duration: effect.duration || "permanent", condition: effect.condition }); } },
  attachedStats(state, effect, context) { const source = findUnit(state, context.sourceId); const target = findUnit(state, source?.attachedTo); if (target) defaultEffectHandlers.modifyStats(state, { ...effect, type: "modifyStats", duration: "attached" }, { ...context, targetIds: [target.uid] }); },
  countedChoice(state, effect, context) { const source = findUnit(state, context.sourceId); const count = source?.[effect.counter] || 0; const branch = effect.branches.find((candidate) => count >= candidate.min && (candidate.max == null || count <= candidate.max)); for (const nested of branch?.effects || []) applyEffect(state, nested, { ...context, count }); },
  damageHeroPerCount(state, effect, context) { player(state, context.owner).life -= (context.count || 0) * effect.amount; },
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
  copyStrongestAllyStats(state, effect, context) { const entry = player(state, context.owner); const source = findUnit(state, context.sourceId); const strongest = entry.board.filter((unit) => unit !== source).sort((a, b) => (b.atk || 0) - (a.atk || 0))[0]; if (source && strongest) { source.dynamicStats = { sourceId: strongest.uid, bothFromAttack: true }; } },
  controllerLifeThresholdStats(state, effect, context) { if (player(state, context.owner).life <= effect.lifeAtMost) defaultEffectHandlers.modifyStats(state, effect, context); },
  snapshotStats(state, effect, context) { const entry = player(state, context.owner); const source = findUnit(state, context.sourceId); const count = entry.board.filter((unit) => unit !== source && hasSubtype(unit, effect.attackPerOtherSubtype.subtype)).length; if (source) defaultEffectHandlers.modifyStats(state, { type: "modifyStats", attack: count * effect.attackPerOtherSubtype.amount, duration: "permanent" }, { ...context, targetIds: [source.uid] }); },
  search(state, effect, context) { queueDecision(state, effect, context, "search"); },
  replaceFirstAct(state, effect, context) { const source = findUnit(state, context.sourceId); if (!source) return; source.abilities = (source.abilities || []).filter((ability) => ability.trigger !== "onEnter"); source.abilities.push({ id: `${source.id || source.uid}-replacement-first-act`, trigger: "onEnter", costs: [], effects: effect.effects || [] }); source.firstActReplaced = true; },
  replayAbility(state, effect, context) { queueDecision(state, effect, context, "replay-ability"); },
  recruitFirstActOnLeave(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push({ type: "recruitFirstActOnLeave" }); } },
  doubleRecruitFirstAct(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push({ type: "doubleRecruitFirstAct" }); } },
  doubleNextNamedEffect(state, effect, context) { player(state, context.owner).replacementEffects ||= []; player(state, context.owner).replacementEffects.push(effect); },
  copyEventEffect(state, effect, context) { if (context.event?.effect) applyEffect(state, context.event.effect, { ...context, targetIds: [context.sourceId] }); },
  allowSubtypeInZone(state, effect) { state.globalRules ||= []; state.globalRules.push(effect); },
  attackPermission(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) source.attackPermission = effect; },
  removeMarkersFromConstants(state, effect, context) { queueDecision(state, effect, context, "remove-markers-from-constants"); },
  playCondition() {},
  availability() {},
  unsupported() { throw new RulesViolation("unsupported-effect", "Card effect has not been migrated to a primitive"); },
});

export function applyEffect(state, effect, context, handlers = defaultEffectHandlers) {
  const handler = handlers[effect.type]; if (!handler) throw new RulesViolation("unknown-effect", `Unknown effect: ${effect.type}`);
  handler(state, effect, context); return state;
}
