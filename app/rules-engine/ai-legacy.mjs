import { cardPlayTargetPolicy, isValidTarget } from "./targeting.mjs";
import { hasSubtype } from "./subtypes.mjs";

const DIFFICULTY = Object.freeze({
  "Fácil": { cardBudget: 1, responseBias: 0.25, attackBias: 0.68 },
  Normal: { cardBudget: 2, responseBias: 0.55, attackBias: 0.9 },
  "Difícil": { cardBudget: 3, responseBias: 0.9, attackBias: 1 },
});

export const aiDifficultyProfile = (difficulty = "Normal") => DIFFICULTY[difficulty] || DIFFICULTY.Normal;

export function isReadyAttacker(unit) {
  const used = unit?.attacksThisTurn ?? (unit?.attackedThisTurn ? 1 : 0);
  return !!unit && !unit.cannotAttack && !unit.exhausted && !unit.summoning && !unit.stunned && !unit.immobilized && used < (unit.attackLimit || 1);
}

export function hasTessaliaCommander(player) {
  return player?.heroId !== "tessalia" || (player.board || []).some((unit) => unit.slot === 2 && !unit.suffocated);
}

export function legalAIAttackers(player) {
  if (!player) return [];
  const commanderPresent = hasTessaliaCommander(player);
  return (player.board || []).filter((unit) => isReadyAttacker(unit) && (player.heroId !== "tessalia" || unit.slot === 2 || commanderPresent));
}

export function orderAIAttackers(player, difficulty = "Normal") {
  return legalAIAttackers(player).toSorted((a, b) => {
    if (player.heroId === "tessalia" && (a.slot === 2) !== (b.slot === 2)) return a.slot === 2 ? -1 : 1;
    if (difficulty === "Difícil") return ((b.atk || 0) + (b.bonusAtk || 0)) - ((a.atk || 0) + (a.bonusAtk || 0));
    return (a.slot || 0) - (b.slot || 0);
  });
}

export function preferredAISlot(player) {
  const occupied = new Set((player?.board || []).map((unit) => unit.slot));
  if (player?.heroId === "tessalia" && !occupied.has(2)) return 2;
  return [0, 1, 2, 3, 4].find((slot) => !occupied.has(slot));
}

export function canAIPlayLifeCost(card, player) {
  const printedLoss = Number(String(card?.text || "").match(/\b(?:perca|pague)\s+(\d+)\s+(?:de\s+)?vida/i)?.[1] || 0);
  const minimum = player?.heroId === "saymon" && (player.level || 1) >= 3 ? 1 : 0;
  return !printedLoss || (player?.life || 0) - printedLoss >= minimum;
}

export function chooseAIPlayable(playable, player, opponent, difficulty = "Normal", random = Math.random) {
  if (!playable.length) return undefined;
  if (difficulty === "Fácil") return playable[Math.floor(random() * playable.length)] || playable[0];
  const score = ({ c }) => {
    let value = (c.cost || 0) * (difficulty === "Difícil" ? 2 : 1);
    if (c.type === "Criatura") value += 2 + (c.atk || 0) + (c.hp || 0) * 0.45;
    if (/primeiro ato|compre|destrua|cause\s+\d+\s+de dano/i.test(c.text || "")) value += 3;
    if (player?.heroId === "tessalia" && c.type === "Criatura" && !(player.board || []).some((unit) => unit.slot === 2)) value += 12;
    if (player?.heroId === "goblin" && /fura-fila|goblin/i.test(`${c.text} ${(c.subtypes || []).join(" ")}`)) value += 3;
    if (player?.heroId === "uruk" && c.type === "Feitiço") value += 3;
    if (player?.heroId === "saymon" && /roubo de vida|cure/i.test(c.text || "") && (player.life || 0) < 15) value += 4;
    if ((opponent?.board || []).length && /dano|destrua|sufocad|congelad|atordoad/i.test(c.text || "")) value += 2;
    return value + random() * 0.01;
  };
  return playable.toSorted((a, b) => score(b) - score(a))[0];
}

