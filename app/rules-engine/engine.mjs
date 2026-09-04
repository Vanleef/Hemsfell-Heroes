/* Browser instrumentation facade. The authoritative rules implementation lives in
 * engine-core.mjs and stays side-effect free. Presentation is explicitly opt-in:
 * legality probes, combat queries and AI simulations also execute cloned states in
 * the browser and must never be mistaken for completed match transitions. */
import { executeCommand as executeCore } from "./engine-core.mjs";
import { normalizeAscensionState } from "./cards/ascension.mjs";
export * from "./engine-core.mjs";

const RULES_RESOLVED_EVENT = "hemsfell:rules-command-resolved";
const SILENCIO_ENSURDECEDOR_PAGE = 147;
const MAX_LIVE_LOG_ENTRIES = 200;

const browserClone = (value) => {
  try { return structuredClone(value); }
  catch { return value; }
};
const permanentId = (card) => card?.uid || card?.id;
const permanentRecords = (state) => (state?.players || []).flatMap((entry, owner) => [
  ...(entry.board || []).map((card) => ({ owner, zone: "board", card })),
  ...(entry.support || []).map((card) => ({ owner, zone: "support", card })),
  ...(entry.terrain ? [{ owner, zone: "terrain", card: entry.terrain }] : []),
]);
const stripRuntimeCardState = (card) => {
  const copy = browserClone(card);
  for (const key of [
    "uid", "slot", "damage", "bonusAtk", "bonusHp", "temporaryAtk", "temporaryHp",
    "temporaryTags", "modifiers", "attackedThisTurn", "attacksThisTurn", "exhausted",
    "summoning", "frozen", "stunned", "suffocated", "suffocatedBySources",
    "suffocatedUntilTurnEnd", "immobilized", "markers", "defenseUses", "activatedThisTurn",
    "impacting", "hhSuffocatingTargetId",
  ]) delete copy?.[key];
  return copy;
};

/* Silêncio Ensurdecedor is a source-bound continuous effect. The core effect
 * already records the source id on the target; mirror that relation on the
 * enchantment so a later transition can tell when its specific target left the
 * battlefield. This facade is shared by browser, tests and online priority. */
function enforceSilencioTargetLifecycle(before, state) {
  if (!before || !state?.players) return state;
  const beforePermanents = permanentRecords(before);
  let currentPermanents = permanentRecords(state);
  const beforeById = new Map(beforePermanents.map((record) => [permanentId(record.card), record.card]));
  const currentIds = new Set(currentPermanents.map((record) => permanentId(record.card)));

  for (const record of currentPermanents.filter(({ card }) => Number(card?.page) === SILENCIO_ENSURDECEDOR_PAGE)) {
    const source = record.card;
    const sourceId = permanentId(source);
    if (!sourceId) continue;

    const linkedBefore = beforePermanents.find(({ card }) => (card?.suffocatedBySources || []).includes(sourceId));
    const linkedNow = currentPermanents.find(({ card }) => (card?.suffocatedBySources || []).includes(sourceId));
    const targetId = source.hhSuffocatingTargetId || permanentId(linkedNow?.card) || permanentId(linkedBefore?.card);
    if (targetId) source.hhSuffocatingTargetId = targetId;
    if (!targetId || !beforeById.has(targetId) || currentIds.has(targetId)) continue;

    const entry = state.players[record.owner];
    if (record.zone === "board") entry.board = (entry.board || []).filter((card) => permanentId(card) !== sourceId);
    else if (record.zone === "support") entry.support = (entry.support || []).filter((card) => permanentId(card) !== sourceId);
    else if (record.zone === "terrain" && permanentId(entry.terrain) === sourceId) entry.terrain = null;

    entry.grave ||= [];
    entry.grave.push(stripRuntimeCardState(source));

    /* No target should retain a source token after the enchantment follows its
       target out of play. This also restores Sufocar only when no other source
       or until-turn-end effect is still active. */
    currentPermanents = permanentRecords(state);
    for (const { card } of currentPermanents) {
      if (!Array.isArray(card?.suffocatedBySources)) continue;
      card.suffocatedBySources = card.suffocatedBySources.filter((id) => id !== sourceId);
      if (!card.suffocatedBySources.length && !card.suffocatedUntilTurnEnd) card.suffocated = false;
    }

    if (Array.isArray(state.log)) state.log.unshift({
      id: `silencio-target-left-${sourceId}-${state.events || 0}`,
      text: "Silêncio Ensurdecedor deixou o campo porque a carta que ele sufocava saiu de campo.",
      tone: "effect",
    });
    if (state.log?.length > MAX_LIVE_LOG_ENTRIES) state.log.length = MAX_LIVE_LOG_ENTRIES;
    if (Number.isFinite(Number(state.events))) state.events += 1;
  }
  return state;
}

const publishBrowserResolution = (detail) => {
  /* Dispatch before React commits the returned state. The presentation runtime
     captures the real pre-action DOM and raises its busy barrier synchronously,
     so result dialogs cannot flash ahead of the card animation. */
  window.dispatchEvent(new CustomEvent(RULES_RESOLVED_EVENT, { detail }));
};

export function executeCommand(inputState, command, options = {}) {
  const shouldPresent = options?.presentation === true
    && typeof window !== "undefined"
    && typeof CustomEvent !== "undefined";
  const before = shouldPresent ? browserClone(inputState) : null;
  const rulesInput = normalizeAscensionState(inputState, command);
  const rulesBefore = browserClone(rulesInput);
  const result = executeCore(rulesInput, command, options);
  if (result?.state) enforceSilencioTargetLifecycle(rulesBefore, result.state);
  if (shouldPresent && before && result?.state && command?.type) {
    publishBrowserResolution({
      before,
      after: browserClone(result.state),
      command: browserClone(command),
      trace: browserClone(result.trace || []),
    });
  }
  return result;
}
