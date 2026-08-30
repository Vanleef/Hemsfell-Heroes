export const GameCommandType = Object.freeze({
  PLAY_CARD: "playCard",
  ACTIVATE: "activate",
  ACTIVATE_HERO: "activateHero",
  EVOLVE_HERO: "evolveHero",
  DECLARE_ATTACK: "declareAttack",
  SELECT_DEFENDER: "selectDefender",
  PASS_PRIORITY: "passPriority",
  RESOLVE_DECISION: "resolveDecision",
  ADVANCE_PHASE: "advancePhase",
  MAINTENANCE_CHOICE: "maintenanceChoice",
  REPOSITION: "reposition",
  CONFIRM_REPOSITION: "confirmReposition",
  SURRENDER: "surrender",
});

const KNOWN_COMMAND_TYPES = new Set(Object.values(GameCommandType));

/** Envelope validation only; timing, costs and targets remain rules-engine work. */
export function assertGameCommandEnvelope(command) {
  if (!command || typeof command !== "object") throw new Error("game-command-missing");
  if (typeof command.type !== "string" || !command.type) throw new Error("game-command-type-missing");
  if (!KNOWN_COMMAND_TYPES.has(command.type) && typeof command.owner !== "number") {
    throw new Error("game-command-owner-missing");
  }
  if (command.owner != null && ![0, 1].includes(command.owner)) throw new Error("game-command-invalid-owner");
  return command;
}

export const isKnownGameCommand = (command) => !!command && KNOWN_COMMAND_TYPES.has(command.type);

