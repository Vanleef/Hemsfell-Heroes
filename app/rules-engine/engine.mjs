import { applyEffect, defaultEffectHandlers, RulesViolation } from "./effects.mjs";

export class RulesLoopError extends Error {
  constructor(message, trace) { super(message); this.name = "RulesLoopError"; this.trace = trace; }
}

const clone = (value) => structuredClone(value);
const fingerprint = (state, stack) => JSON.stringify({ active: state.active, phase: state.phase, round: state.round, players: state.players.map((p) => ({ life: p.life, energy: p.energy, reserve: p.reserve, hand: p.hand.length, deck: p.deck.length, board: p.board.map((u) => [u.uid, u.damage, u.exhausted, u.markers]) })), stack: stack.map((item) => [item.kind, item.effect?.type, item.event?.type]) });

export function validateCosts(state, ability, context) {
  const entry = state.players[context.owner];
  for (const cost of ability.costs || []) {
    if (cost.type === "tap") { const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); if (!source || source.exhausted || source.summoning) throw new RulesViolation("cannot-tap"); }
    if (cost.type === "removeMarkers") { const source = [...entry.board, ...entry.support].find((unit) => unit.uid === context.sourceId); const available = Object.values(source?.markers || {}).reduce((sum, value) => sum + Number(value), 0); if (cost.amount !== "X" && available < cost.amount) throw new RulesViolation("not-enough-markers"); }
    if (cost.type === "sacrifice" && (context.sacrificeIds || []).length < cost.amount) throw new RulesViolation("sacrifice-required");
    if (cost.type === "energy" && entry.energy + entry.reserve < cost.amount) throw new RulesViolation("not-enough-energy");
    if (cost.type === "life" && entry.life <= cost.amount) throw new RulesViolation("not-enough-life");
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
  }
}

function activeAbilities(state, event) {
  const result = [];
  state.players.forEach((entry, owner) => {
    for (const source of [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])]) {
      if (source.suffocated) continue;
      for (const ability of source.abilities || []) if (ability.trigger === event.type) result.push({ source, owner, ability });
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
        const cost = Math.max(0, card.cost || 0); const spell = card.type === "Feitiço";
        if (entry.energy + (spell ? entry.reserve : 0) < cost) throw new RulesViolation("not-enough-energy");
        const fromReserve = spell ? Math.min(entry.reserve, cost) : 0; entry.reserve -= fromReserve; entry.energy -= cost - fromReserve;
        entry.hand.splice(cardIndex, 1); const permanent = card.type !== "Feitiço";
        if (permanent) {
          const unit = { ...card, uid: item.command.instanceId || `${card.id}-${state.round}-${steps}`, slot: item.command.slot ?? 0, damage: 0, exhausted: false, summoning: card.type === "Criatura", markers: {}, modifiers: [] };
          if (card.type === "Criatura") entry.board.push(unit); else if (card.type === "Terreno") entry.terrain = unit; else entry.support.push(unit);
          const enter = (unit.abilities || []).filter((ability) => ability.trigger === "onEnter");
          for (const ability of enter.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: unit.uid } });
        } else entry.grave.push(card);
        const play = (card.abilities || []).filter((ability) => ability.trigger === "onPlay");
        for (const ability of play.reverse()) for (const effect of [...ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { ...item.command, sourceId: card.id } });
        stack.push({ kind: "event", event: { type: spell ? "onSpellCast" : "onCardPlayed", owner: item.command.owner, cardId: card.id } });
      } else if (item.command.type === "attack") {
        if (state.active !== item.command.owner || state.phase !== "combate") throw new RulesViolation("wrong-combat-priority");
        const attackerPlayer = state.players[item.command.owner]; const defenderPlayer = state.players[1 - item.command.owner];
        const attacker = attackerPlayer.board.find((unit) => unit.uid === item.command.attackerId); if (!attacker || attacker.exhausted || attacker.summoning || attacker.stunned) throw new RulesViolation("invalid-attacker");
        attacker.exhausted = true; const attack = Math.max(0, (attacker.atk || 0) + (attacker.modifiers || []).reduce((sum, value) => sum + (value.attack || 0), 0));
        const defender = defenderPlayer.board.find((unit) => unit.uid === item.command.defenderId);
        if (!defender) defenderPlayer.life -= attack;
        else {
          if (defender.exhausted || defender.stunned) throw new RulesViolation("invalid-defender");
          const counter = Math.max(0, (defender.atk || 0) + (defender.modifiers || []).reduce((sum, value) => sum + (value.attack || 0), 0));
          defender.damage = (defender.damage || 0) + attack; attacker.damage = (attacker.damage || 0) + counter;
          const lethal = [[attacker, attackerPlayer], [defender, defenderPlayer]];
          for (const [unit, ownerEntry] of lethal) { const health = (unit.hp || 1) + (unit.modifiers || []).reduce((sum, value) => sum + (value.health || 0), 0); if (unit.damage >= health && !(unit.tags || []).some((tag) => /indestrutivel/i.test(tag))) { ownerEntry.board.splice(ownerEntry.board.indexOf(unit), 1); ownerEntry.grave.push({ ...unit, deathCause: "combat" }); } }
        }
        stack.push({ kind: "event", event: { type: "onCombatDamage", owner: item.command.owner, sourceId: attacker.uid, targetIds: defender ? [defender.uid] : [] } });
      } else if (item.command.type === "activate") {
        const entry = state.players[item.command.owner]; if (state.active !== item.command.owner) throw new RulesViolation("not-your-turn");
        const source = [...entry.board, ...entry.support].find((unit) => unit.uid === item.command.sourceId); const ability = source?.abilities?.find((candidate) => candidate.id === item.command.abilityId && candidate.trigger === "activated");
        if (!ability) throw new RulesViolation("ability-not-found"); validateCosts(state, ability, item.command); payCosts(state, ability, item.command);
        [...ability.effects].reverse().forEach((effect) => stack.push({ kind: "effect", effect, context: item.command }));
      } else if (item.command.type === "emit") stack.push({ kind: "event", event: item.command.event });
      else if (item.command.type === "advancePhase") {
        const order = ["manutencao", "principal", "combate", "fim"]; const index = order.indexOf(state.phase); state.phase = order[(index + 1) % order.length]; if (state.phase === "manutencao") { state.active = 1 - state.active; state.round += 1; }
      } else throw new RulesViolation("unknown-command");
    } else if (item.kind === "effect") {
      applyEffect(state, item.effect, item.context, handlers);
      stack.push({ kind: "event", event: { type: `after:${item.effect.type}`, owner: item.context.owner, sourceId: item.context.sourceId } });
    } else if (item.kind === "event") {
      const triggered = activeAbilities(state, item.event); for (const trigger of triggered.reverse()) for (const effect of [...trigger.ability.effects].reverse()) stack.push({ kind: "effect", effect, context: { owner: trigger.owner, sourceId: trigger.source.uid, event: item.event, targetIds: item.event.targetIds || [] } });
    }
  }
  return { state, trace, steps };
}