const permanentUnits = (player) => [...(player?.board || []), ...(player?.support || []), ...(player?.terrain ? [player.terrain] : [])];
const cardId = (card) => card?.uid || card?.id;
const normalized = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const markerTotal = (card) => typeof card?.markers === "number" ? card.markers : Object.values(card?.markers || {}).reduce((sum, value) => sum + Number(value || 0), 0);

export function aiCardValue(card, state, owner, difficulty = "Normal") {
  if (!card) return -Infinity;
  const profile = aiDifficultyProfile(difficulty), controller = state?.players?.[owner], opponent = state?.players?.[1 - owner];
  let value = Number(card.cost || 0) * 1.25 + Number(card.atk || 0) * 1.4 + Number(card.hp || 0) * .75;
  const text = normalized(card.text);
  if (card.type === "Criatura") value += 3;
  if (/compre|busque|procure/.test(text)) value += 3;
  if (/destrua|bana|cause .*dano|retorne/.test(text)) value += 3 + (opponent?.board?.length || 0) * .35;
  if (/cure|roubo de vida|previna/.test(text)) value += (controller?.life || 30) < 14 ? 5 : 1;
  if (/primeiro ato|ultimo suspiro|fura-fila/.test(text)) value += 2;
  if (controller?.heroId === "uruk" && card.type === "Feitiço") value += 3;
  if (controller?.heroId === "tessalia" && card.type === "Criatura" && !(controller.board || []).some((unit) => unit.slot === 2)) value += 8;
  return value * (.8 + profile.attackBias * .2);
}

function optionKind(state, targetOwner, card) {
  return (state.players[targetOwner].board || []).includes(card) || card.type === "Criatura" ? "creature" : "permanent";
}

export function legalAITargets(state, owner, step = {}, selected = []) {
  const options = [];
  for (let targetOwner = 0; targetOwner < state.players.length; targetOwner++) {
    const entry = state.players[targetOwner];
    for (const card of permanentUnits(entry)) {
      const id = cardId(card), kind = optionKind(state, targetOwner, card);
      if (!id || selected.includes(id) || !isValidTarget(step, owner, targetOwner, kind)) continue;
      if (step.requiredSubtype && !hasSubtype(card, step.requiredSubtype)) continue;
      if (step.requiredName && normalized(card.name) !== normalized(step.requiredName)) continue;
      if (step.imageOnly && !card.generatedImage && !card.imageCard) continue;
      if (step.maxCost != null && Number(card.cost || 0) > Number(step.maxCost)) continue;
      if (step.requireExhausted && !card.exhausted) continue;
      if (step.requiresDamagedOwnerThisTurn && !(card.damagedOwnersThisTurn || []).includes(owner)) continue;
      if (step.requiresEffectAppliedThisTurn && card.effectAppliedRound !== state.round) continue;
      if (step.requiresMarker && markerTotal(card) < 1) continue;
      if (step.allowedIds?.length && !step.allowedIds.includes(id)) continue;
      if ((step.excludeIds || []).includes(id)) continue;
      options.push({ id, card, targetOwner, kind });
    }
    if (isValidTarget(step, owner, targetOwner, "hero") && !step.requiredSubtype && !step.requiredName && !step.imageOnly && step.maxCost == null) {
      const id = targetOwner === owner ? "ally-hero" : "enemy-hero";
      if (!selected.includes(id) && !(step.excludeIds || []).includes(id)) options.push({ id, card: entry, targetOwner, kind: "hero" });
    }
  }
  return options;
}

function harmfulSource(source) {
  return /dano|destrua|bana|retorne|sufocad|congelad|atordoad|imobiliz|reduz|-[0-9]/i.test(source?.text || "");
}

