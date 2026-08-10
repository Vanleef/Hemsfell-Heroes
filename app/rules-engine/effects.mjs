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
const queueDecision = (state, effect, context, kind = effect.type) => { if (state.pendingDecision) throw new RulesViolation("decision-pending"); state.pendingDecision = { kind, effect, context, owner: context.owner }; };
const removeFromZones = (state, id) => {
  for (const entry of state.players) for (const zone of ["board", "support"]) {
    const index = (entry[zone] || []).findIndex((card) => card.uid === id || card.id === id);
    if (index >= 0) {
      const card = entry[zone].splice(index, 1)[0];
      if (zone === "board") {
        const attachments = (entry.support || []).filter((item) => item.attachedTo === card.uid);
        entry.support = (entry.support || []).filter((item) => item.attachedTo !== card.uid);
        for (const attachment of attachments) entry.grave.push({ ...attachment, deathCause: "detached" });
      }
      return { card, owner: state.players.indexOf(entry), zone };
    }
  }
  return null;
};

export const defaultEffectHandlers = Object.freeze({
  draw(state, effect, context) {
    const entry = player(state, context.owner); let amount = effect.amount ?? 1;
    while (amount-- > 0) { const card = entry.deck.shift(); if (!card) { entry.deckOut = true; break; } entry.hand.push(card); }
  },
  discard(state, effect, context) {
    const entry = player(state, context.owner); const amount = Math.min(effect.amount ?? 1, entry.hand.length);
    entry.grave.push(...entry.hand.splice(Math.max(0, entry.hand.length - amount), amount));
  },
  mill(state, effect, context) {
    const entry = player(state, effect.target === "enemy" ? 1 - context.owner : context.owner);
    entry.grave.push(...entry.deck.splice(0, effect.amount ?? 1));
  },
  damage(state, effect, context) {
    const ids = selectedIds(context); if (!ids.length) throw new RulesViolation("target-required");
    for (const targetId of ids) { const owner = heroOwner(context, targetId);
      if (owner != null) { const amount = Math.max(0, effect.amount ?? 0); player(state, owner).life -= amount; queueEvent(state, { type: "onPlayerDamaged", owner, sourceOwner: context.owner, sourceId: context.sourceId, amount }); continue; }
      const target = findUnit(state, targetId); if (!target) throw new RulesViolation("target-required");
      const shield = (target.damageShields || []).find((item) => item.uses > 0); if (shield) { shield.uses--; target.damageShields = target.damageShields.filter((item) => item.uses > 0); continue; }
      const robust = [...(target.tags || []), ...(target.grantedKeywords || [])].some((tag) => /robusto/i.test(String(tag))) ? 1 : 0;
      const amount = Math.max(0, (effect.amount ?? 0) + (effect.additionalIfExhausted && target.exhausted ? effect.additionalIfExhausted : 0) - robust); target.damage = (target.damage || 0) + amount; queueEvent(state, { type: "onDamageTaken", targetId, sourceOwner: context.owner, sourceId: context.sourceId, amount });
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
    for (const id of effect.target === "all" ? allUnits(state).map((unit) => unit.uid || unit.id) : context.targetIds || []) {
      const removed = removeFromZones(state, id); if (removed) { if (!removed.card.generatedImage && !removed.card.imageCard) player(state, removed.owner).grave.push({ ...removed.card, lastZone: removed.zone, deathCause: "destroy" }); queueEvent(state, { type: "onDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id, sourceId: removed.card.uid || removed.card.id, deathCause: "destroy" }); queueEvent(state, { type: "onCreatureDestroyed", owner: removed.owner, card: removed.card, cardId: removed.card.uid || removed.card.id }); }
    }
  },
  sacrifice(state, effect, context) {
    for (const id of context.sacrificeIds || []) { const removed = removeFromZones(state, id); if (removed) player(state, removed.owner).grave.push({ ...removed.card, lastZone: removed.zone, deathCause: "sacrifice", suppressDeathTrigger: true }); }
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
  modifyStats(state, effect, context) { const ids = selectedIds(context); const source = findUnit(state, context.sourceId); const attached = source?.attachedTo ? findUnit(state, source.attachedTo) : null; const targets = ids.length ? ids.map((id) => findUnit(state, id)) : [attached || source]; if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { target.modifiers ||= []; target.modifiers.push({ attack: effect.attack || 0, health: effect.health || 0, duration: effect.duration || "permanent" }); } },
  gainEnergy(state, effect, context) { const entry = player(state, context.owner); const key = effect.destination === "reserve" ? "reserve" : "energy"; const cap = key === "reserve" ? 3 : entry.maxEnergy; entry[key] = Math.min(cap, entry[key] + (effect.amount ?? 0)); },
  grantKeyword(state, effect, context) { const ids = selectedIds(context); const source = findUnit(state, context.sourceId); const attached = source?.attachedTo ? findUnit(state, source.attachedTo) : null; const targets = ids.length ? ids.map((id) => findUnit(state, id)) : [attached || source]; if (targets.some((target) => !target)) throw new RulesViolation("target-required"); for (const target of targets) { target.grantedKeywords ||= []; target.grantedKeywords.push(effect.raw || effect.keyword); } },
  keyword(state, effect, context) { const source = findUnit(state, context.sourceId); const target = source?.attachedTo ? findUnit(state, source.attachedTo) : source; const keyword = effect.keyword || effect.raw; if (target && keyword) { target.tags ||= []; if (!target.tags.includes(keyword)) target.tags.push(keyword); } },
  loseLife(state, effect, context) { const owner = effect.target === "spellControllerHero" ? context.event?.owner ?? context.owner : context.owner; const amount = effect.amount ?? 0; player(state, owner).life -= amount; queueEvent(state, { type: "onLifeLost", owner, sourceOwner: context.owner, sourceId: context.sourceId, amount }); },
  increaseVitality(state, effect, context) { const id = context.targetIds?.[0]; const owner = heroOwner(context, id); if (owner != null) { const entry = player(state, owner); entry.maxLife = (entry.maxLife ?? 30) + (effect.amount ?? 0); entry.life += effect.amount ?? 0; } else defaultEffectHandlers.modifyStats(state, { type: "modifyStats", health: effect.amount, duration: effect.duration }, context); },
  toggleTap(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.exhausted = !target.exhausted; },
  grantDamageShield(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damageShields ||= []; target.damageShields.push({ uses: effect.uses ?? 1, sourceId: context.sourceId }); },
  removeMarker(state, effect, context) { const target = findUnit(state, context.sourceId); if (!target || markerTotal(target) < effect.amount) throw new RulesViolation("not-enough-markers"); const current = typeof target.markers === "object" ? target.markers[effect.marker] || 0 : target.markers; setMarker(target, effect.marker || "action", current - effect.amount); },
  doubleMarkers(state) { for (const target of allUnits(state)) { if (typeof target.markers === "number") target.markers *= 2; else for (const key of Object.keys(target.markers || {})) target.markers[key] *= 2; } },
  halveMaxEnergy(state, effect, context) { const entry = player(state, context.owner); entry.maxEnergy = Math.ceil(entry.maxEnergy / 2); entry.energy = Math.min(entry.energy, entry.maxEnergy); },
  retrieve(state, effect, context) { const entry = player(state, context.owner); const zone = entry[effect.zone] || []; const index = zone.findIndex((card) => (!effect.name || card.name === effect.name) && (!context.selectedCardId || card.id === context.selectedCardId)); if (index < 0) { if (!effect.optional) throw new RulesViolation("card-choice-required"); return; } entry[effect.destination].push(zone.splice(index, 1)[0]); },
  createImage(state, effect, context) { const entry = effect.destination === "activePlayerField" ? player(state, state.active) : player(state, context.owner); const catalog = [...(entry.extraDeck || []), ...(state.cardCatalog || [])]; const base = catalog.find((card) => card.name === effect.name) || { id: `image:${effect.name}`, name: effect.name, type: "Criatura", atk: 1, hp: 1, tags: [] }; const copy = { ...structuredClone(base), uid: `${base.id}-image-${state.round}-${Math.random().toString(36).slice(2)}`, generatedImage: true, imageCard: true, summoning: false, exhausted: false, damage: 0, slot: context.slot ?? entry.board.length, abilities: base.abilities || [] }; if (effect.destination === "hand") entry.hand.push(copy); else if (entry.board.length < 5) entry.board.push(copy); else if (effect.mandatory) queueDecision(state, effect, context, "replace-for-mandatory-image"); else throw new RulesViolation("field-full"); },
  resurrect(state, effect, context) { const entry = player(state, context.owner); const index = entry.grave.findIndex((card) => card.type === effect.cardType && card.cost === effect.cost && (!context.selectedCardId || card.id === context.selectedCardId)); if (index < 0) { if (!effect.optional) throw new RulesViolation("card-choice-required"); return; } const card = entry.grave.splice(index, 1)[0]; entry.board.push({ ...card, uid: `${card.id}-${state.round}-resurrected`, damage: 0, exhausted: false, summoning: true, slot: context.slot ?? entry.board.length }); },
  returnSelfToField(state, effect, context) { const entry = player(state, context.owner); const index = entry.grave.findIndex((card) => card.uid === context.sourceId || card.id === context.sourceId); if (index >= 0 && entry.board.length < 5) entry.board.push({ ...entry.grave.splice(index, 1)[0], damage: 0, exhausted: false, summoning: false }); },
  returnSelfToHand(state, effect, context) { const removed = removeFromZones(state, context.sourceId); if (removed) player(state, removed.owner).hand.push(removed.card); },
  moveSelf(state, effect, context) { const removed = removeFromZones(state, context.sourceId); if (!removed) return; const entry = player(state, removed.owner); if (effect.destination === "obscuro") entry.obscuro.push(removed.card); else if (effect.destination === "grave" && !removed.card.generatedImage) entry.grave.push(removed.card); },
  moveTopToBottom(state, effect, context) { const owners = effect.target === "bothPlayers" ? [0, 1] : [context.owner]; for (const owner of owners) { const entry = player(state, owner); const card = entry.deck.shift(); if (card) entry.deck.push(card); } },
  investigate(state, effect, context) { queueDecision(state, effect, context, "investigate"); },
  opponentChoice(state, effect, context) { queueDecision(state, effect, { ...context, decisionOwner: 1 - context.owner }, "choice"); },
  controllerChoice(state, effect, context) { queueDecision(state, effect, context, "choice"); },
  openRepositionWindow(state, effect, context) { state.pendingReposition = { owners: [0, 1], confirmed: [], moveAttachments: true, sourceId: context.sourceId }; },
  forceAttack(state, effect, context) { queueDecision(state, effect, context, "forced-attack"); },
  replaySelectedAbility(state, effect, context) { queueDecision(state, effect, context, "replay-ability"); },
  replayTopGraveAbility(state, effect, context) { const entry = player(state, context.owner); const top = entry.grave.at(-1); const found = top?.abilities?.find((candidate) => candidate.trigger === effect.trigger); if (!found || top.type !== effect.requireType) throw new RulesViolation("ability-not-available"); queueDecision(state, { ...effect, replayEffects: found.effects }, context, "replay-ability"); },
  repeatDamageUntilDeaths(state, effect, context) { const ids = context.targetIds || []; if (ids.length !== effect.targets.perPlayer * 2) throw new RulesViolation("invalid-target-count"); let deaths = 0; for (let round = 0; round < 100 && deaths < effect.stopAfterDeaths; round++) { const alive = ids.map((id) => findUnit(state, id)).filter(Boolean); for (const target of alive) target.damage = (target.damage || 0) + effect.amount; for (const target of alive) { const hp = (target.hp || 1) + (target.modifiers || []).reduce((sum, item) => sum + (item.health || 0), 0); if (target.damage >= hp) { const removed = removeFromZones(state, target.uid); if (removed) { deaths++; if (!removed.card.generatedImage) player(state, removed.owner).grave.push({ ...removed.card, deathCause: "effect" }); } } } } },
  drawWithPenalty(state, effect, context) { const amount = Math.max(effect.min, Math.min(effect.max, context.amount ?? effect.max)); const entry = player(state, context.owner); let nonCreatures = 0; for (let i = 0; i < amount; i++) { const card = entry.deck.shift(); if (!card) break; entry.hand.push(card); if (card.type !== "Criatura") nonCreatures++; } entry.life -= nonCreatures * effect.penaltyPerNonCreature.amount; },
  costModifier(state, effect, context) { const source = findUnit(state, context.sourceId); if (source) { source.staticModifiers ||= []; source.staticModifiers.push(effect); } },
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
  modifySelfCost(state, effect, context) { const entry = player(state, context.owner); const card = entry.hand.find((candidate) => candidate.id === context.sourceId); if (card) card.costModifier = (card.costModifier || 0) + effect.amount; },
  additionalTargetCost(state, effect, context) { queueDecision(state, effect, context, "additional-target-cost"); },
  optionalRedirect(state, effect, context) { queueDecision(state, effect, context, "redirect"); },
  optionalDrawFrom(state, effect, context) { queueDecision(state, effect, context, "draw-position"); },
  peekTop(state, effect, context) { state.peekedCards = [0, 1].map((owner) => player(state, owner).deck[0]?.id || null); },
  copyStrongestAllyStats(state, effect, context) { const entry = player(state, context.owner); const source = findUnit(state, context.sourceId); const strongest = entry.board.filter((unit) => unit !== source).sort((a, b) => (b.atk || 0) - (a.atk || 0))[0]; if (source && strongest) { source.dynamicStats = { sourceId: strongest.uid, bothFromAttack: true }; } },
  snapshotStats(state, effect, context) { const entry = player(state, context.owner); const source = findUnit(state, context.sourceId); const count = entry.board.filter((unit) => unit !== source && (unit.tags || []).includes(effect.attackPerOtherSubtype.subtype)).length; if (source) defaultEffectHandlers.modifyStats(state, { type: "modifyStats", attack: count * effect.attackPerOtherSubtype.amount, duration: "permanent" }, { ...context, targetIds: [source.uid] }); },
  search(state, effect, context) { queueDecision(state, effect, context, "search"); },
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
