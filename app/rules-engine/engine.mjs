import { applyEffect, defaultEffectHandlers, RulesViolation } from "./effects.mjs";
import { hasSubtype } from "./subtypes.mjs";
import { isValidTarget, targetPolicy, TargetScope } from "./targeting.mjs";

export class RulesLoopError extends Error {
  constructor(message, trace) { super(message); this.name = "RulesLoopError"; this.trace = trace; }
}

const INTERACTIVE_EFFECTS = new Set(["investigate", "opponentChoice", "controllerChoice", "forceAttack", "replaySelectedAbility", "replayTopGraveAbility", "search", "replayAbility", "additionalTargetCost", "optionalRedirect", "optionalDrawFrom", "removeMarkersFromConstants"]);
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
    if (cost.type === "tap") { const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === context.sourceId); if (!source || source.exhausted || source.summoning) throw new RulesViolation("cannot-tap"); }
    if (cost.type === "removeMarkers") { const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); const available = typeof source?.markers === "number" ? source.markers : Object.values(source?.markers || {}).reduce((sum, value) => sum + Number(value), 0); if (cost.amount !== "X" && available < cost.amount) throw new RulesViolation("not-enough-markers"); }
    if (cost.type === "sacrifice") { const ids = [...new Set(context.sacrificeIds || [])]; if (ids.length < cost.amount || ids.some((id) => !entry.board.some((unit) => unit.uid === id))) throw new RulesViolation("sacrifice-required"); }
    if (cost.type === "energy" && entry.energy + entry.reserve < cost.amount) throw new RulesViolation("not-enough-energy");
    if (cost.type === "life" && entry.life <= cost.amount) throw new RulesViolation("not-enough-life");
    if (cost.type === "removeMarkersFromConstants") { const available = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].reduce((sum, card) => sum + (typeof card.markers === "number" ? card.markers : Object.values(card.markers || {}).reduce((total, value) => total + Number(value), 0)), 0); if (available < cost.amount) throw new RulesViolation("not-enough-markers"); }
  }
}

function payCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") applyEffect(state, { type: "tap" }, context);
    if (cost.type === "sacrifice") applyEffect(state, { type: "sacrifice" }, context);
    if (cost.type === "energy") { const reserve = Math.min(entry.reserve, cost.amount); entry.reserve -= reserve; entry.energy -= cost.amount - reserve; }
    if (cost.type === "life") entry.life -= cost.amount;
    if (cost.type === "removeMarkers") {
      const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); let remaining = cost.amount === "X" ? context.markerAmount || 0 : cost.amount;
      if (typeof source.markers === "number") source.markers -= Math.min(source.markers, remaining); else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; }
    }
    if (cost.type === "removeMarkersFromConstants") {
      let remaining = cost.amount; for (const source of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) { if (!remaining) break; if (typeof source.markers === "number") { const used = Math.min(source.markers, remaining); source.markers -= used; remaining -= used; } else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; } }
    }
  }
}

function modifierApplies(state, owner, modifier) { return modifier.condition !== "controllerTurn" || state.active === owner; }
function subtype(card, value) { return hasSubtype(card, value) || (card.tags || []).some((tag) => String(tag).toLowerCase() === String(value).toLowerCase()); }
function conditionMatches(state, source, owner, condition, event = {}) {
  if (!condition) return true;
  if (condition.cardsPlayedBeforeThisAtLeast != null && (state.players[owner].turnCardsPlayed || 0) < condition.cardsPlayedBeforeThisAtLeast) return false;
  if (condition.controllerTurn && state.active !== owner) return false;
  if (condition.all) return condition.all.every((item) => conditionMatches(state, source, owner, item, event));
  const eventCard = event.card || state.players.flatMap((entry) => [...entry.board, ...entry.support, ...entry.grave]).find((card) => card.uid === event.cardId || card.id === event.cardId);
  if (condition.eventCardSubtype && !subtype(eventCard || {}, condition.eventCardSubtype)) return false;
  if (condition.eventCardTypeNot && (eventCard?.type === condition.eventCardTypeNot || eventCard?.imageCard)) return false;
  if (condition.spellElement && !(event.card?.tags || eventCard?.tags || []).includes(condition.spellElement)) return false;
  if (condition.sourceSubtype && !subtype(event.source || {}, condition.sourceSubtype)) return false;
  if (condition.controllerSubtypeEnteredThisTurn && (state.players[owner].subtypesEnteredThisTurn?.[condition.controllerSubtypeEnteredThisTurn.subtype] || 0) !== condition.controllerSubtypeEnteredThisTurn.count) return false;
  if (condition.activePlayerControlsVanillaCreature && !state.players[state.active].board.some((card) => !(card.text || "").trim())) return false;
  if (condition.wasOnlySubtypeInAllFields && state.players.flatMap((entry) => entry.board).filter((card) => subtype(card, condition.wasOnlySubtypeInAllFields)).length > 0) return false;
  return true;
}