function scoreTarget(option, state, owner, source, difficulty) {
  const enemy = option.targetOwner !== owner, harmful = harmfulSource(source);
  let score = harmful ? (enemy ? 30 : -30) : (enemy ? -12 : 12);
  if (option.kind === "hero") score += harmful ? (enemy ? 4 : -4) : ((option.card.life || 30) < 12 ? 8 : 0);
  else {
    const stats = Number(option.card.atk || 0) * 1.4 + Number(option.card.hp || 0) - Number(option.card.damage || 0);
    score += harmful ? stats : Math.max(0, 8 - stats);
    if (difficulty === "Fácil") score += Math.random() * 8;
  }
  return score;
}

export function chooseAITargetIds(state, owner, steps = [], source, difficulty = "Normal") {
  const selected = [];
  for (const step of steps) {
    const options = legalAITargets(state, owner, step, selected).sort((a, b) => scoreTarget(b, state, owner, source, difficulty) - scoreTarget(a, state, owner, source, difficulty));
    if (!options.length) { if (step.optional) continue; return null; }
    if (step.optional && source && !harmfulSource(source) && options[0].targetOwner !== owner) continue;
    selected.push(options[0].id);
  }
  return selected;
}

function eligibleSearchCards(state, decision) {
  const entry = state.players[decision.owner], effect = decision.effect || {};
  return (entry.deck || []).filter((card) => (!effect.types?.length || effect.types.includes(card.type)) && (!effect.subtype || hasSubtype(card, effect.subtype)) && (!effect.nameIncludes || normalized(card.name).includes(normalized(effect.nameIncludes))) && (!effect.vanillaOnly || !String(card.text || "").trim()) && (effect.minCost == null || Number(card.cost || 0) >= effect.minCost) && (effect.maxCost == null || Number(card.cost || 0) <= effect.maxCost) && (!effect.maxCostFromMarkerAmount || Number(card.cost || 0) <= Number(decision.context?.markerAmount || 0)));
}

