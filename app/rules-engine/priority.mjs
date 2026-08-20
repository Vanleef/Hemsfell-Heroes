import { canExecuteCard, validateCosts } from "./engine.mjs";
import { abilitiesForLevel, getExplicitCardRule } from "./card-rules.mjs";
import { reservePriorityPayment } from "./match-integrity.mjs";
import { OnlineInteractionState, canonicalStack, deriveOnlineInteractionState, inferPriorityWindow } from "./priority-state.mjs";
import { cardPlayTargetPolicy, isValidTarget } from "./targeting.mjs";

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
const normalizedTiming = (value = "") => normalizedSubtype(value).replace(/[ _-]+/g, "");
const hasSubtype = (card, subtype) => !subtype || (card?.subtypes || card?.tags || []).some((value) => normalizedSubtype(value) === normalizedSubtype(subtype));
const usesOnlinePriorityModel = (state) => /^online-v\d+$/.test(String(state?.priority?.model || ""));
const cardId = (card) => card?.uid || card?.id;
const markerTotal = (card) => typeof card?.markers === "number" ? Number(card.markers || 0) : Object.values(card?.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const hasMagicBarrier = (card) => [...(card?.tags || []), ...(card?.grantedKeywords || [])].some((value) => normalizedSubtype(value).includes("barreira magica"));

/**
 * Response speed is opt-in for permanent abilities. The manual only defines
 * Acelerado generically, so an ordinary activated card ability is never made
 * usable in a response window by inference. Card data may explicitly opt in
 * with responseAllowed/responseLegal or a response/accelerated timing token.
 */
export function isExplicitResponseAbility(ability) {
  if (!ability || ability.trigger !== "activated") return false;
  if (ability.responseAllowed === true || ability.responseLegal === true) return true;
  const timing = normalizedTiming(ability.timing || ability.speed || ability.activationTiming || "");
  return ["response", "responselegal", "accelerated", "acelerado"].includes(timing);
}

const targetMatchesResponseStep = (state, owner, card, target, targetId, step) => {
  if ((step.excludeIds || []).includes(targetId)) return false;
  if (step.allowedIds?.length && !step.allowedIds.includes(targetId)) return false;
  if (step.requiredSubtype && !hasSubtype(target, step.requiredSubtype)) return false;
  if (step.requiredName && normalizedSubtype(target?.name) !== normalizedSubtype(step.requiredName)) return false;
  if (step.requiredTrigger && !(target?.abilities || []).some((ability) => ability.trigger === step.requiredTrigger)) return false;
  if (step.imageOnly && !(target?.generatedImage || target?.imageCard)) return false;
  if (step.maxCost != null && Number(target?.cost || 0) > Number(step.maxCost)) return false;
  if (step.requireExhausted && !target?.exhausted) return false;
  if (step.requiresMarker && markerTotal(target) < 1) return false;
  if (step.requiresEffectAppliedThisTurn && target?.effectAppliedRound !== state.round) return false;
  if (step.requiresDamagedOwnerThisTurn && !(target?.damagedOwnersThisTurn || []).includes(owner)) return false;
  if (card?.type === "Feitiço" && hasMagicBarrier(target) && !/ignora.*barreira m[aá]gica/i.test(String(card?.text || ""))) return false;
  return true;
};

function responseTargetCandidates(state, owner, card, step) {
  const result = [];
  state.players.forEach((entry, targetOwner) => {
    for (const target of permanents(entry)) {
      const id = cardId(target);
      if (!id) continue;
      const kind = (entry.board || []).includes(target) || target.type === "Criatura" ? "creature" : "permanent";
      if (isValidTarget(step, owner, targetOwner, kind) && targetMatchesResponseStep(state, owner, card, target, id, step)) result.push(id);
    }
    const heroId = targetOwner === owner ? "ally-hero" : "enemy-hero";
    const heroConstraints = step.requiredSubtype || step.requiredName || step.requiredTrigger || step.imageOnly || step.maxCost != null || step.requireExhausted || step.requiresMarker || step.requiresEffectAppliedThisTurn || step.requiresDamagedOwnerThisTurn;
    if (!heroConstraints && !(step.excludeIds || []).includes(heroId) && (!step.allowedIds?.length || step.allowedIds.includes(heroId)) && isValidTarget(step, owner, targetOwner, "hero")) result.push(heroId);
  });
  return [...new Set(result)];
}

/**
 * Determine whether an Acelerado can actually be declared now, not merely
 * whether it exists in hand. Assisted priority must not stop for a card whose
 * targets/costs make it impossible to use.
 */
function responseCardDeclarationAvailable(state, owner, card, handIndex) {
  if (!card || card.type !== "Feitiço" || !isAccelerated(card) || !canExecuteCard(card)) return false;
  const steps = cardPlayTargetPolicy(card).steps || [];
  const candidates = steps.map((step) => responseTargetCandidates(state, owner, card, step));
  const playAbilities = (card.abilities || []).filter((ability) => ability.trigger === "onPlay");

  const canPayDeclaration = (selection) => {
    const targetIds = selection.filter((choice) => choice.role !== "sacrifice" && choice.role !== "attachment").map((choice) => choice.id);
    const sacrificeIds = selection.filter((choice) => choice.role === "sacrifice").map((choice) => choice.id);
    const command = { type: "playCard", owner, cardId: card.id, handIndex, hasPriority: true, targetIds, sacrificeIds };
    try {
      const probe = structuredClone(state);
      reservePriorityPayment(probe, command);
      for (const ability of playAbilities) validateCosts(probe, ability, command);
      return true;
    } catch {
      return false;
    }
  };

  const choose = (index, used, selection) => {
    if (index >= steps.length) return canPayDeclaration(selection);
    const step = steps[index];
    if (step.optional && choose(index + 1, used, selection)) return true;
    return candidates[index].some((id) => {
      if (used.has(id)) return false;
      const next = new Set(used);
      next.add(id);
      return choose(index + 1, next, [...selection, { id, role: step.role || "effect" }]);
    });
  };

  return choose(0, new Set(), []);
}

function abilityTargetsAvailable(state, owner, ability) {
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
      count += candidates.filter((card) => hasSubtype(card, effect.requiredSubtype)
        && (!effect.requireExhausted || card.exhausted)
        && (!effect.requiresMarker || markerTotal(card) > 0)
        && (!effect.requiresEffectAppliedThisTurn || card.effectAppliedRound === state.round)
        && (!effect.requiresDamagedOwnerThisTurn || (card.damagedOwnersThisTurn || []).includes(owner))
        && (!effect.allowedIds?.length || effect.allowedIds.includes(cardId(card)))
        && !(effect.excludeIds || []).includes(cardId(card))).length;
      if (/Character$/.test(target) && targetOwner !== owner) count += 1;
    }
    if (count < minimum) return false;
  }
  return true;
}