function usageKey(source, ability) { return `${source.uid || source.id}:${ability.id}`; }
function usageAvailable(state, source, owner, ability) { if (!ability.usageLimit && !ability.condition?.firstEachTurn) return true; return !(state.players[owner].abilityUses || {})[usageKey(source, ability)]; }
function claimUsage(state, source, owner, ability) { if (!ability.usageLimit && !ability.condition?.firstEachTurn) return; state.players[owner].abilityUses ||= {}; state.players[owner].abilityUses[usageKey(source, ability)] = (state.players[owner].abilityUses[usageKey(source, ability)] || 0) + 1; }

const permanentUnits = (entry) => [...(entry.board || []), ...(entry.support || []), ...(entry.terrain ? [entry.terrain] : [])];
const unitOwner = (state, id) => state.players.findIndex((entry) => permanentUnits(entry).some((unit) => unit.uid === id || unit.id === id));
const targetScope = (value) => ({ anyCharacter: TargetScope.ANY_CHARACTER, anyCreature: TargetScope.ANY_CREATURE, allyCreature: TargetScope.ALLY_CREATURE, enemyCreature: TargetScope.ENEMY_CREATURE, enemy: TargetScope.ENEMY_CREATURE, creature: TargetScope.ANY_CREATURE }[value] || TargetScope.NONE);
function abilityTargetSteps(ability) {
  if (ability.sourceText) return (targetPolicy(ability.sourceText).steps || []).filter((step) => step.role !== "sacrifice");
  return (ability.effects || []).flatMap((effect) => { const scope = targetScope(effect.target); return Array.from({ length: effect.selections ?? (scope === TargetScope.NONE ? 0 : 1) }, () => ({ scope, role: "effect" })); }).filter((step) => step.scope !== TargetScope.NONE);
}
function validateTargets(state, owner, abilities, command, source) {
  const targetIds = command.targetIds || []; const steps = abilities.flatMap(abilityTargetSteps); if (steps.length !== targetIds.length) { if (steps.length || targetIds.length) throw new RulesViolation("invalid-target-count"); return; }
  steps.forEach((step, index) => { const id = targetIds[index]; const hero = /^(?:ally|enemy|controller)-hero$|^hero-[01]$/.test(id || ""); const targetOwner = hero ? (id === "enemy-hero" ? 1 - owner : id === "ally-hero" || id === "controller-hero" ? owner : Number(id.slice(-1))) : unitOwner(state, id); if (targetOwner < 0 || !isValidTarget(step, owner, targetOwner, hero ? "hero" : "creature")) throw new RulesViolation("invalid-target"); const target = hero ? null : permanentUnits(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id); const barrier = target && [...(target.tags || []), ...(target.grantedKeywords || [])].some((tag) => /barreira m[aá]gica/i.test(String(tag))); if (barrier && !/ignora.*barreira m[aá]gica/i.test(source?.text || "")) throw new RulesViolation("magic-barrier"); });
}
function cleanupLethal(state, stack) {
  state.players.forEach((entry, owner) => { for (const unit of [...entry.board]) { const modifiers = (unit.modifiers || []).filter((item) => modifierApplies(state, owner, item)).reduce((sum, item) => sum + (item.health || 0), 0); const indestructible = [...(unit.tags || []), ...(unit.grantedKeywords || [])].some((tag) => /indestrutivel/i.test(String(tag))); if ((unit.damage || 0) < (unit.hp || 1) + modifiers || indestructible) continue; entry.board.splice(entry.board.indexOf(unit), 1); const attachments = entry.support.filter((card) => card.attachedTo === unit.uid); entry.support = entry.support.filter((card) => card.attachedTo !== unit.uid); for (const attachment of attachments) { if (attachment.page === 154) entry.obscuro.push(attachment); else if (!attachment.generatedImage && !attachment.imageCard) entry.grave.push(attachment); } if (!unit.generatedImage && !unit.imageCard) entry.grave.push({ ...unit, deathCause: "effect" }); if (!unit.suppressDeathTrigger) stack.push({ kind: "event", event: { type: "onDestroyed", owner, sourceId: unit.uid, cardId: unit.uid, card: unit, deathCause: "effect" } }); stack.push({ kind: "event", event: { type: "onCreatureDestroyed", owner, cardId: unit.uid, card: unit } }); } });
}

