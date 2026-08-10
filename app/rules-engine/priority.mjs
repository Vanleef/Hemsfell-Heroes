import { canExecuteCard, validateCosts } from "./engine.mjs";

export const PriorityState = Object.freeze({
  IDLE: "IDLE",
  WAITING_FOR_PLAYER: "WAITING_FOR_PLAYER",
  WAITING_FOR_OPPONENT: "WAITING_FOR_OPPONENT",
  RESOLVING_STACK: "RESOLVING_STACK",
  AUTO_PASSING: "AUTO_PASSING",
});

const permanents = (player) => [...(player.board || []), ...(player.support || []), ...(player.terrain ? [player.terrain] : [])];
export const isAccelerated = (card) => (card?.tags || []).some((tag) => /acelerado/i.test(String(tag))) || /(?:acelerado|instantâneo|instantaneo)/i.test(card?.text || "");

function spellCost(state, owner, card) {
  const player = state.players[owner];
  const discount = permanents(player).flatMap((source) => source.staticModifiers || [])
    .filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === owner))
    .reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
  return Math.max(0, (card.cost || 0) + (card.costModifier || 0) + discount);
}

function activationAvailable(state, owner, source, ability) {
  if (ability.trigger !== "activated" || ability.responseAllowed === false) return false;
  if (ability.usageLimit && state.players[owner].abilityUses?.[`${source.uid || source.id}:${ability.id}`]) return false;
  try { validateCosts(state, ability, { owner, sourceId: source.uid || source.id }); return true; } catch { return false; }
}

export function legalPriorityResponses(state, owner) {
  if (!state?.pendingResponse || state.pendingResponse.responder !== owner) return [];
  const player = state.players[owner];
  const cards = player.hand.flatMap((card, handIndex) => isAccelerated(card) && canExecuteCard(card) && player.energy + player.reserve >= spellCost(state, owner, card)
    ? [{ type: "playCard", owner, cardId: card.id, handIndex, hasPriority: true, label: card.name || card.id }]
    : []);
  const abilities = permanents(player).flatMap((source) => (source.abilities || []).flatMap((ability) => activationAvailable(state, owner, source, ability)
    ? [{ type: "activate", owner, sourceId: source.uid || source.id, abilityId: ability.id, hasPriority: true, label: source.name || source.id }]
    : []));
  return [...cards, ...abilities];
}

export const shouldAutoPass = (state, owner, control = "assisted") =>
  control === "assisted" && !!state?.pendingResponse && state.pendingResponse.responder === owner && legalPriorityResponses(state, owner).length === 0;

export function chooseAIResponse(state, owner, random = Math.random) {
  const legal = legalPriorityResponses(state, owner);
  if (!legal.length) return { type: "passPriority", owner, auto: true };
  const scored = legal.map((command) => {
    const card = command.type === "playCard" ? state.players[owner].hand[command.handIndex] : null;
    const source = command.type === "activate" ? permanents(state.players[owner]).find((item) => (item.uid || item.id) === command.sourceId) : null;
    const value = card ? (card.cost || 0) + (card.type === "Feitiço" ? 2 : 0) : 1 + (source?.cost || 0);
    return { command, value: value + random() * 0.01 };
  });
  return scored.sort((a, b) => b.value - a.value)[0].command;
}

export function priorityView(state, viewer) {
  const pending = state?.pendingResponse;
  if (!pending) return { state: PriorityState.IDLE, stackDepth: state?.effectStack?.length || (state?.pendingAction ? 1 : 0), legalResponses: [] };
  const mine = pending.responder === viewer;
  return {
    state: mine ? PriorityState.WAITING_FOR_PLAYER : PriorityState.WAITING_FOR_OPPONENT,
    stackDepth: state?.effectStack?.length || (state?.pendingAction ? 1 : 0),
    responder: pending.responder,
    passes: pending.passes || 0,
    legalResponses: mine ? legalPriorityResponses(state, viewer) : [],
  };
}
