export const TurnPhase = Object.freeze({
  MAINTENANCE: "manutencao",
  MAIN: "principal",
  COMBAT: "combate",
  FINALIZATION: "fim",
});

export const TURN_PHASE_ORDER = Object.freeze([
  TurnPhase.MAINTENANCE,
  TurnPhase.MAIN,
  TurnPhase.COMBAT,
  TurnPhase.FINALIZATION,
]);

export const PLAYER_ZONES = Object.freeze([
  "deck",
  "extraDeck",
  "hand",
  "board",
  "support",
  "terrain",
  "grave",
  "obscuro",
]);

export function nextTurnPhase(phase) {
  const index = TURN_PHASE_ORDER.indexOf(phase);
  if (index < 0) throw new Error(`unknown-turn-phase:${String(phase)}`);
  return TURN_PHASE_ORDER[(index + 1) % TURN_PHASE_ORDER.length];
}

/** Minimum runtime contract shared by local play, Online rooms and simulations. */
export function assertMatchStateShape(state) {
  if (!state || typeof state !== "object") throw new Error("match-state-missing");
  if (!Array.isArray(state.players) || state.players.length !== 2) throw new Error("match-state-requires-two-players");
  if (![0, 1].includes(state.active)) throw new Error("match-state-invalid-active-player");
  if (!TURN_PHASE_ORDER.includes(state.phase)) throw new Error("match-state-invalid-phase");
  return state;
}

export const cloneMatchState = (state) => structuredClone(assertMatchStateShape(state));

