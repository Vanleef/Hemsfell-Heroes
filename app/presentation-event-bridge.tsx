"use client";

import { useEffect } from "react";

const RULES_RESOLVED_EVENT = "hemsfell:rules-command-resolved";
const PRESENTATION_EVENT = "hemsfell:presentation-action";
const ONLINE_SNAPSHOT_EVENT = "hemsfell:online-room-snapshot";
const EXCLUDED_COMMANDS = new Set(["declareAttack", "selectDefender", "reposition", "confirmReposition", "surrender"]);
const MAX_SEEN_TRANSITIONS = 256;

type SnapshotEntry = { revision: number; game: any; isHost: boolean };
type ConfirmedAck = { before: any; command: Record<string, any>; commandId: string; revision: number };
type PresentationPayload = { before: any; after: any; command: Record<string, any>; trace?: any[]; commandId: string; presentationId?: string; revision?: number };

const clone = <T,>(value: T): T => {
  try { return structuredClone(value); }
  catch { return value; }
};
const flipOwner = (value: unknown) => value === 0 ? 1 : value === 1 ? 0 : value;
const orientGame = (game: any, isHost: boolean) => {
  if (!game) return null;
  const oriented = clone(game);
  if (isHost || !Array.isArray(game.players) || game.players.length < 2) return oriented;
  // Presentation always addresses the local player as owner 0. Flip every
  // owner-bearing nested field together so an animation never crosses sides.
  oriented.players = [clone(game.players[1]), clone(game.players[0])];
  oriented.active = flipOwner(game.active);
  oriented.winner = game.winner == null ? null : flipOwner(game.winner);
  if (game.combatAction) oriented.combatAction = { ...clone(game.combatAction), attackerOwner: flipOwner(game.combatAction.attackerOwner) };
  if (game.pendingResponse) oriented.pendingResponse = { ...clone(game.pendingResponse), responder: flipOwner(game.pendingResponse.responder), actor: flipOwner(game.pendingResponse.actor) };
  if (game.pendingAction) oriented.pendingAction = { ...clone(game.pendingAction), owner: flipOwner(game.pendingAction.owner) };
  if (Array.isArray(game.priorityStack)) oriented.priorityStack = game.priorityStack.map((frame: any) => ({
    ...clone(frame),
    actor: flipOwner(frame?.actor),
    command: frame?.command ? { ...clone(frame.command), owner: flipOwner(frame.command.owner) } : frame?.command,
  }));
  if (game.pendingDecision) {
    oriented.pendingDecision = { ...clone(game.pendingDecision), owner: flipOwner(game.pendingDecision.owner) };
    if (oriented.pendingDecision.context && typeof oriented.pendingDecision.context === "object") {
      oriented.pendingDecision.context = {
        ...oriented.pendingDecision.context,
        owner: flipOwner(oriented.pendingDecision.context.owner),
        decisionOwner: flipOwner(oriented.pendingDecision.context.decisionOwner),
      };
    }
    if (oriented.pendingDecision.effect && typeof oriented.pendingDecision.effect.targetOwner === "number") {
      oriented.pendingDecision.effect.targetOwner = flipOwner(oriented.pendingDecision.effect.targetOwner);
    }
  }
  if (game.pendingReposition) oriented.pendingReposition = {
    ...clone(game.pendingReposition),
    owners: (game.pendingReposition.owners || []).map(flipOwner),
    confirmed: (game.pendingReposition.confirmed || []).map(flipOwner),
    activeOwner: flipOwner(game.pendingReposition.activeOwner),
  };
  return oriented;
};

