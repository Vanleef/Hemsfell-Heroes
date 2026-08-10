import { applyEffect, defaultEffectHandlers, RulesViolation } from "./effects.mjs";

export class RulesLoopError extends Error {
  constructor(message, trace) { super(message); this.name = "RulesLoopError"; this.trace = trace; }
}

const clone = (value) => structuredClone(value);
const fingerprint = (state, stack) => JSON.stringify({ active: state.active, phase: state.phase, round: state.round, players: state.players.map((p) => ({ life: p.life, energy: p.energy, reserve: p.reserve, hand: p.hand.length, deck: p.deck.length, board: p.board.map((u) => [u.uid, u.damage, u.exhausted, u.markers]) })), stack: stack.map((item) => [item.kind, item.effect?.type, item.event?.type]) });

export function validateCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") { const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === context.sourceId); if (!source || source.exhausted || source.summoning) throw new RulesViolation("cannot-tap"); }
    if (cost.type === "removeMarkers") { const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); const available = Object.values(source?.markers || {}).reduce((sum, value) => sum + Number(value), 0); if (cost.amount !== "X" && available < cost.amount) throw new RulesViolation("not-enough-markers"); }
    if (cost.type === "sacrifice" && (context.sacrificeIds || []).length < cost.amount) throw new RulesViolation("sacrifice-required");
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
      for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; }
    }
    if (cost.type === "removeMarkersFromConstants") {
      let remaining = cost.amount; for (const source of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) { if (!remaining) break; if (typeof source.markers === "number") { const used = Math.min(source.markers, remaining); source.markers -= used; remaining -= used; } else for (const key of Object.keys(source.markers || {})) { const used = Math.min(source.markers[key], remaining); source.markers[key] -= used; remaining -= used; if (!remaining) break; } }
    }
  }
}