function activeAbilities(state, event) {
  const result = [];
  if (["onDestroyed", "onCreatureEnter"].includes(event.type) && event.card && subtype(event.card, "Recruta")) state.players.forEach((entry, owner) => {
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
      for (const ability of source.abilities || []) if (ability.trigger === event.type && (!["onEnter", "onDestroyed"].includes(event.type) || source.uid === event.sourceId) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) result.push({ source, owner, ability });
    }
  });
  return result.sort((a, b) => a.owner - b.owner || (a.source.slot ?? 99) - (b.source.slot ?? 99) || String(a.ability.id).localeCompare(String(b.ability.id)));
}

export function executeCommand(inputState, command, options = {}) {
  const state = clone(inputState); const maxSteps = options.maxSteps ?? 512; const maxRepeats = options.maxRepeats ?? 4; const handlers = { ...defaultEffectHandlers, ...(options.handlers || {}) }; let actionLabel = command.type;
  const stack = [{ kind: "command", command }]; const trace = []; const repeats = new Map(); let steps = 0;
  while (stack.length) {
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
          state.pendingResponse = null; state.pendingAction = null;
          if (original) stack.push({ kind: "command", command: { ...original, skipPriority: true } });
        }
      } else if (options.priority && ["attack", "activate"].includes(item.command.type) && !item.command.skipPriority && !item.command.hasPriority) {
        if (state.pendingAction) throw new RulesViolation("priority-window-open");
        state.pendingAction = { ...item.command }; state.pendingResponse = { responder: 1 - item.command.owner, actor: item.command.owner, action: item.command.type, passes: 0 }; continue;
      } else if (item.command.type === "playCard") {
        if (options.priority && !item.command.skipPriority && !item.command.hasPriority) {
          if (state.pendingAction) throw new RulesViolation("priority-window-open");
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
        const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay" && conditionMatches(state, card, item.command.owner, ability.condition, { card })); const enterAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onEnter" && conditionMatches(state, card, item.command.owner, ability.condition, { card }));
        if (card.type !== "Criatura" || (item.command.targetIds || []).length) validateTargets(state, item.command.owner, card.type === "Criatura" ? enterAbilities : playAbilities, item.command, card);
        for (const ability of playAbilities) validateCosts(state, ability, item.command);
        const staticDiscount = permanentUnits(entry).flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type)).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
        const cost = Math.max(0, (card.cost || 0) + (card.costModifier || 0) + staticDiscount); const spell = card.type === "Feitiço";
        if (entry.energy + (spell ? entry.reserve : 0) < cost) throw new RulesViolation("not-enough-energy");
        for (const ability of playAbilities) payCosts(state, ability, item.command);
        const fromReserve = spell ? Math.min(entry.reserve, cost) : 0; entry.reserve -= fromReserve; entry.energy -= cost - fromReserve;
        entry.hand.splice(cardIndex, 1); entry.cardsPlayed = (entry.cardsPlayed || 0) + 1; entry.turnCardsPlayed = (entry.turnCardsPlayed || 0) + 1; if (spell) { entry.spellsPlayed = (entry.spellsPlayed || 0) + 1; entry.turnSpellsPlayed = (entry.turnSpellsPlayed || 0) + 1; } const permanent = card.type !== "Feitiço" || card.abilities?.some((ability) => ability.effects?.some((effect) => effect.type === "remainUntilTurnEnd"));
        if (permanent) {
          const unit = { ...card, uid: item.command.instanceId || `${card.id}-${state.round}-${steps}`, slot: item.command.slot ?? 0, damage: 0, bonusAtk: 0, bonusHp: 0, exhausted: false, summoning: card.type === "Criatura" && !(card.tags || []).some((tag) => /investida/i.test(String(tag))), frozen: false, stunned: false, suffocated: false, immobilized: false, defenseUses: 0, markers: card.markers ?? 0, modifiers: [] };
          if (card.type === "Criatura") { if (entry.board.length >= 5 || entry.board.some((existing) => existing.slot === unit.slot)) throw new RulesViolation("creature-zone-full"); entry.board.push(unit); entry.subtypesEnteredThisTurn ||= {}; for (const value of new Set([...(card.subtypes || []), ...(card.tags || [])])) entry.subtypesEnteredThisTurn[value] = (entry.subtypesEnteredThisTurn[value] || 0) + 1; stack.push({ kind: "event", event: { type: "onCreatureEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit } }); }
          else if (card.type === "Terreno") { if (entry.terrain && !entry.terrain.generatedImage) entry.grave.push(entry.terrain); entry.terrain = unit; }
          else { if (entry.support.length >= 5 || entry.support.some((existing) => existing.slot === unit.slot)) throw new RulesViolation("support-zone-full"); if (card.type === "Artefato") { const attached = entry.board.find((creature) => creature.uid === item.command.attachedTo); if (!attached && card.page !== 304) throw new RulesViolation("artifact-target-required"); if (attached) { if (entry.support.some((artifact) => artifact.attachedTo === attached.uid)) throw new RulesViolation("artifact-target-required"); unit.attachedTo = attached.uid; unit.slot = attached.slot; } } entry.support.push(unit); }
          const enter = (unit.abilities || []).filter((ability) => ability.trigger === "onEnter");
          for (const ability of enter.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid } });
          const staticAbilities = (unit.abilities || []).filter((ability) => ability.trigger === "static");
          for (const ability of staticAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid } });
        } else entry.grave.push(card);
        for (const ability of playAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: card.id } });
        stack.push({ kind: "event", event: { type: spell ? "onSpellCast" : "onCardPlayed", owner: item.command.owner, cardId: card.id, card } });
      } else if (item.command.type === "attack") {
        if (state.active !== item.command.owner || state.phase !== "combate") throw new RulesViolation("wrong-combat-priority");
        const attackerPlayer = state.players[item.command.owner]; const defenderPlayer = state.players[1 - item.command.owner];
        const attacker = attackerPlayer.board.find((unit) => unit.uid === item.command.attackerId); if (!attacker || attacker.exhausted || attacker.summoning || attacker.stunned) throw new RulesViolation("invalid-attacker"); actionLabel = attacker.name || attacker.uid;
        const vigilant = [...(attacker.tags || []), ...(attacker.grantedKeywords || [])].some((tag) => /alerta/i.test(String(tag))); if (!vigilant) attacker.exhausted = true; const attack = Math.max(0, (attacker.atk || 0) + (attacker.modifiers || []).filter((value) => modifierApplies(state, item.command.owner, value)).reduce((sum, value) => sum + (value.attack || 0), 0));
        const defender = defenderPlayer.board.find((unit) => unit.uid === item.command.defenderId);
        if (!defender) defenderPlayer.life -= attack;
        else {
          if (defender.exhausted || defender.stunned || defender.cannotDefend) throw new RulesViolation("invalid-defender");
          const attackerFlying = [...(attacker.tags || []), ...(attacker.grantedKeywords || [])].some((tag) => /voar/i.test(String(tag))); const defenderFlying = [...(defender.tags || []), ...(defender.grantedKeywords || [])].some((tag) => /voar/i.test(String(tag))); if (attackerFlying && !defenderFlying) throw new RulesViolation("flying-blocker-required");
          const counter = Math.max(0, (defender.atk || 0) + (defender.modifiers || []).filter((value) => modifierApplies(state, 1 - item.command.owner, value)).reduce((sum, value) => sum + (value.attack || 0), 0));
          defender.damage = (defender.damage || 0) + attack; attacker.damage = (attacker.damage || 0) + counter;
          cleanupLethal(state, stack);
        }
        stack.push({ kind: "event", event: { type: "onCombatDamage", owner: item.command.owner, sourceId: attacker.uid, targetIds: defender ? [defender.uid] : [] } });
      } else if (item.command.type === "activate") {
        const entry = state.players[item.command.owner]; if (state.active !== item.command.owner) throw new RulesViolation("not-your-turn");
        const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === item.command.sourceId); const ability = source?.abilities?.find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated");
        if (!ability) throw new RulesViolation("ability-not-found"); if (!canExecuteCard(source, handlers)) throw new RulesViolation("card-not-migrated"); actionLabel = source.name || source.uid; if (!usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-limit-reached"); validateTargets(state, item.command.owner, [ability], item.command, source); validateCosts(state, ability, item.command); payCosts(state, ability, item.command); claimUsage(state, source, item.command.owner, ability);
        [...ability.effects].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));
      } else if (item.command.type === "resolveDecision") {
        const decision = state.pendingDecision; if (!decision || decision.owner !== item.command.owner && decision.context?.decisionOwner !== item.command.owner) throw new RulesViolation("decision-not-owned");
        state.pendingDecision = null; const chosen = decision.effect.choices?.[item.command.choiceIndex] || decision.effect.replayEffects || [];
        for (const effect of [...chosen].reverse()) stack.push({ kind: "effect", effect, context: { ...decision.context, ...item.command } });
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
        if (state.pendingDecision || state.pendingReposition) throw new RulesViolation("interaction-pending"); const order = ["manutencao", "principal", "combate", "fim"]; const index = order.indexOf(state.phase); state.phase = order[(index + 1) % order.length]; if (state.phase === "fim") stack.push({ kind: "event", event: { type: "onTurnEnd", owner: state.active } }); if (state.phase === "combate") stack.push({ kind: "event", event: { type: "onCombatStart", owner: state.active } }); if (state.phase === "manutencao") { state.active = 1 - state.active; state.round += 1; const entry = state.players[state.active]; entry.abilityUses = {}; entry.subtypesEnteredThisTurn = {}; entry.turnCardsPlayed = 0; entry.turnSpellsPlayed = 0; stack.push({ kind: "event", event: { type: "onMaintenance", owner: state.active } }); }
      } else throw new RulesViolation("unknown-command");
    } else if (item.kind === "effect") {
      applyEffect(state, item.effect, item.context, handlers);
      cleanupLethal(state, stack);
      for (const event of (state.rulesEvents || []).splice(0).reverse()) stack.push({ kind: "event", event });
      stack.push({ kind: "event", event: { type: `after:${item.effect.type}`, owner: item.context.owner, sourceId: item.context.sourceId } });
    } else if (item.kind === "event") {
      const triggered = activeAbilities(state, item.event); for (const trigger of triggered.reverse()) { claimUsage(state, trigger.source, trigger.owner, trigger.ability); for (const effect of [...trigger.ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { owner: trigger.owner, sourceId: trigger.ability.replaySourceId || trigger.source.uid, event: item.event, targetIds: item.event.targetIds || [] } }); }
    }
  }
  state.events = (state.events || 0) + 1; state.log ||= []; state.log.unshift({ id: `rules-${state.round}-${state.events}`, text: command.type === "playCard" ? `${actionLabel} foi jogada pelo motor de regras.` : command.type === "activate" ? `${actionLabel} ativou sua habilidade.` : `${actionLabel}: ${command.type}.`, tone: "effect" });
  if (["playCard", "activate"].includes(command.type)) if (!command.skipPriority && state.pendingAction && command.hasPriority) state.pendingResponse = { responder: state.pendingAction.actor, actor: command.owner, action: actionLabel, passes: 0 }; else if (!command.skipPriority && !state.pendingAction) state.pendingResponse = command.hasPriority ? null : { responder: 1 - command.owner, actor: command.owner, action: actionLabel, passes: 0 };
  return { state, trace, steps };
}