const cardIdentity = (card: any) => String(card?.uid || card?.id || `${card?.page ?? ""}:${card?.name ?? ""}`);
const unitFingerprint = (unit: any) => ({
  id: cardIdentity(unit), slot: unit?.slot, damage: unit?.damage, bonusAtk: unit?.bonusAtk, bonusHp: unit?.bonusHp,
  temporaryAtk: unit?.temporaryAtk, temporaryHp: unit?.temporaryHp, markers: unit?.markers,
  exhausted: unit?.exhausted, summoning: unit?.summoning, frozen: unit?.frozen, stunned: unit?.stunned,
  suffocated: unit?.suffocated, immobilized: unit?.immobilized, tags: unit?.tags, temporaryTags: unit?.temporaryTags,
  modifiers: unit?.modifiers, grantedKeywords: unit?.grantedKeywords,
});
// Interaction metadata is deliberately absent: priority/timer-only revisions
// must not replay a card animation when the material board did not change.
const presentationFingerprint = (game: any) => JSON.stringify({
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
const hasPresentableDelta = (before: any, after: any) => !!before && !!after && presentationFingerprint(before) !== presentationFingerprint(after);
const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
const transitionKey = (detail: PresentationPayload) => {
  const before = presentationFingerprint(detail.before);
  const after = presentationFingerprint(detail.after);
  return `${detail.revision == null ? "local" : `rev:${detail.revision}`}:${hashText(before)}>${hashText(after)}`;
};
const attackFromCombat = (combat: any) => combat?.attackerUid ? {
  type: "attack",
  owner: Number(combat.attackerOwner) === 1 ? 1 : 0,
  attackerId: combat.attackerUid,
  ...(combat.targetHero || !combat.defenderUid ? { targetHero: true } : { defenderId: combat.defenderUid }),
} : null;

const stateFieldCards = (player: any) => [
  ...(player?.board || []),
  ...(player?.support || []),
  ...(player?.terrain ? [player.terrain] : []),
];
const newCardsByIdentity = (beforeCards: any[] = [], afterCards: any[] = []) => {
  const beforeCounts = new Map<string, number>();
  beforeCards.forEach((card) => beforeCounts.set(cardIdentity(card), (beforeCounts.get(cardIdentity(card)) || 0) + 1));
  const used = new Map<string, number>();
  return afterCards.filter((card) => {
    const id = cardIdentity(card);
    const seen = (used.get(id) || 0) + 1;
    used.set(id, seen);
    return seen > (beforeCounts.get(id) || 0);
  });
};
const inferOpponentPlayCommand = (before: any, after: any) => {
  const beforePlayer = before?.players?.[1], afterPlayer = after?.players?.[1];
  if (!beforePlayer || !afterPlayer) return null;
  if ((afterPlayer.hand?.length || 0) >= (beforePlayer.hand?.length || 0)) return null;
  const enteredField = newCardsByIdentity(stateFieldCards(beforePlayer), stateFieldCards(afterPlayer));
  const enteredGrave = newCardsByIdentity(beforePlayer.grave || [], afterPlayer.grave || []);
  const candidate = enteredField[0] || enteredGrave.at(-1);
  if (!candidate) return null;
  return { type: "playCard", owner: 1, cardId: cardIdentity(candidate), presentationCard: clone(candidate) };
};
const immediateDirectAttack = (before: any, after: any, command: Record<string, any>) => {
  if (command?.type !== "declareAttack" || !command?.attackerId) return null;
  const owner = Number(command.owner) === 1 ? 1 : 0;
  const defender = owner === 0 ? 1 : 0;
  const heroWasHit = Number(after?.players?.[defender]?.life) < Number(before?.players?.[defender]?.life);
  if (!heroWasHit) return null;
  return { type: "attack", owner, attackerId: command.attackerId, targetHero: true };
};
const priorityResolutionCommand = (before: any, command: Record<string, any>) => {
  if (command?.type !== "passPriority") return command;
  const combatCheckpoint = before?.pendingAction?.checkpoint === "single-attack-resolution"
    || before?.priorityStack?.[0]?.command?.checkpoint === "single-attack-resolution";
  if (combatCheckpoint) return attackFromCombat(before?.combatAction);
  const stack = Array.isArray(before?.priorityStack) ? before.priorityStack : [];
  const top = stack.length > 1 ? stack.at(-1)?.command : null;
  if (top?.type) return top;
  const pending = before?.pendingAction;
  if (pending?.type && pending.type !== "onlineCheckpoint") return pending;
  return null;
};
const presentedCommand = (before: any, after: any, command: Record<string, any> | undefined) => {
  if (!command?.type || !hasPresentableDelta(before, after)) return null;
  const directAttack = immediateDirectAttack(before, after, command);
  if (directAttack) return directAttack;
  const resolved = priorityResolutionCommand(before, command);
  if (!resolved?.type || EXCLUDED_COMMANDS.has(String(resolved.type))) return null;
  return resolved;
};
const roomRequest = (input: RequestInfo | URL) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  try {
    const url = new URL(raw, location.origin);
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
};
const requestPayload = (init?: RequestInit) => {
  if (typeof init?.body !== "string") return null;
  try { return JSON.parse(init.body); }
  catch { return null; }
};

export default function PresentationEventBridge() {
  useEffect(() => {
    const snapshots = new Map<string, SnapshotEntry>();
    const confirmed = new Map<string, ConfirmedAck>();
    const seenTransitionKeys = new Set<string>();
    const seenOrder: string[] = [];
    let localSequence = 0;

    const rememberTransition = (key: string) => {
      if (seenTransitionKeys.has(key)) return false;
      seenTransitionKeys.add(key);
      seenOrder.push(key);
      while (seenOrder.length > MAX_SEEN_TRANSITIONS) {
        const expired = seenOrder.shift();
        if (expired) seenTransitionKeys.delete(expired);
      }
      return true;
    };

    const emit = (detail: PresentationPayload) => {
      const command = presentedCommand(detail.before, detail.after, detail.command);
      if (!command) return;
      const base = { ...detail, command: clone(command) };
      const presentationId = transitionKey(base);
      if (!rememberTransition(presentationId)) return;
      const next = { ...base, presentationId };
      window.dispatchEvent(new CustomEvent(PRESENTATION_EVENT, { detail: next }));
    };

    const onLocalResolution = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail?.before || !detail?.after || !detail?.command) return;
      localSequence += 1;
      emit({
        before: clone(detail.before),
        after: clone(detail.after),
        command: clone(detail.command),
        trace: clone(detail.trace || []),
        commandId: `local:${localSequence}`,
      });
    };

    const onOnlineSnapshot = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const roomId = String(detail?.session?.id || "");
      const isHost = !!detail?.session?.isHost;
      const room = detail?.room;
      const revision = Number(room?.revision ?? -1);
      const after = orientGame(room?.game, isHost);
      if (!roomId || !after || !Number.isFinite(revision)) return;

      const previous = snapshots.get(roomId);
      snapshots.set(roomId, { revision, game: clone(after), isHost });
      if (!previous || revision <= previous.revision) return;

      const key = `${roomId}:${revision}`;
      const ack = confirmed.get(key);
      if (ack) {
        confirmed.delete(key);
        emit({ before: clone(ack.before), after: clone(after), command: clone(ack.command), commandId: ack.commandId, revision });
        return;
      }

      /* Polling/recovery still represents confirmed server state. Material
         combat resolution is inferred only from the previous authoritative
         combat descriptor; every other revision remains a generic diff. */
      const combatCommand = hasPresentableDelta(previous.game, after) ? attackFromCombat(previous.game?.combatAction) : null;
      const opponentPlayCommand = hasPresentableDelta(previous.game, after) ? inferOpponentPlayCommand(previous.game, after) : null;
      emit({
        before: clone(previous.game),
        after: clone(after),
        command: combatCommand || opponentPlayCommand || { type: "onlineSnapshot", owner: 1 },
        commandId: `online:${roomId}:${revision}`,
        revision,
      });
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const roomId = roomRequest(input);
      const payload = roomId ? requestPayload(init) : null;
      const isCommand = init?.method?.toUpperCase() === "POST" && payload?.action === "command" && payload?.command && payload?.commandId;
      const snapshot = roomId ? snapshots.get(roomId) : undefined;
      const before = isCommand && snapshot ? clone(snapshot.game) : null;
      const command = isCommand ? { ...clone(payload.command), owner: 0 } : null;
      const commandId = isCommand ? String(payload.commandId) : "";

      const response = await originalFetch(input, init);
      if (isCommand && roomId && before && command && commandId) {
        try {
          const data = await response.clone().json();
          const revision = Number(data?.revision ?? -1);
          if (response.ok && data?.game && Number.isFinite(revision)) {
            confirmed.set(`${roomId}:${revision}`, { before, command, commandId, revision });
          }
        } catch {
          // A malformed/non-JSON response simply falls back to snapshot-diff presentation.
        }
      }
      return response;
    };

    window.addEventListener(RULES_RESOLVED_EVENT, onLocalResolution as EventListener);
    window.addEventListener(ONLINE_SNAPSHOT_EVENT, onOnlineSnapshot as EventListener);
    return () => {
      window.fetch = originalFetch;
      window.removeEventListener(RULES_RESOLVED_EVENT, onLocalResolution as EventListener);
      window.removeEventListener(ONLINE_SNAPSHOT_EVENT, onOnlineSnapshot as EventListener);
      snapshots.clear();
      confirmed.clear();
      seenTransitionKeys.clear();
    };
  }, []);

  return null;
}
