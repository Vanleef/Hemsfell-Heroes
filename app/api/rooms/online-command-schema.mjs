const MAX_COMMAND_KEYS = 24;
const MAX_ID_LENGTH = 160;
const MAX_CHOICE_LENGTH = 160;
const MAX_LIST_ITEMS = 64;
const MAX_MARKER_SELECTIONS = 32;
const MAX_REPOSITION_MOVES = 5;

const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const boundedString = (value, max = MAX_ID_LENGTH) => typeof value === "string" && value.length > 0 && value.length <= max;
const id = (value) => boundedString(value);
const idList = (value) => Array.isArray(value) && value.length <= MAX_LIST_ITEMS && value.every(id);
const booleanValue = (value) => typeof value === "boolean";
const slot = (value) => integerIn(value, 0, 4);
const choiceIndex = (value) => integerIn(value, 0, 128);
const markerAmount = (value) => integerIn(value, 0, 100);
const placementZone = (value) => value === "creature" || value === "support";
const element = (value) => ["Fogo", "Água", "Terra", "Ar"].includes(value);
const cafeEffect = (value) => ["cats", "heal", "draw", "level"].includes(value);
const choice = (value) => boundedString(value, MAX_CHOICE_LENGTH);
const markerSelections = (value) => Array.isArray(value)
  && value.length <= MAX_MARKER_SELECTIONS
  && value.every((entry) => isRecord(entry) && id(entry.id) && integerIn(entry.amount, 1, 100) && Object.keys(entry).every((key) => key === "id" || key === "amount"));
const moves = (value) => Array.isArray(value)
  && value.length <= MAX_REPOSITION_MOVES
  && value.every((entry) => isRecord(entry) && id(entry.sourceId) && slot(entry.slot) && Object.keys(entry).every((key) => key === "sourceId" || key === "slot"));

const validators = Object.freeze({
  id,
  idList,
  boolean: booleanValue,
  slot,
  choiceIndex,
  markerAmount,
  placementZone,
  element,
  cafeEffect,
  choice,
  markerSelections,
  moves,
});

const COMMAND_SPECS = Object.freeze({
  playCard: {
    required: { cardId: "id" },
    optional: {
      slot: "slot",
      attachedTo: "id",
      targetIds: "idList",
      sacrificeIds: "idList",
      markerAmount: "markerAmount",
      chosenElement: "element",
      selectedImageName: "choice",
      cafeEffect: "cafeEffect",
      elementalTargetId: "id",
      placementZone: "placementZone",
    },
  },
  activate: {
    required: { sourceId: "id", abilityId: "id" },
    optional: { markerAmount: "markerAmount", targetIds: "idList", sacrificeIds: "idList" },
  },
  activateHero: {
    required: { abilityId: "id" },
    optional: { markerAmount: "markerAmount", targetIds: "idList", sacrificeIds: "idList" },
  },
  evolveHero: { required: {}, optional: {} },
  maintenanceChoice: { required: {}, optional: { drawTwo: "boolean" } },
  declareAttack: { required: { attackerId: "id" }, optional: {} },
  selectDefender: {
    required: { attackerId: "id" },
    optional: { defenderId: "id", targetHero: "boolean" },
  },
  attack: { required: { attackerId: "id" }, optional: { defenderId: "id" } },
  advancePhase: { required: {}, optional: {} },
  resolveDecision: {
    required: {},
    optional: {
      choiceIndex: "choiceIndex",
      selectedCardId: "id",
      selectedCardIds: "idList",
      targetIds: "idList",
      attackerId: "id",
      defenderId: "id",
      markerSelections: "markerSelections",
      markerAmount: "markerAmount",
      slot: "slot",
      placementZone: "placementZone",
    },
  },
  reposition: { required: { moves: "moves" }, optional: {} },
  confirmReposition: { required: {}, optional: {} },
  passPriority: { required: {}, optional: {} },
  surrender: { required: {}, optional: {} },
});

export const ONLINE_CLIENT_COMMAND_TYPES = Object.freeze(Object.keys(COMMAND_SPECS));
export const STRIPPED_AUTHORITY_FIELDS = Object.freeze([
  "owner", "side", "by", "instanceId", "hasPriority", "skipPriority", "auto",
  "handLimitSatisfied", "skipMaintenanceChoice", "__lockedCost", "__priorityPayment",
]);

const invalid = () => ({ ok: false, code: "INVALID_RULES_COMMAND", error: "invalid rules command" });

export function parseOnlineCommand(input) {
  if (!isRecord(input) || Object.keys(input).length > MAX_COMMAND_KEYS || !boundedString(input.type, 64)) return invalid();
  const spec = COMMAND_SPECS[input.type];
  if (!spec) return { ok: false, code: "UNSUPPORTED_RULES_COMMAND", error: "unsupported rules command" };
  const command = { type: input.type };
  for (const [key, validatorName] of Object.entries(spec.required)) {
    const validator = validators[validatorName];
    if (!validator(input[key])) return invalid();
    command[key] = input[key];
  }
  for (const [key, validatorName] of Object.entries(spec.optional)) {
    if (input[key] === undefined) continue;
    const validator = validators[validatorName];
    if (!validator(input[key])) return invalid();
    command[key] = input[key];
  }
  return { ok: true, command };
}
