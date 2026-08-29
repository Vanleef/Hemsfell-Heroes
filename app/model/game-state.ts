/**
 * Shared match-state contracts.
 *
 * Card templates come from the catalog; Unit represents a runtime instance
 * whose identity and transient combat fields belong only to a match snapshot.
 * Keeping these types outside React prevents the View from becoming the owner
 * of the domain model while the ESM rules engine remains the runtime authority.
 */

export type PlayerIndex = 0 | 1;
export type CardType = "Criatura" | "Feitiço" | "Artefato" | "Encanto" | "Terreno" | "Herói";
export type ElementName = "Fogo" | "Água" | "Terra" | "Ar";
export type Phase = "manutencao" | "principal" | "combate" | "fim";
export type CombatStage = "declared" | "priority" | "choosing" | "charging" | "impact" | "resolved";

export type CardDef = {
  page: number;
  id: string;
  name: string;
  type: CardType;
  cost: number;
  atk?: number;
  hp?: number;
  text: string;
  tags: string[];
  image: string;
  hero: boolean;
  imageCard: boolean;
  revealed?: boolean;
  revealedTo?: number[];
  subtypes?: string[];
  abilities?: any[];
  rules?: unknown;
  diagnostics?: { source?: string; unsupported?: number };
  generatedImage?: boolean;
  collectionQuantity?: number;
};

export type Unit = CardDef & {
  uid: string;
  slot: number;
  enteredRound?: number;
  damage: number;
  bonusAtk: number;
  bonusHp: number;
  temporaryAtk?: number;
  temporaryHp?: number;
  temporaryTags?: string[];
  temporarySubtypes?: string[];
  combatRestrictions?: Array<{ cannotCombatSubtype?: string; duration?: string }>;
  attackLimit?: number;
  attacksThisTurn?: number;
  markers: number;
  modifiers?: Array<{ attack?: number; health?: number; duration?: string; sourceId?: string }>;
  grantedKeywords?: string[];
  staticModifiers?: any[];
  lastDamagedBy?: string;
  damagedOwnersThisTurn?: number[];
  activatedThisTurn?: boolean;
  attackedThisTurn?: boolean;
  exhausted: boolean;
  summoning: boolean;
  frozen: boolean;
  stunned: boolean;
  suffocated: boolean;
  immobilized: boolean;
  impacting?: boolean;
  defenseUses: number;
  attachedTo?: string;
  temporary?: boolean;
  generatedImage?: boolean;
};

export type PlayerState = {
  heroId: string;
  level: number;
  heroXP: number;
  markers?: number | Record<string, number>;
  levelUpsThisTurn: number;
  life: number;
  lifeLostThisTurn?: number;
  lifeLossEvents?: number;
  maxEnergy: number;
  energy: number;
  reserve: number;
  noReserveStorageThisTurn?: boolean;
  nextCardDiscounts?: Array<{ amount: number; type?: CardType; typeNot?: CardType; expiresRound?: number }>;
  deck: CardDef[];
  extraDeck: CardDef[];
  hand: CardDef[];
  board: Unit[];
  support: Unit[];
  terrain: Unit | null;
  grave: CardDef[];
  obscuro: CardDef[];
  cardsPlayed: number;
  turnCardsPlayed: number;
  goblinTurnCardsPlayed?: number;
  turnSpellsPlayed: number;
  spellsPlayed: number;
  coffeeSpells: number;
  damageDealt: number;
  turnDeaths: number;
  abilityUses: Record<string, number>;
  pendingTranqueira: boolean;
  nextCardDiscount: number;
  nextNonCreatureDiscount: number;
  nextSpellDiscount: number;
  nextSummonPaysLife: boolean;
  nextCreaturePaysLife?: boolean;
  catsEnteredThisTurn: number;
  fieldSubtypeCounts?: Record<string, number>;
  elementChain?: { element: ElementName; effect: "Sufocado" | "Atordoado" | "Congelado" | "Imobilizado" };
  nextElementEffects?: Array<{ element: ElementName; keyword: string; expires?: string }>;
  lastElement?: ElementName;
  lastElementSource?: string;
};

export type PendingResponse = {
  responder: PlayerIndex;
  actor: PlayerIndex;
  action: string;
  deadline?: number;
  passes?: number;
};

export type PendingDecision = {
  kind: string;
  owner: PlayerIndex;
  effect: {
    choices?: any[];
    cards?: CardDef[];
    targetOwner?: PlayerIndex;
    replayEffects?: any[];
    minimum?: number;
    maximum?: number;
    amount?: number;
    types?: string[];
    subtype?: string;
    vanillaOnly?: boolean;
    minCost?: number;
    maxCost?: number;
    maxCostFromMarkerAmount?: boolean;
    markerCost?: number;
    nameIncludes?: string;
    name?: string;
    creatureSlots?: number[];
    supportSlots?: number[];
  };
  context?: Record<string, any>;
  targetSteps?: Array<{
    scope: string;
    role?: string;
    requiredSubtype?: string;
    requiredName?: string;
    imageOnly?: boolean;
    excludeIds?: string[];
    allowedIds?: string[];
    maxCost?: number;
    requireExhausted?: boolean;
    requiresDamagedOwnerThisTurn?: boolean;
    requiresEffectAppliedThisTurn?: boolean;
    requiresMarker?: boolean;
    optional?: boolean;
  }>;
  sourceName?: string;
};

export type CombatAction = {
  attackerOwner: PlayerIndex;
  attackerUid: string;
  attackerCard: CardDef;
  defenderUid?: string;
  defenderCard?: CardDef;
  targetHero?: boolean;
  stage: CombatStage;
  result?: string;
  destroyed?: Array<"attacker" | "defender">;
  winnerText?: string;
  attackDamage?: number;
  counterDamage?: number;
};

export type GameState = {
  players: [PlayerState, PlayerState];
  active: PlayerIndex;
  phase: Phase;
  round: number;
  log: Array<{ id: string; text: string; tone?: string }>;
  winner: number | null;
  selectedAttackers: string[];
  events: number;
  combatAction?: CombatAction | null;
  pendingAction?: Record<string, unknown>;
  priorityStack?: Array<{ kind?: string; actor?: PlayerIndex; label?: string; command?: Record<string, unknown> }>;
  pendingResponse?: PendingResponse | null;
  pendingDecision?: PendingDecision | null;
  pendingReposition?: {
    owners: PlayerIndex[];
    confirmed: PlayerIndex[];
    activeOwner?: PlayerIndex;
    moveAttachments: boolean;
    sourceId?: string;
    deadline?: number;
  } | null;
  turnDeadline?: number | null;
};

export type MatchSettings = { startingLife: number; responseSeconds: number; turnSeconds: number };
export type OnlineSession = { roomId: string; token: string; isHost: boolean };

