/**
 * Shared multiplayer limits. Keeping them in one module prevents the client
 * contract, request validation and room state machine from drifting apart.
 */
export const ROOM_LIMITS = {
  payloadBytes: 512 * 1024,
  life: { min: 10, max: 100, fallback: 30 },
  responseSeconds: { min: 10, max: 120, fallback: 30 },
  turnSeconds: { min: 30, max: 600, fallback: 120 },
  zones: {
    hand: 30,
    deck: 80,
    extraDeck: 40,
    board: 5,
    support: 5,
    grave: 160,
    obscuro: 160,
  },
} as const;

