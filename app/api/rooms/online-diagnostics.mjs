const cleanText = (value, limit = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const roleValue = (value) => value === "host" || value === "guest" ? value : undefined;
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : undefined;

/**
 * Builds a deliberately narrow server diagnostic snapshot. Never include raw
 * commands, target ids, card ids, hands, decks, tokens or decision payloads.
 */
export function buildOnlineDiagnostic(room, kind, details = {}, now = Date.now()) {
  const game = room?.game;
  const event = {
    at: Number(now),
    kind: cleanText(kind, 64),
    roomId: cleanText(room?.id, 96),
    revision: finite(room?.revision) ?? 0,
    active: game?.active === 0 || game?.active === 1 ? game.active : null,
    phase: cleanText(game?.phase, 32) || null,
    priorityOwner: game?.priority?.owner === 0 || game?.priority?.owner === 1 ? game.priority.owner : null,
    priorityWindow: cleanText(game?.priority?.window, 64) || null,
    stackDepth: finite(game?.priority?.stackDepth) ?? Number(game?.stack?.length || 0),
    combatStage: cleanText(game?.onlineCombat?.stage, 48) || null,
  };
  const role = roleValue(details.role);
  const commandType = cleanText(details.commandType, 64);
  const reason = cleanText(details.reason, 160);
  const baseRevision = finite(details.baseRevision);
  if (role) event.role = role;
  if (commandType) event.commandType = commandType;
  if (reason) event.reason = reason;
  if (baseRevision !== undefined) event.baseRevision = baseRevision;
  if (details.auto === true) event.auto = true;
  if (details.duplicate === true) event.duplicate = true;
  return event;
}

export function logOnlineDiagnostic(room, kind, details = {}) {
  const event = buildOnlineDiagnostic(room, kind, details);
  console.info("[hemsfell-online]", JSON.stringify(event));
  return event;
}