/** Resolve every authoritative decision kind without relying on UI-specific dialogs. */
export function chooseAIDecision(state, owner, difficulty = "Normal") {
  const decision = state?.pendingDecision;
  if (!decision || (decision.owner !== owner && decision.context?.decisionOwner !== owner)) return null;
  const entry = state.players[owner], effect = decision.effect || {}, command = { type: "resolveDecision", owner };
  if (decision.kind === "image-placement") {
    const creatureSlots = effect.creatureSlots || [], supportSlots = effect.supportSlots || [];
    if (creatureSlots.length) return { ...command, slot: creatureSlots[0], placementZone: "creature" };
    if (supportSlots.length) return { ...command, slot: supportSlots[0], placementZone: "support" };
    return null;
  }
  if (decision.kind === "investigate-selection") {
    const visible = effect.cards || [];
    return { ...command, selectedCardIds: visible.map(cardId) };
  }
  if (decision.kind === "search") {
    const eligible = eligibleSearchCards(state, decision).sort((a, b) => aiCardValue(b, state, owner, difficulty) - aiCardValue(a, state, owner, difficulty));
    return { ...command, selectedCardIds: eligible.slice(0, Math.min(effect.amount || 1, eligible.length)).map(cardId) };
  }
  if (["hand-discard-one", "hand-limit-discard", "hand-to-deck-bottom"].includes(decision.kind)) {
    const amount = Math.min(effect.amount || (decision.kind === "hand-limit-discard" ? Math.max(0, entry.hand.length - 9) : 1), entry.hand.length);
    const cards = [...entry.hand].sort((a, b) => aiCardValue(a, state, owner, difficulty) - aiCardValue(b, state, owner, difficulty));
    return { ...command, selectedCardIds: cards.slice(0, amount).map(cardId) };
  }
  if (["grave-to-hand-many", "grave-to-hand-and-banish"].includes(decision.kind)) {
    const choices = new Set(effect.choices || []), minimum = Math.min(effect.minimum ?? 0, choices.size), maximum = Math.min(effect.maximum ?? choices.size, choices.size);
    const selected = entry.grave.filter((card) => choices.has(cardId(card))).sort((a, b) => aiCardValue(b, state, owner, difficulty) - aiCardValue(a, state, owner, difficulty)).slice(0, Math.max(minimum, maximum));
    return { ...command, selectedCardIds: selected.map(cardId) };
  }
  if (["zone-card", "grave-resurrect"].includes(decision.kind)) {
    const choices = new Set(effect.choices || []), zone = decision.kind === "grave-resurrect" ? entry.grave : [...entry.hand, ...entry.grave, ...entry.deck];
    const selected = zone.filter((card) => choices.has(cardId(card))).sort((a, b) => aiCardValue(b, state, owner, difficulty) - aiCardValue(a, state, owner, difficulty))[0];
    return selected ? { ...command, selectedCardId: cardId(selected) } : null;
  }
  if (decision.kind === "forced-attack") {
    if (effect.attackerId && effect.defenderId) return { ...command, attackerId: effect.attackerId, defenderId: effect.defenderId, targetIds: [effect.attackerId, effect.defenderId] };
    const rule = effect.attacker || {}, attackers = (entry.board || []).filter((card) => (!rule.subtype || hasSubtype(card, rule.subtype)) && (!rule.ready || !card.exhausted) && isReadyAttacker(card));
    const defenders = state.players[1 - owner].board || [];
    if (!attackers.length || !defenders.length) return null;
    const attacker = attackers.sort((a, b) => Number(b.atk || 0) - Number(a.atk || 0))[0], defender = [...defenders].sort((a, b) => Number(a.hp || 1) - Number(a.damage || 0) - (Number(b.hp || 1) - Number(b.damage || 0)))[0];
    return { ...command, attackerId: cardId(attacker), defenderId: cardId(defender), targetIds: [cardId(attacker), cardId(defender)] };
  }
  if (decision.kind === "zayan-destruction-replacement") { const candidates = entry.board.filter((card) => (effect.choices || []).includes(cardId(card))).sort((a, b) => aiCardValue(a, state, owner, difficulty) - aiCardValue(b, state, owner, difficulty)); return candidates.length && difficulty !== "Fácil" ? { ...command, choiceIndex: 1, targetIds: [cardId(candidates[0])] } : { ...command, choiceIndex: 0, targetIds: [] }; }
  if (decision.kind === "maria-stat-tie") { const candidates = entry.board.filter((card) => (effect.choices || []).includes(cardId(card))).sort((a, b) => Number(b.hp || 1) - Number(b.damage || 0) - (Number(a.hp || 1) - Number(a.damage || 0))); return candidates[0] ? { ...command, targetIds: [cardId(candidates[0])] } : null; }
  if (decision.kind === "marker-payment-search") { let remaining = effect.amount || 5; const markerSelections = []; for (const choice of effect.choices || []) { const amount = Math.min(remaining, Number(choice.markers || 0)); if (amount > 0) markerSelections.push({ id: choice.id, amount }); remaining -= amount; if (!remaining) break; } return remaining ? null : { ...command, markerSelections }; }
  if (decision.kind === "sacrifice-and-fill") {
    const maximum = Math.min(effect.maximum ?? entry.board.length, entry.board.length), targets = [...entry.board].sort((a, b) => aiCardValue(a, state, owner, difficulty) - aiCardValue(b, state, owner, difficulty)).slice(0, maximum);
    return { ...command, targetIds: targets.map(cardId) };
  }
  if (decision.kind === "draw-position") return { ...command, choiceIndex: difficulty === "Fácil" ? Math.floor(Math.random() * 2) : 0 };
  if (decision.kind === "redirect") return { ...command, choiceIndex: 0 };
  if (decision.kind === "choice" && effect.aiPolicy === "saymon-condutor") {
    const minimumLife = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0;
    const canPay = entry.life - 4 >= minimumLife;
    const hasVampire = (entry.deck || []).some((card) => card.type === "Criatura" && hasSubtype(card, "Vampiro") && Number(card.cost || 0) >= 4);
    return { ...command, choiceIndex: canPay && hasVampire && difficulty !== "Fácil" ? 1 : 0 };
  }
  if (decision.kind === "replay-ability") {
    const candidates = permanentUnits(entry).filter((card) => card.type === (effect.selector?.type || card.type) && (card.abilities || []).some((ability) => ability.trigger === effect.trigger));
    const selected = candidates.sort((a, b) => aiCardValue(b, state, owner, difficulty) - aiCardValue(a, state, owner, difficulty))[0];
    return selected ? { ...command, selectedCardId: cardId(selected) } : null;
  }
  if (decision.kind === "optional-sacrifice-buff") {
    const sourceId = decision.context?.sourceId, maximum = Math.min(effect.maximum || 3, Math.max(0, entry.board.length - 1));
    const targets = entry.board.filter((card) => cardId(card) !== sourceId).sort((a, b) => aiCardValue(a, state, owner, difficulty) - aiCardValue(b, state, owner, difficulty)).slice(0, difficulty === "Fácil" ? 0 : maximum);
    return { ...command, targetIds: targets.map(cardId) };
  }
  if (decision.kind === "choice-target") {
    if (effect.optional && difficulty === "Fácil" && Math.random() < .35) return command;
    const steps = decision.targetSteps?.length ? decision.targetSteps : [{ scope: "anyCreature" }], targets = chooseAITargetIds(state, owner, steps, decision.context?.effectSource, difficulty);
    if (!targets?.length) return effect.optional ? command : null;
    let choiceIndex = 0;
    if ((effect.choices || []).length > 1) {
      const target = state.players.flatMap((player) => player.board).find((card) => cardId(card) === targets[0]);
      if (target && Number(target.hp || 1) - Number(target.damage || 0) <= Number(target.atk || 0)) choiceIndex = 1;
    }
    return { ...command, choiceIndex, targetIds: targets };
  }
  if (["targets", "activation-targets"].includes(decision.kind)) {
    const targets = chooseAITargetIds(state, owner, decision.targetSteps || [], decision.context?.effectSource, difficulty);
    return targets ? { ...command, targetIds: targets } : null;
  }
  if ((effect.choices || []).length) return { ...command, choiceIndex: difficulty === "Fácil" ? Math.floor(Math.random() * effect.choices.length) : 0 };
  return { ...command, choiceIndex: 0, targetIds: [] };
}

