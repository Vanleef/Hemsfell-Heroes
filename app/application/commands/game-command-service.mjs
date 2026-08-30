import { canExecuteCard as canExecuteRulesCard, executeCommand as executeRulesCommand } from "../../rules-engine/engine.mjs";
import { assertGameCommandEnvelope } from "../../rules-engine/commands/game-command.mjs";
import { assertMatchStateShape } from "../../rules-engine/state/match-state.mjs";

/**
 * Application boundary used by React. It validates the command/state envelope,
 * delegates all legality to the authoritative engine and returns its immutable
 * transition result. Presentation remains an explicit execution option.
 */
export function executeCommand(state, command, options = {}) {
  assertMatchStateShape(state);
  assertGameCommandEnvelope(command);
  const result = executeRulesCommand(state, command, options);
  assertMatchStateShape(result.state);
  return result;
}

export const canExecuteCard = (...args) => canExecuteRulesCard(...args);

