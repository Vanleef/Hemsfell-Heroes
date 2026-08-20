import { RulesViolation } from "./effects.mjs";

const clone = (value) => structuredClone(value);
const fold = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const permanents = (player) => [...(player?.board || []), ...(player?.support || []), ...(player?.terrain ? [player.terrain] : [])];
const subtype = (card, value) => [...(card?.subtypes || []), ...(card?.tags || [])].some((tag) => fold(tag) === fold(value));
const unitOwner = (state, id) => state.players.findIndex((entry) => permanents(entry).some((unit) => unit.uid === id || unit.id === id));
const normalizePublicGeneratedImages = (state) => {
  const templates = (state?.players || []).flatMap((entry) => entry?.extraDeck || []);
  const printedKeys = ["page", "name", "type", "cost", "atk", "hp", "text", "tags", "subtypes", "abilities", "image", "hero", "imageCard"];
  for (const entry of state?.players || []) {
    for (const unit of permanents(entry)) {
      if (!unit?.generatedImage) continue;
      const template = templates.find((card) => fold(card?.name) === fold(unit?.name));
      if (template) for (const key of printedKeys) if (template[key] !== undefined) unit[key] = clone(template[key]);
      /* Campo é uma zona pública. `revealed`/`revealedTo` pertencem a cartas
         em zonas ocultas e não devem acompanhar uma permanente já em jogo. */
      delete unit.revealed;
      delete unit.revealedTo;
    }
  }
  return state;
};

export const isAcceleratedCard = (card) => (card?.tags || []).some((tag) => /acelerado/i.test(String(tag))) || /(?:acelerado|instantâneo|instantaneo)/i.test(String(card?.text || ""));

const cardInHand = (state, command) => state.players?.[command.owner]?.hand?.find((card) => card.id === command.cardId || card.uid === command.cardId);

const finalizeLethalLife = (state) => {
  if (!state?.players?.length || state.winner != null) return state;
  const dead = state.players.map((entry, owner) => ({ owner, life: Number(entry?.life || 0) })).filter((entry) => entry.life <= 0);
  if (!dead.length) return state;
  if (dead.length === 1) state.winner = dead[0].owner === 0 ? 1 : 0;
  else {
    // Simultaneous lethal is resolved against the active player. This keeps the
    // outcome deterministic and prevents a match from remaining interactive at 0 life.
    state.winner = state.active === 0 ? 1 : 0;
  }
  state.pendingDecision = null;
  state.pendingResponse = null;
  state.pendingAction = undefined;
  state.priorityStack = [];
  state.combatAction = null;
  return state;
};

const validateWeddingRingLink = (state, command, card) => {
  if (Number(card?.page) !== 150) return;
  const entry = state.players?.[command.owner];
  const host = (entry?.board || []).find((unit) => (unit.uid || unit.id) === command.attachedTo);
  const linkedId = command.targetIds?.[0];
  const linked = (entry?.board || []).find((unit) => (unit.uid || unit.id) === linkedId);
  if (!host) throw new RulesViolation("artifact-target-required");
  if (!linkedId || !linked || linkedId === (host.uid || host.id)) throw new RulesViolation("wedding-ring-requires-different-allied-creature");
};

const staticCostDiscount = (state, owner, card) => permanents(state.players?.[owner]).filter((source) => !source?.suffocated).flatMap((source) => source.staticModifiers || [])
  .filter((modifier) => modifier.type === "costModifier" && (!modifier.selector?.type || modifier.selector.type === card.type) && (!modifier.during || modifier.during !== "controllerTurn" || state.active === owner) && (!modifier.firstEachTurn || !(state.players?.[owner]?.turnCardsPlayed || 0)))
  .reduce((sum, modifier) => sum + Number(modifier.amount || 0), 0);

const queuedDiscount = (state, owner, card) => {
  const player = state.players?.[owner];
  const match = (player?.nextCardDiscounts || []).find((rule) => (rule.expiresRound == null || state.round < rule.expiresRound) && (!rule.type || rule.type === card.type) && (!rule.typeNot || rule.typeNot !== card.type));
  return Number(match?.amount || 0);
};