function imageSelection(card, player) {
  if (Number(card?.page) !== 70) return undefined;
  const allowed = ["Maestria Elemental: Piromancia", "Maestria Elemental: Hidromancia", "Maestria Elemental: Geomancia", "Maestria Elemental: Aeromancia"];
  return allowed.find((name) => (player.extraDeck || []).some((candidate) => normalized(candidate.name) === normalized(name)));
}

export function completeAIPlayCommand(state, owner, card, difficulty = "Normal", options = {}) {
  const entry = state.players[owner], policy = cardPlayTargetPolicy(card), steps = policy.steps || [];
  const masteryElements = permanentUnits(entry).flatMap((source) => Number(source.page) === 71 ? ["Ar"] : Number(source.page) === 72 ? ["Água"] : Number(source.page) === 73 ? ["Terra"] : Number(source.page) === 74 ? ["Fogo"] : []);
  const chosenElement = Number(card.page) === 55 ? ((entry.life || 30) < 15 && masteryElements.includes("Água") ? "Água" : (entry.reserve || 0) < 3 && masteryElements.includes("Ar") ? "Ar" : masteryElements.includes("Fogo") ? "Fogo" : masteryElements[0] || "Fogo") : undefined;
  const ids = chooseAITargetIds(state, owner, steps, card, difficulty); if (ids == null) return null;
  const sacrificeIds = [], targetIds = []; let attachedTo;
  steps.forEach((step, index) => { const id = ids[index]; if (!id) return; if (step.role === "sacrifice") sacrificeIds.push(id); else if (step.role === "attachment") attachedTo = id; else targetIds.push(id); });
  if (card.type === "Artefato" && !attachedTo) attachedTo = (entry.board || []).find((unit) => !(entry.support || []).some((item) => item.attachedTo === cardId(unit)))?.uid;
  const catSupport = card.type === "Criatura" && entry.heroId === "rasmus" && (entry.level || 1) >= 3 && hasSubtype(card, "Gato") && entry.board.length >= 5 && entry.support.length < 5;
  const occupied = card.type === "Criatura" && !catSupport ? entry.board : entry.support, fieldSlot = card.type === "Terreno" ? 0 : card.type === "Artefato" && attachedTo ? entry.board.find((unit) => cardId(unit) === attachedTo)?.slot : preferredAISlot({ ...entry, board: occupied });
  if (card.type !== "Feitiço" && card.type !== "Terreno" && fieldSlot == null) return null;
  return { type: "playCard", owner, cardId: card.id, instanceId: `ai-${state.round}-${card.id}-${state.events || 0}`, slot: fieldSlot, placementZone: catSupport ? "support" : undefined, attachedTo, targetIds, sacrificeIds, chosenElement, selectedImageName: imageSelection(card, entry), cafeEffect: Number(card.page) === 231 ? ((entry.life || 30) < 12 ? "heal" : "draw") : undefined, hasPriority: !!options.hasPriority };
}