export const isAccelerated = (card) => (card?.tags || []).some((tag) => /acelerado/i.test(String(tag))) || /(?:acelerado|instantâneo|instantaneo)/i.test(card?.text || "");

function legalPermanentResponseAbilities(state, owner) {
  const entry = state.players?.[owner];
  if (!entry) return [];
  return permanents(entry).flatMap((source) => {
    if (!source || source.suffocated || source.exhausted || source.summoning || source.enteredRound === state.round) return [];
    return (source.abilities || []).flatMap((ability) => {
      if (!isExplicitResponseAbility(ability) || !ability.id || !abilityTargetsAvailable(state, owner, ability)) return [];
      if (stackHas(state, command => command.type === "activate" && command.owner === owner && command.sourceId === (source.uid || source.id) && command.abilityId === ability.id)) return [];
      /* Existing engine timing is still authoritative. At present permanent
         activations are own-turn actions; this discovery layer does not invent
         cross-turn permission where card rules have not defined it. */
      if (state.active !== owner) return [];
      try { validateCosts(state, ability, { owner, sourceId: source.uid || source.id }); } catch { return []; }
      return [{ type: "activate", owner, sourceId: source.uid || source.id, abilityId: ability.id, hasPriority: true, label: `${source.name || source.id}: ${ability.id}` }];
    });
  });
}

export function legalPriorityResponses(state, owner) {
  const pending = state?.pendingResponse;
  if (!pending || pending.responder !== owner) return [];
  /* Online allows a legal response after one pass; playing it resets the pass
     sequence. Offline/Bot keeps the previous guard until those modes are
     intentionally migrated, preventing the old AI priority loop from returning. */
  if (!usesOnlinePriorityModel(state) && pending.actor === owner && (pending.passes || 0) > 0) return [];
  const player = state.players[owner];
  const cards = player.hand.flatMap((card, handIndex) => responseCardDeclarationAvailable(state, owner, card, handIndex) && !stackHas(state, command => command.type === "playCard" && command.owner === owner && command.cardId === card.id)
    ? [{ type: "playCard", owner, cardId: card.id, handIndex, hasPriority: true, label: card.name || card.id }]
    : []);
  const page = HERO_RULE_PAGE[player.heroId];
  const rule = page ? getExplicitCardRule(`p${page}`) : null;
  const source = heroSource(player, owner);
  const heroAbilities = abilitiesForLevel(rule, player.level || 1).flatMap((ability) => {
    if (ability.trigger !== "activated" || ability.responseAllowed === false || !ability.id || !abilityTargetsAvailable(state, owner, ability)) return [];
    if (player.abilityUses?.[heroUsageKey(state, source, ability)]) return [];
    if (stackHas(state, command => command.type === "activateHero" && command.owner === owner && command.abilityId === ability.id)) return [];
    try { validateCosts(state, ability, { owner, sourceId: source.uid }); } catch { return []; }
    return [{ type: "activateHero", owner, abilityId: ability.id, hasPriority: true, label: `${player.heroId}: ${ability.id}` }];
  });
  return [...cards, ...legalPermanentResponseAbilities(state, owner), ...heroAbilities];
}

export const shouldAutoPass = (state, owner, control = "assisted") => {
  const interaction = deriveOnlineInteractionState(state);
  const responseState = interaction === OnlineInteractionState.RESPONSE_PRIORITY || interaction === OnlineInteractionState.FINALIZATION_RESPONSE;
  return control === "assisted" && responseState && state?.pendingResponse?.responder === owner && legalPriorityResponses(state, owner).length === 0;
};

export function chooseAIResponse(state, owner, random = Math.random) {
  const pending = state?.pendingResponse;
  if (!usesOnlinePriorityModel(state) && pending?.responder === owner && pending?.actor === owner && (pending.passes || 0) > 0)
    return { type: "passPriority", owner, auto: true };
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
  const stackDepth = canonicalStack(state).length;
  if (!pending) return { state: PriorityState.IDLE, stackDepth, priorityOwner: state?.active ?? null, window: null, legalResponses: [] };
  const mine = pending.responder === viewer;
  return {
    state: mine ? PriorityState.WAITING_FOR_PLAYER : PriorityState.WAITING_FOR_OPPONENT,
    stackDepth,
    responder: pending.responder,
    priorityOwner: pending.responder,
    passes: pending.passes || 0,
    window: inferPriorityWindow(state),
    legalResponses: mine ? legalPriorityResponses(state, viewer) : [],
  };
}