function subtype(card, value) { return (card.tags || []).some((tag) => String(tag).toLowerCase() === String(value).toLowerCase()); }
function conditionMatches(state, source, owner, condition, event = {}) {
  if (!condition) return true;
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

function activeAbilities(state, event) {
  const result = [];
  state.players.forEach((entry, owner) => {
    for (const source of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) {
      if (source.suffocated) continue;
      for (const ability of source.abilities || []) if (ability.trigger === event.type && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) result.push({ source, owner, ability });
    }
  });
  return result.sort((a, b) => a.owner - b.owner || (a.source.slot ?? 99) - (b.source.slot ?? 99) || String(a.ability.id).localeCompare(String(b.ability.id)));
}

export function executeCommand(inputState, command, options = {}) {
  const state = clone(inputState); const maxSteps = options.maxSteps ?? 512; const maxRepeats = options.maxRepeats ?? 4; const handlers = { ...defaultEffectHandlers, ...(options.handlers || {}) };
  const stack = [{ kind: "command", command }]; const trace = []; const repeats = new Map(); let steps = 0;
  while (stack.length) {
    if (++steps > maxSteps) throw new RulesLoopError(`Resolution exceeded ${maxSteps} steps`, trace);
    const key = fingerprint(state, stack); const count = (repeats.get(key) || 0) + 1; repeats.set(key, count); if (count > maxRepeats) throw new RulesLoopError("Repeated resolution state detected", trace);
    const item = stack.pop(); trace.push({ step: steps, kind: item.kind, type: item.command?.type || item.effect?.type || item.event?.type });
    if (item.kind === "command") {
      if (item.command.type === "playCard") {
        const entry = state.players[item.command.owner];
        const cardIndex = entry.hand.findIndex((card) => card.id === item.command.cardId);
        const card = entry.hand[cardIndex]; if (!card) throw new RulesViolation("card-not-in-hand");
        const accelerated = (card.tags || []).some((tag) => /acelerado/i.test(tag)) || /acelerado/i.test(card.text || "");
        if (state.active !== item.command.owner && !(accelerated && item.command.hasPriority)) throw new RulesViolation("not-your-priority");
        if (state.phase !== "principal" && !(accelerated && item.command.hasPriority)) throw new RulesViolation("wrong-phase");
        const staticDiscount = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].flatMap((source) => source.staticModifiers || []).filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type)).reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
        const cost = Math.max(0, (card.cost || 0) + (card.costModifier || 0) + staticDiscount); const spell = card.type === "Feitiço";
        if (entry.energy + (spell ? entry.reserve : 0) < cost) throw new RulesViolation("not-enough-energy");
        const fromReserve = spell ? Math.min(entry.reserve, cost) : 0; entry.reserve -= fromReserve; entry.energy -= cost - fromReserve;
        entry.hand.splice(cardIndex, 1); const permanent = card.type !== "Feitiço" || card.abilities?.some((ability) => ability.effects?.some((effect) => effect.type === "remainUntilTurnEnd"));
        if (permanent) {
          const unit = { ...card, uid: item.command.instanceId || `${card.id}-${state.round}-${steps}`, slot: item.command.slot ?? 0, damage: 0, exhausted: false, summoning: card.type === "Criatura", markers: {}, modifiers: [] };
          if (card.type === "Criatura") { if (entry.board.length >= 5) throw new RulesViolation("creature-zone-full"); entry.board.push(unit); }
          else if (card.type === "Terreno") entry.terrain = unit;
          else { if (entry.support.length >= 5) throw new RulesViolation("support-zone-full"); if (card.type === "Artefato") { const attached = entry.board.find((creature) => creature.uid === item.command.attachedTo); if (!attached || entry.support.some((artifact) => artifact.attachedTo === attached.uid)) throw new RulesViolation("artifact-target-required"); unit.attachedTo = attached.uid; unit.slot = attached.slot; } entry.support.push(unit); }
          const enter = (unit.abilities || []).filter((ability) => ability.trigger === "onEnter");
          for (const ability of enter.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid } });
          const staticAbilities = (unit.abilities || []).filter((ability) => ability.trigger === "static");
          for (const ability of staticAbilities.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid } });
        } else entry.grave.push(card);
        const play = (card.abilities || []).filter((ability) => ability.trigger === "onPlay");
        for (const ability of play.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: card.id } });
        stack.push({ kind: "event", event: { type: spell ? "onSpellCast" : "onCardPlayed", owner: item.command.owner, cardId: card.id } });
      } else if (item.command.type === "attack") {
        if (state.active !== item.command.owner || state.phase !== "combate") throw new RulesViolation("wrong-combat-priority");
        const attackerPlayer = state.players[item.command.owner]; const defenderPlayer = state.players[1 - item.command.owner];
        const attacker = attackerPlayer.board.find((unit) => unit.uid === item.command.attackerId); if (!attacker || attacker.exhausted || attacker.summoning || attacker.stunned) throw new RulesViolation("invalid-attacker");
        const vigilant = [...(attacker.tags || []), ...(attacker.grantedKeywords || [])].some((tag) => /alerta/i.test(String(tag))); if (!vigilant) attacker.exhausted = true; const attack = Math.max(0, (attacker.atk || 0) + (attacker.modifiers || []).reduce((sum, value) => sum + (value.attack || 0), 0));
        const defender = defenderPlayer.board.find((unit) => unit.uid === item.command.defenderId);
        if (!defender) defenderPlayer.life -= attack;
        else {
          if (defender.exhausted || defender.stunned || defender.cannotDefend) throw new RulesViolation("invalid-defender");
          const attackerFlying = [...(attacker.tags || []), ...(attacker.grantedKeywords || [])].some((tag) => /voar/i.test(String(tag))); const defenderFlying = [...(defender.tags || []), ...(defender.grantedKeywords || [])].some((tag) => /voar/i.test(String(tag))); if (attackerFlying && !defenderFlying) throw new RulesViolation("flying-blocker-required");
          const counter = Math.max(0, (defender.atk || 0) + (defender.modifiers || []).reduce((sum, value) => sum + (value.attack || 0), 0));
          defender.damage = (defender.damage || 0) + attack; attacker.damage = (attacker.damage || 0) + counter;
          const lethal = [[attacker, attackerPlayer], [defender, defenderPlayer]];
          for (const [unit, ownerEntry] of lethal) { const health = (unit.hp || 1) + (unit.modifiers || []).reduce((sum, value) => sum + (value.health || 0), 0); if (unit.damage >= health && !(unit.tags || []).some((tag) => /indestrutivel/i.test(tag))) { ownerEntry.board.splice(ownerEntry.board.indexOf(unit), 1); ownerEntry.grave.push({ ...unit, deathCause: "combat" }); } }
        }
        stack.push({ kind: "event", event: { type: "onCombatDamage", owner: item.command.owner, sourceId: attacker.uid, targetIds: defender ? [defender.uid] : [] } });
      } else if (item.command.type === "activate") {
        const entry = state.players[item.command.owner]; if (state.active !== item.command.owner) throw new RulesViolation("not-your-turn");
        const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === item.command.sourceId); const ability = source?.abilities?.find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated");
        if (!ability) throw new RulesViolation("ability-not-found"); if (!usageAvailable(state, source, item.command.owner, ability)) throw new RulesViolation("ability-limit-reached"); validateCosts(state, ability, item.command); payCosts(state, ability, item.command); claimUsage(state, source, item.command.owner, ability);
        [...ability.effects].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));
      } else if (item.command.type === "resolveDecision") {
        const decision = state.pendingDecision; if (!decision || decision.owner !== item.command.owner && decision.context?.decisionOwner !== item.command.owner) throw new RulesViolation("decision-not-owned");
        state.pendingDecision = null; const chosen = decision.effect.choices?.[item.command.choiceIndex] || decision.effect.replayEffects || [];
        for (const effect of [...chosen].reverse()) stack.push({ kind: "effect", effect, context: { ...decision.context, ...item.command } });
      } else if (item.command.type === "emit") stack.push({ kind: "event", event: item.command.event });
      else if (item.command.type === "advancePhase") {
        if (state.pendingDecision || state.pendingReposition) throw new RulesViolation("interaction-pending"); const order = ["manutencao", "principal", "combate", "fim"]; const index = order.indexOf(state.phase); state.phase = order[(index + 1) % order.length]; if (state.phase === "manutencao") { state.active = 1 - state.active; state.round += 1; const entry = state.players[state.active]; entry.abilityUses = {}; entry.subtypesEnteredThisTurn = {}; }
      } else throw new RulesViolation("unknown-command");
    } else if (item.kind === "effect") {
      applyEffect(state, item.effect, item.context, handlers);
      stack.push({ kind: "event", event: { type: `after:${item.effect.type}`, owner: item.context.owner, sourceId: item.context.sourceId } });
    } else if (item.kind === "event") {
      const triggered = activeAbilities(state, item.event); for (const trigger of triggered.reverse()) { claimUsage(state, trigger.source, trigger.owner, trigger.ability); for (const effect of [...trigger.ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { owner: trigger.owner, sourceId: trigger.source.uid, event: item.event, targetIds: item.event.targetIds || [] } }); }
    }
  }
  return { state, trace, steps };
}