function completeAIActivationCommand(state, owner, source, ability, difficulty = "Normal") {
  const entry = state.players[owner], opponent = state.players[1 - owner];
  if (!source || source.summoning) return null;
  const command = { type: "activate", owner, sourceId: cardId(source), abilityId: ability.id };
  const xCost = (ability.costs || []).find((cost) => cost.type === "removeMarkers" && String(cost.amount || "").toUpperCase() === "X");
  if (xCost) {
    const available = markerTotal(source), minimum = Number(xCost.minimum || 0);
    if (available < minimum) return null;
    if (Number(source.page) === 134) {
      const missingLife = Math.max(0, Number(entry.maxLife ?? 30) - Number(entry.life || 0));
      if (!missingLife) return null;
      command.markerAmount = Math.max(minimum, Math.min(available, missingLife));
    } else command.markerAmount = available;
  }
  const lifeCost = (ability.costs || []).filter((cost) => cost.type === "life").reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  if (lifeCost) {
    const hardFloor = entry.heroId === "saymon" && (entry.level || 1) >= 3 ? 1 : 0;
    const after = Number(entry.life || 0) - lifeCost;
    if (after < hardFloor) return null;
    const tacticalFloor = difficulty === "Difícil" ? Math.max(hardFloor, 3) : Math.max(hardFloor, 6);
    if (after < tacticalFloor) return null;
    const keywords = [...(source.tags || []), ...(source.temporaryTags || []), ...(source.grantedKeywords || [])].map(normalized).join(' ');
    if (Number(source.page) === 137 && (!opponent.board?.length || keywords.includes('toque da morte'))) return null;
    if (Number(source.page) === 138 && (!opponent.board?.length || source.exhausted || keywords.includes('veloz'))) return null;
    if (Number(source.page) === 141) {
      const host = (entry.board || []).find((card) => cardId(card) === source.attachedTo);
      if (!host || host.exhausted) return null;
    }
  }
  return command;
}

export function buildAIActionCandidates(state, owner, difficulty = "Normal") {
  if (!state || state.winner != null) return [];
  if (state.pendingDecision) { const decision = chooseAIDecision(state, owner, difficulty); return decision ? [decision] : []; }
  if (state.pendingReposition?.activeOwner === owner) return [{ type: "confirmReposition", owner }];
  if (state.pendingResponse?.responder === owner) return [];
  if (state.active !== owner) return [];
  const entry = state.players[owner], candidates = [];
  if (state.phase === "principal") {
    for (const source of permanentUnits(entry)) {
      const abilities = (source.abilities || []).filter((ability) => ability.trigger === "activated");
      if (Number(source.page) === 134 || normalized(source.name) === "cobra dor") {
        const ability = abilities[0];
        const available = markerTotal(source), missingLife = Math.max(0, Number(entry.maxLife ?? 30) - Number(entry.life || 0));
        if (ability && !source.summoning && available > 0 && missingLife > 0) candidates.push({ type: "activate", owner, sourceId: cardId(source), abilityId: ability.id, markerAmount: Math.min(available, missingLife) });
        continue;
      }
      for (const ability of abilities) { const command = completeAIActivationCommand(state, owner, source, ability, difficulty); if (command) candidates.push(command); }
    }
    const cards = [...entry.hand].sort((a, b) => aiCardValue(b, state, owner, difficulty) - aiCardValue(a, state, owner, difficulty));
    for (const card of cards) { const command = completeAIPlayCommand(state, owner, card, difficulty); if (command) candidates.push(command); }
  }
  if (state.phase === "combate") for (const attacker of orderAIAttackers(entry, difficulty)) {
    const defenders = state.players[1 - owner].board || [];
    candidates.push({ type: "attack", owner, attackerId: cardId(attacker), ...(defenders.length ? { defenderId: cardId([...defenders].sort((a, b) => Number(a.hp || 1) - Number(b.hp || 1))[0]) } : {}) });
  }
  candidates.push({ type: "advancePhase", owner });
  return candidates;
}

