const clone = (value) => structuredClone(value);
const flip = (value) => value === 0 ? 1 : value === 1 ? 0 : value;
const orientCommand = (command) => command && typeof command === "object"
  ? { ...command, owner: flip(command.owner) }
  : command;

/**
 * Convert the canonical host-oriented snapshot into the local perspective.
 * The function is pure and shared by reconnect, HUD and presentation paths so
 * nested ownership cannot drift between multiple client implementations.
 */
export function orientOnlineGameForRole(input, role = "host") {
  const game = clone(input);
  if (!game || role === "host") return game;

  if (Array.isArray(game.players) && game.players.length >= 2) game.players = [game.players[1], game.players[0]];
  game.active = flip(game.active);
  game.winner = flip(game.winner);

  if (game.pendingResponse) game.pendingResponse = { ...game.pendingResponse, responder: flip(game.pendingResponse.responder), actor: flip(game.pendingResponse.actor) };
  if (game.pendingAction) game.pendingAction = orientCommand(game.pendingAction);
  if (Array.isArray(game.priorityStack)) game.priorityStack = game.priorityStack.map((frame) => ({ ...frame, actor: flip(frame.actor), command: orientCommand(frame.command) }));
  if (game.priority) game.priority = { ...game.priority, owner: flip(game.priority.owner) };
  if (Array.isArray(game.stack)) game.stack = game.stack.map((frame) => ({ ...frame, controller: flip(frame.controller), command: orientCommand(frame.command) }));

  if (game.pendingDecision) {
    game.pendingDecision = {
      ...game.pendingDecision,
      owner: flip(game.pendingDecision.owner),
      context: game.pendingDecision.context ? {
        ...game.pendingDecision.context,
        owner: flip(game.pendingDecision.context.owner),
        decisionOwner: flip(game.pendingDecision.context.decisionOwner),
        targetOwner: flip(game.pendingDecision.context.targetOwner),
      } : game.pendingDecision.context,
      effect: game.pendingDecision.effect
        ? { ...game.pendingDecision.effect, targetOwner: flip(game.pendingDecision.effect.targetOwner) }
        : game.pendingDecision.effect,
    };
  }

  if (game.pendingReposition) game.pendingReposition = {
    ...game.pendingReposition,
    owners: (game.pendingReposition.owners || []).map(flip),
    confirmed: (game.pendingReposition.confirmed || []).map(flip),
    activeOwner: flip(game.pendingReposition.activeOwner),
  };

  if (game.combatAction) game.combatAction = { ...game.combatAction, attackerOwner: flip(game.combatAction.attackerOwner) };
  if (game.onlineCombat) game.onlineCombat = {
    ...game.onlineCombat,
    attackerOwner: flip(game.onlineCombat.attackerOwner),
    interaction: game.onlineCombat.interaction
      ? { ...game.onlineCombat.interaction, owner: flip(game.onlineCombat.interaction.owner) }
      : game.onlineCombat.interaction,
  };
  if (game.onlineFinalization) game.onlineFinalization = { ...game.onlineFinalization, owner: flip(game.onlineFinalization.owner) };
  return game;
}

export const orientOnlineOwner = flip;

