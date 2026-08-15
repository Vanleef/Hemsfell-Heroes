import { canExecuteCard, validateCosts } from "./engine.mjs";
import { abilitiesForLevel, getExplicitCardRule } from "./card-rules.mjs";

export const PriorityState = Object.freeze({
  IDLE: "IDLE",
  WAITING_FOR_PLAYER: "WAITING_FOR_PLAYER",
  WAITING_FOR_OPPONENT: "WAITING_FOR_OPPONENT",
  RESOLVING_STACK: "RESOLVING_STACK",
  AUTO_PASSING: "AUTO_PASSING",
});

const permanents = (player) => [...(player.board || []), ...(player.support || []), ...(player.terrain ? [player.terrain] : [])];
const HERO_RULE_PAGE = Object.freeze({ gimble: 2, saymon: 129, ngoro: 255, natureza: 291 });
const heroSource = (entry, owner) => ({ uid: `${entry.heroId}-hero-${owner}`, id: `${entry.heroId}-hero-${owner}`, name: entry.heroId, slot: -1 });
const stackHas = (state, predicate) => (state.priorityStack || []).some((frame) => frame?.kind === "command" && predicate(frame.command || {}));
const heroUsageKey = (state, source, ability) => `${source.uid || source.id}:${ability.id}${ability?.condition?.firstEachTurn ? `:round-${state.round}` : ""}`;
const normalizedSubtype = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const hasSubtype = (card, subtype) => !subtype || (card?.subtypes || card?.tags || []).some((value) => normalizedSubtype(value) === normalizedSubtype(subtype));
function heroAbilityTargetsAvailable(state, owner, ability) {
  for (const effect of ability.effects || []) {
    const target = effect.target;
    if (!target || !/(?:Character|Creature|Permanent)$/.test(target)) continue;
    const minimum = Number(effect.minimumSelections ?? effect.selections ?? 1);
    if (minimum <= 0) continue;
    const wantsCreature = /Creature$/.test(target) || /Character$/.test(target);
    const wantsPermanent = /Permanent$/.test(target);
    const owners = target.startsWith("ally") ? [owner] : target.startsWith("enemy") ? [1 - owner] : [0, 1];
    let count = 0;
    for (const targetOwner of owners) {
      const entry = state.players[targetOwner];
      const candidates = wantsCreature ? (entry.board || []) : wantsPermanent ? permanents(entry) : [];
      count += candidates.filter((card) => hasSubtype(card, effect.requiredSubtype) && (!effect.requireExhausted || card.exhausted)).length;
      if (/Character$/.test(target) && targetOwner !== owner) count += 1;
    }
    if (count < minimum) return false;
  }
  return true;
}
export const isAccelerated = (card) => (card?.tags || []).some((tag) => /acelerado/i.test(String(tag))) || /(?:acelerado|instantâneo|instantaneo)/i.test(card?.text || "");

function spellCost(state, owner, card) {
  const player = state.players[owner];
  const discount = permanents(player).filter((source) => !source.suffocated).flatMap((source) => source.staticModifiers || [])
    .filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === owner))
    .reduce((sum, modifier) => sum + (modifier.amount || 0), 0);
  return Math.max(0, (card.cost || 0) + (card.costModifier || 0) + discount);
}

function activationAvailable(state, owner, source, ability) {
  if (state.active !== owner || ability.trigger !== "activated" || ability.responseAllowed === false) return false;
  if (state.players[owner].abilityUses?.[`${source.uid || source.id}:${ability.id}`]) return false;
  try { validateCosts(state, ability, { owner, sourceId: source.uid || source.id }); return true; } catch { return false; }
}

export function legalPriorityResponses(state, owner) {
  if (!state?.pendingResponse || state.pendingResponse.responder !== owner) return [];
  const player = state.players[owner];
  const responseEnergy = state.active === owner ? player.energy + player.reserve : player.reserve;
  const cards = player.hand.flatMap((card, handIndex) => isAccelerated(card) && canExecuteCard(card) && responseEnergy >= spellCost(state, owner, card) && !stackHas(state, command => command.type === "playCard" && command.owner === owner && command.cardId === card.id)
    ? [{ type: "playCard", owner, cardId: card.id, handIndex, hasPriority: true, label: card.name || card.id }]
    : []);
  const page = HERO_RULE_PAGE[player.heroId];
  const rule = page ? getExplicitCardRule(`p${page}`) : null;
  const source = heroSource(player, owner);
  const heroAbilities = abilitiesForLevel(rule, player.level || 1).flatMap((ability) => {
    if (ability.trigger !== "activated" || ability.responseAllowed === false || !ability.id || !heroAbilityTargetsAvailable(state, owner, ability)) return [];
    if (player.abilityUses?.[heroUsageKey(state, source, ability)]) return [];
    if (stackHas(state, command => command.type === "activateHero" && command.owner === owner && command.abilityId === ability.id)) return [];
    try { validateCosts(state, ability, { owner, sourceId: source.uid }); } catch { return []; }
    return [{ type: "activateHero", owner, abilityId: ability.id, hasPriority: true, label: `${player.heroId}: ${ability.id}` }];
  });
  return [...cards, ...heroAbilities];
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