/** Pick the first command that the authoritative engine accepts on a clone. */
export function chooseValidatedAIAction(state, owner, validate, difficulty = "Normal") {
  for (const command of buildAIActionCandidates(state, owner, difficulty)) {
    try { if (!validate || validate(command)) return command; } catch { /* Try the next legal line instead of stalling. */ }
  }
  return state?.active === owner && !state?.pendingDecision ? { type: "advancePhase", owner } : null;
}

/** Hero powers still live in the presentation game model; expose one normalized intent for them. */
export function chooseAIHeroAbility(state, owner, difficulty = "Normal") {
  const entry = state?.players?.[owner], opponent = state?.players?.[1 - owner]; if (!entry || state.active !== owner || state.phase !== "principal") return null;
  const used = (slot) => !!entry.abilityUses?.[`${entry.heroId}-${slot}`];
  if (entry.heroId === "gimble" && entry.level >= 2 && !used(1)) { const target = (entry.board || []).filter((card) => hasSubtype(card, "Dragão") && card.exhausted).sort((a, b) => aiCardValue(b, state, owner, difficulty) - aiCardValue(a, state, owner, difficulty))[0]; if (target) return { kind: "gimble-ready", slot: 1, targetId: cardId(target) }; }
  if (entry.heroId === "saymon" && entry.level >= 2 && !used(1) && entry.life > 8) { const target = (entry.board || []).filter((card) => !(card.tags || []).some((tag) => /roubo de vida/i.test(String(tag)))).sort((a, b) => Number(b.atk || 0) - Number(a.atk || 0))[0]; if (target) return { kind: "saymon-lifesteal", slot: 1, targetId: cardId(target) }; }
  if (entry.heroId === "saymon" && entry.level >= 1 && !used(0) && entry.life > (difficulty === "Difícil" ? 6 : 10)) { const target = (opponent.board || []).sort((a, b) => (Number(a.hp || 1) - Number(a.damage || 0)) - (Number(b.hp || 1) - Number(b.damage || 0)))[0]; return { kind: "saymon-damage", slot: 0, targetId: target ? cardId(target) : "enemy-hero" }; }
  const clueCount = Math.max(Number(entry.heroXP || 0), Number(entry.markers?.clue || 0));
  if (entry.heroId === "ngoro" && entry.level >= 3 && !used(2) && clueCount >= 3) { const target = (entry.board || []).sort((a, b) => Number(b.atk || 0) - Number(a.atk || 0))[0]; if (target) return { kind: "ngoro-stealth", slot: 2, targetId: cardId(target) }; }
  if (entry.heroId === "ngoro" && entry.level >= 2 && !used(1) && clueCount >= 2) return { kind: "ngoro-clue-action", slot: 1 };
  if (entry.heroId === "natureza" && entry.level >= 1 && !used(0)) { const target = permanentUnits(entry).sort((a, b) => aiCardValue(b, state, owner, difficulty) - aiCardValue(a, state, owner, difficulty))[0]; if (target) return { kind: "nature-markers", slot: 0, targetId: cardId(target) }; }
  return null;
}
