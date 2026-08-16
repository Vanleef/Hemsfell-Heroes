import { RulesViolation } from "./effects.mjs";

const clone = (value) => structuredClone(value);
const fold = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const permanents = (player) => [...(player?.board || []), ...(player?.support || []), ...(player?.terrain ? [player.terrain] : [])];

export const isAcceleratedCard = (card) => (card?.tags || []).some((tag) => /acelerado/i.test(String(tag))) || /(?:acelerado|instantâneo|instantaneo)/i.test(String(card?.text || ""));

const cardInHand = (state, command) => state.players?.[command.owner]?.hand?.find((card) => card.id === command.cardId || card.uid === command.cardId);

const staticCostDiscount = (state, owner, card) => permanents(state.players?.[owner]).filter((source) => !source?.suffocated).flatMap((source) => source.staticModifiers || [])
  .filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === owner) && (!modifier.firstEachTurn || !(state.players?.[owner]?.turnCardsPlayed || 0)))
  .reduce((sum, modifier) => sum + Number(modifier.amount || 0), 0);

const queuedDiscount = (state, owner, card) => {
  const player = state.players?.[owner];
  const candidates = player?.nextCardDiscounts || [];
  const match = candidates.find((item) => (!item.type || item.type === card.type) && (!item.typeNot || item.typeNot !== card.type) && (item.expiresRound == null || state.round < item.expiresRound));
  if (match) return Math.max(0, Number(match.amount || 0));
  if (card.type === "Feitiço") return Math.max(Number(player?.nextSpellDiscount || 0), Number(player?.nextNonCreatureDiscount || 0), Number(player?.nextCardDiscount || 0));
  if (card.type !== "Criatura") return Math.max(Number(player?.nextNonCreatureDiscount || 0), Number(player?.nextCardDiscount || 0));
  return Math.max(0, Number(player?.nextCardDiscount || 0));
};

export function priorityPlayCost(state, command) {
  const card = cardInHand(state, command);
  if (!card) throw new RulesViolation("card-not-in-hand");
  const modifier = card.costModifierExpiresRound != null && state.round >= card.costModifierExpiresRound ? 0 : Number(card.costModifier || 0);
  return Math.max(0, Number(card.cost || 0) + modifier + staticCostDiscount(state, command.owner, card) - queuedDiscount(state, command.owner, card));
}

export function reservePriorityPayment(state, command) {
  const player = state.players?.[command.owner];
  const card = cardInHand(state, command);
  if (!player || !card) throw new RulesViolation("card-not-in-hand");
  const cost = priorityPlayCost(state, command);
  const acceleratedOffTurn = isAcceleratedCard(card) && state.active !== command.owner;
  const canUseReserve = card.type !== "Criatura";
  const payment = { energy: 0, reserve: 0, life: 0, cost };

  if (card.type === "Criatura" && player.nextCreaturePaysLife) {
    const minimumLife = player.heroId === "saymon" && (player.level || 1) >= 3 ? 1 : 0;
    if (player.life - cost < minimumLife) throw new RulesViolation("not-enough-life");
    player.life -= cost;
    payment.life = cost;
    return payment;
  }

  if (acceleratedOffTurn) {
    if (player.reserve < cost) throw new RulesViolation("not-enough-energy");
    player.reserve -= cost;
    payment.reserve = cost;
    return payment;
  }

  if (!canUseReserve) {
    if (player.energy < cost) throw new RulesViolation("not-enough-energy");
    player.energy -= cost;
    payment.energy = cost;
    return payment;
  }

  if (player.energy + player.reserve < cost) throw new RulesViolation("not-enough-energy");
  const fromReserve = Math.min(player.reserve, cost);
  player.reserve -= fromReserve;
  player.energy -= cost - fromReserve;
  payment.reserve = fromReserve;
  payment.energy = cost - fromReserve;
  return payment;
}

export function restorePriorityPayment(state, payment, owner) {
  if (!payment || owner == null || !state.players?.[owner]) return state;
  const next = clone(state);
  const player = next.players[owner];
  player.energy += Number(payment.energy || 0);
  player.reserve += Number(payment.reserve || 0);
  player.life += Number(payment.life || 0);
  return next;
}