const intrinsicCost = (state, owner, card) => {
  const entry = state.players[owner];
  let modifier = 0;
  if (card.page === 13 && entry.board.some((unit) => unit.page === 23)) modifier -= 2;
  if (card.page === 14 && entry.board.some((unit) => unit.page === 24)) modifier -= 3;
  if (card.page === 88) modifier += Math.max(0, entry.hand.length - 1) - Number(card.cost || 0);
  if (card.page === 139) modifier += Math.max(1, Number(card.cost || 0) - Number(entry.lifeLostThisTurn || 0)) - Number(card.cost || 0);
  if (card.page === 42 && Number(entry.turnCardsPlayed || 0) >= 1) modifier -= 1;
  if (entry.heroId === "goblin" && Number(entry.level || 1) >= 3 && card.type === "Criatura" && subtype(card, "Goblin") && !Number(entry.subtypesEnteredThisTurn?.Goblin || 0)) modifier -= Number(card.cost || 0);
  if (card.page === 149) modifier -= entry.board.filter((unit) => subtype(unit, "Vampiro")).length;
  if (card.page === 203) modifier -= 2 * entry.board.length;
  if (card.type === "Criatura") modifier += (entry.nextCreatureTaxes || [])
    .filter((tax) => tax.createdRound == null || state.round > tax.createdRound)
    .reduce((sum, tax) => sum + Number(tax.amount || 0), 0);
  return modifier;
};

const targetSurcharge = (state, owner, card, targetIds = []) => {
  if (card.type !== "Feitiço") return 0;
  return targetIds.reduce((sum, id) => {
    const targetOwner = unitOwner(state, id);
    const target = targetOwner < 0 ? null : permanents(state.players[targetOwner]).find((unit) => unit.uid === id || unit.id === id);
    return sum + Number(target?.suffocated ? 0 : target?.spellTargetSurcharge || 0);
  }, 0);
};

export function priorityPlayCost(state, command) {
  const card = cardInHand(state, command);
  if (!card) throw new RulesViolation("card-not-in-hand");
  validateWeddingRingLink(state, command, card);
  const modifier = card.costModifierExpiresRound != null && state.round >= card.costModifierExpiresRound ? 0 : Number(card.costModifier || 0);
  return Math.max(0,
    Number(card.cost || 0)
    + intrinsicCost(state, command.owner, card)
    + targetSurcharge(state, command.owner, card, command.targetIds || [])
    + modifier
    + staticCostDiscount(state, command.owner, card)
    - queuedDiscount(state, command.owner, card));
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
    finalizeLethalLife(state);
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
  if (player.life > 0 && next.winner != null) next.winner = null;
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
const removeFromKnownZones = (state, source) => {
  for (const entry of state.players) for (const zone of ["hand", "obscuro", "grave"]) entry[zone] = (entry[zone] || []).filter((card) => !sameRuntimeCard(card, source));
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
  removeFromKnownZones(state, unit);
  state.players[targetOwner][zone].push(zoneCard(unit));
};

export function propagateWeddingRingLinks(before, after) {
  normalizePublicGeneratedImages(after);
  finalizeLethalLife(after);
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
      const destinationA = locateDestination(after, beforeA.card);
      const destinationB = locateDestination(after, beforeB.card);

      if (!afterA && !afterB) {
        if (!destinationA && destinationB) moveLinkedCard(after, beforeB.owner, beforeB.card, { owner: beforeA.owner, zone: "grave" });
        else if (!destinationB && destinationA) moveLinkedCard(after, beforeA.owner, beforeA.card, { owner: beforeB.owner, zone: "grave" });
        else if (destinationA && destinationB && (destinationA.owner !== destinationB.owner || destinationA.zone !== destinationB.zone)) {
          const aLooksLegacyFallback = destinationA.zone === "obscuro" && destinationB.zone !== "obscuro";
          const destination = aLooksLegacyFallback ? destinationB : destinationA;
          const source = aLooksLegacyFallback ? beforeA : beforeB;
          moveLinkedCard(after, source.owner, source.card, destination);
        }
        processed.add(key);
        continue;
      }
      if (!!afterA === !!afterB) continue;
      const departed = afterA ? beforeB : beforeA;
      const survivor = afterA || afterB;
      const destination = locateDestination(after, departed.card) || { owner: departed.owner, zone: "grave" };
      moveLinkedCard(after, survivor.owner, survivor.card, destination);
      processed.add(key);
      changed = true;
    }
  }
  finalizeLethalLife(after);
  normalizePublicGeneratedImages(after);
  return after;
}

export function paymentBudget(state, owner) {
  const player = state.players?.[owner];
  if (!player) return 0;
  return state.active === owner ? Number(player.energy || 0) + Number(player.reserve || 0) : Number(player.reserve || 0);
}

export const normalizeText = fold;