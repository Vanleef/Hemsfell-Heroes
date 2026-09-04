const fold = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, " ")
  .trim()
  .toLowerCase();

const clone = (value) => structuredClone(value);

/**
 * Ascensão X is a play-time keyword, never an activated ability or an energy
 * cost. X is a threshold over the controller's maximum Energy.
 */
export function ascensionSpec(cardOrText = "") {
  const text = typeof cardOrText === "string" ? cardOrText : String(cardOrText?.text || "");
  const match = text.match(/\bAscens(?:ão|ao)\s+(\d+)\s*:\s*([\s\S]*)/i);
  if (!match) return null;
  const threshold = Number(match[1]);
  if (!Number.isFinite(threshold) || threshold < 0) return null;
  return {
    threshold,
    label: `Ascensão ${threshold}`,
    effectText: String(match[2] || "").trim(),
  };
}

/**
 * Compatibility detector for old explicit records that incorrectly encoded an
 * Ascensão threshold as `activated + energy cost X`. This lets live/serialized
 * matches migrate without preserving a clickable activation.
 */
export function isLegacyAscensionAbility(card, ability) {
  const spec = ascensionSpec(card);
  if (!spec || ability?.trigger !== "activated") return false;
  const matchingEnergyThreshold = (ability.costs || []).some(
    (cost) => cost?.type === "energy" && Number(cost.amount) === spec.threshold,
  );
  if (!matchingEnergyThreshold) return false;
  return ability.uiActivation === true
    || (ability.effects || []).some((effect) => effect?.type === "transformFromHandOrDeck");
}

const syntheticAscensionAbility = (ability) => ability?.triggerMeta?.kind === "ascension";

function ascensionTargetAvailable(entry, legacyAbility, sourceCard) {
  const namedTransform = (legacyAbility?.effects || []).find(
    (effect) => effect?.type === "transformFromHandOrDeck" && effect?.name,
  );
  if (!namedTransform) return true;
  const wanted = fold(namedTransform.name);
  return [...(entry?.hand || []), ...(entry?.deck || [])].some(
    (candidate) => candidate !== sourceCard && fold(candidate?.name) === wanted,
  );
}

function normalizeCard(card, entry, armForPlay = false) {
  const spec = ascensionSpec(card);
  if (!spec) return card;

  const originalAbilities = card?.abilities || [];
  const legacyAbility = originalAbilities.find((ability) => isLegacyAscensionAbility(card, ability));
  const abilities = originalAbilities.filter(
    (ability) => !isLegacyAscensionAbility(card, ability) && !syntheticAscensionAbility(ability),
  );

  if (
    armForPlay
    && legacyAbility
    && Number(entry?.maxEnergy || 0) >= spec.threshold
    && ascensionTargetAvailable(entry, legacyAbility, card)
  ) {
    const ascension = clone(legacyAbility);
    ascension.id = `${legacyAbility.id || card.id || "card"}-ascension-${spec.threshold}`;
    ascension.trigger = "onPlay";
    ascension.costs = [];
    ascension.uiActivation = false;
    delete ascension.availability;
    ascension.triggerMeta = {
      ...(ascension.triggerMeta || {}),
      kind: "ascension",
      threshold: spec.threshold,
      scenario: `${spec.label}: ${spec.effectText}`,
    };
    abilities.push(ascension);
  }

  return { ...card, abilities };
}

const cardMatchesCommand = (card, command) => card
  && (card.id === command?.cardId || card.uid === command?.cardId);

function pendingPlayCommand(state, command) {
  if (command?.type === "playCard") return command;
  if (state?.pendingAction?.type === "playCard") return state.pendingAction;
  const root = state?.priorityStack?.find?.(
    (frame) => frame?.kind === "command" && frame?.command?.type === "playCard",
  );
  return root?.command || null;
}

/**
 * Normalize legacy Ascensão records at the authoritative command boundary.
 * The old activated ability is stripped in every zone. Only the card currently
 * being played is armed with a cost-free onPlay effect, and only when the
 * controller already has at least X maximum Energy.
 */
export function normalizeAscensionState(inputState, command) {
  if (!inputState?.players?.some((entry) => [
    ...(entry.hand || []), ...(entry.deck || []), ...(entry.extraDeck || []),
    ...(entry.board || []), ...(entry.support || []), ...(entry.grave || []),
    ...(entry.obscuro || []), ...(entry.terrain ? [entry.terrain] : []),
  ].some((card) => !!ascensionSpec(card)))) return inputState;

  const state = clone(inputState);
  const play = pendingPlayCommand(state, command);

  state.players.forEach((entry, owner) => {
    const arm = play && Number(play.owner) === owner ? play : null;
    entry.hand = (entry.hand || []).map((card) => normalizeCard(card, entry, !!arm && cardMatchesCommand(card, arm)));
    entry.deck = (entry.deck || []).map((card) => normalizeCard(card, entry, false));
    entry.extraDeck = (entry.extraDeck || []).map((card) => normalizeCard(card, entry, false));
    entry.board = (entry.board || []).map((card) => normalizeCard(card, entry, false));
    entry.support = (entry.support || []).map((card) => normalizeCard(card, entry, false));
    entry.grave = (entry.grave || []).map((card) => normalizeCard(card, entry, false));
    entry.obscuro = (entry.obscuro || []).map((card) => normalizeCard(card, entry, false));
    if (entry.terrain) entry.terrain = normalizeCard(entry.terrain, entry, false);
  });

  return state;
}
