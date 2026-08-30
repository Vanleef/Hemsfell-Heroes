const cardIdentity = (card: any) => String(card?.uid || card?.id || `${card?.page ?? ""}:${card?.name ?? ""}`);

const unitFingerprint = (unit: any) => ({
  id: cardIdentity(unit),
  slot: unit?.slot,
  damage: unit?.damage,
  bonusAtk: unit?.bonusAtk,
  bonusHp: unit?.bonusHp,
  temporaryAtk: unit?.temporaryAtk,
  temporaryHp: unit?.temporaryHp,
  markers: unit?.markers,
  exhausted: unit?.exhausted,
  summoning: unit?.summoning,
  frozen: unit?.frozen,
  stunned: unit?.stunned,
  suffocated: unit?.suffocated,
  immobilized: unit?.immobilized,
  tags: unit?.tags,
  temporaryTags: unit?.temporaryTags,
  modifiers: unit?.modifiers,
  grantedKeywords: unit?.grantedKeywords,
});

/**
 * Material presentation identity. Timing, priority and diagnostics are omitted
 * intentionally: bookkeeping-only revisions must not replay animations.
 */
export const presentationFingerprint = (game: any) => JSON.stringify({
  winner: game?.winner,
  players: (game?.players || []).map((player: any) => ({
    life: player?.life,
    level: player?.level,
    heroXP: player?.heroXP,
    markers: player?.markers,
    hand: (player?.hand || []).map(cardIdentity),
    board: (player?.board || []).map(unitFingerprint),
    support: (player?.support || []).map(unitFingerprint),
    terrain: player?.terrain ? unitFingerprint(player.terrain) : null,
    grave: (player?.grave || []).map(cardIdentity),
    obscuro: (player?.obscuro || []).map(cardIdentity),
    extraDeck: (player?.extraDeck || []).map(cardIdentity),
  })),
});

export const hasPresentableDelta = (before: any, after: any) =>
  !!before && !!after && presentationFingerprint(before) !== presentationFingerprint(after);

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const presentationTransitionKey = ({ before, after, revision }: { before: any; after: any; revision?: number }) => {
  const scope = revision == null ? "local" : `rev:${revision}`;
  return `${scope}:${hashText(presentationFingerprint(before))}>${hashText(presentationFingerprint(after))}`;
};

export { cardIdentity };