const identity = (card) => card?.uid || card?.id;
const sameRuntimeCard = (candidate, source) => {
  if (!candidate || !source) return false;
  if (source.uid && candidate.uid === source.uid) return true;
  return candidate.page === source.page && candidate.name === source.name;
};
const boardCard = (state, id) => state.players.flatMap((entry, owner) => (entry.board || []).map((card) => ({ card, owner }))).find(({ card }) => identity(card) === id || card.id === id);
const locateDestination = (state, source) => {
  const hits = [];
  state.players.forEach((entry, owner) => {
    for (const zone of ["hand", "obscuro", "grave"]) if ((entry[zone] || []).some((card) => sameRuntimeCard(card, source))) hits.push({ owner, zone });
  });
  return hits.length === 1 ? hits[0] : null;
};
const zoneCard = (unit) => {
  const card = clone(unit);
  for (const key of ["uid", "slot", "damage", "bonusAtk", "bonusHp", "temporaryAtk", "temporaryHp", "temporaryTags", "temporarySubtypes", "combatRestrictions", "attackLimit", "attacksThisTurn", "markers", "modifiers", "grantedKeywords", "staticModifiers", "lastDamagedBy", "damagedOwnersThisTurn", "activatedThisTurn", "attackedThisTurn", "exhausted", "summoning", "frozen", "stunned", "suffocated", "immobilized", "impacting", "defenseUses", "attachedTo", "temporary"])
    delete card[key];
  return card;
};
const moveAttachmentsWithHost = (entry, hostId) => {
  const attachments = (entry.support || []).filter((card) => card.attachedTo === hostId);
  entry.support = (entry.support || []).filter((card) => card.attachedTo !== hostId);
  for (const attachment of attachments) if (!attachment.generatedImage && !attachment.imageCard) entry.grave.push(zoneCard(attachment));
};
const moveLinkedCard = (state, owner, unit, destination) => {
  const entry = state.players[owner];
  const id = identity(unit);
  entry.board = (entry.board || []).filter((card) => identity(card) !== id);
  moveAttachmentsWithHost(entry, id);
  if (unit.generatedImage || unit.imageCard) return;
  const zone = destination?.zone === "hand" || destination?.zone === "obscuro" ? destination.zone : "grave";
  const targetOwner = destination?.owner ?? owner;
  state.players[targetOwner][zone].push(zoneCard(unit));
};

export function propagateWeddingRingLinks(before, after) {
  const links = before.players.flatMap((entry) => (entry.support || []).filter((card) => Number(card.page) === 150 && Array.isArray(card.linkedCreatures) && card.linkedCreatures.length >= 2).map((ring) => [...new Set(ring.linkedCreatures.map(String))].slice(0, 2))).filter((pair) => pair.length === 2);
  if (!links.length) return after;
  const processed = new Set();
  let changed = true;
  let guard = 0;
  while (changed && guard++ < links.length + 2) {
    changed = false;
    for (const pair of links) {
      const key = [...pair].sort().join("::");
      if (processed.has(key)) continue;
      const beforeA = boardCard(before, pair[0]), beforeB = boardCard(before, pair[1]);
      if (!beforeA || !beforeB) { processed.add(key); continue; }
      const afterA = boardCard(after, pair[0]), afterB = boardCard(after, pair[1]);
      if (!!afterA === !!afterB) { if (!afterA) processed.add(key); continue; }
      const departed = afterA ? beforeB : beforeA;
      const survivor = afterA || afterB;
      const destination = locateDestination(after, departed.card) || { owner: departed.owner, zone: "grave" };
      moveLinkedCard(after, survivor.owner, survivor.card, destination);
      processed.add(key);
      changed = true;
    }
  }
  return after;
}

export function paymentBudget(state, owner) {
  const player = state.players?.[owner];
  if (!player) return 0;
  return state.active === owner ? Number(player.energy || 0) + Number(player.reserve || 0) : Number(player.reserve || 0);
}

export const normalizeText = fold;
