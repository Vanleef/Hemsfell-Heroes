"use client";

import { useEffect } from "react";

const RULES_RESOLVED_EVENT = "hemsfell:rules-command-resolved";
const PRESENTATION_EVENT = "hemsfell:presentation-action";
const ONLINE_SNAPSHOT_EVENT = "hemsfell:online-room-snapshot";
const NON_CINEMATIC_COMMANDS = new Set(["passPriority", "declareAttack", "selectDefender", "attack", "reposition", "confirmReposition", "surrender"]);

type SnapshotEntry = { revision: number; game: any; isHost: boolean };
type ConfirmedAck = { before: any; command: Record<string, any>; commandId: string; revision: number };

const clone = <T,>(value: T): T => {
  try { return structuredClone(value); }
  catch { return value; }
};
const orientGame = (game: any, isHost: boolean) => {
  if (!game) return null;
  const oriented = clone(game);
  if (isHost || !Array.isArray(game.players) || game.players.length < 2) return oriented;
  oriented.players = [clone(game.players[1]), clone(game.players[0])];
  if (game.active === 0 || game.active === 1) oriented.active = game.active === 0 ? 1 : 0;
  if (game.winner === 0 || game.winner === 1) oriented.winner = game.winner === 0 ? 1 : 0;
  return oriented;
};
const shouldPresent = (command: Record<string, any> | undefined) => !!command?.type && !NON_CINEMATIC_COMMANDS.has(String(command.type));
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
    let localSequence = 0;

    const emit = (detail: { before: any; after: any; command: Record<string, any>; trace?: any[]; commandId: string; revision?: number }) => {
      if (!detail.before || !detail.after || !shouldPresent(detail.command)) return;
      window.dispatchEvent(new CustomEvent(PRESENTATION_EVENT, { detail }));
    };

    const onLocalResolution = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail?.before || !detail?.after || !shouldPresent(detail.command)) return;
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

      /* Polling/recovery still represents confirmed server state. With no local
         ACK metadata we present the physical delta generically rather than
         guessing an unconfirmed command. Combat remains owned by CombatAnimation. */
      const combatTransition = !!previous.game?.combatAction || !!after?.combatAction;
      if (!combatTransition) emit({
        before: clone(previous.game),
        after: clone(after),
        command: { type: "onlineSnapshot", owner: 1 },
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

      try {
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
      } catch (error) {
        throw error;
      }
    };

    window.addEventListener(RULES_RESOLVED_EVENT, onLocalResolution as EventListener);
    window.addEventListener(ONLINE_SNAPSHOT_EVENT, onOnlineSnapshot as EventListener);
    return () => {
      window.fetch = originalFetch;
      window.removeEventListener(RULES_RESOLVED_EVENT, onLocalResolution as EventListener);
      window.removeEventListener(ONLINE_SNAPSHOT_EVENT, onOnlineSnapshot as EventListener);
      snapshots.clear();
      confirmed.clear();
    };
  }, []);

  return null;
}
