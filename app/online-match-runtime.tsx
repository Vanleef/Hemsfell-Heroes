"use client";

import { useEffect, useRef, useState } from "react";
import { orientOnlineGameForRole } from "./online-state-orientation.mjs";

type Session = { id: string; token: string; isHost: boolean };
type PriorityView = {
  model?: string;
  mode?: string;
  owner?: 0 | 1 | null;
  window?: string | null;
  consecutivePasses?: number;
  stackDepth?: number;
};
type StackFrame = { id?: string; kind?: string; controller?: 0 | 1 | null; label?: string };
type CombatAction = {
  attackerOwner: 0 | 1;
  attackerUid?: string;
  attackerCard?: { name?: string };
  defenderUid?: string;
  defenderCard?: { name?: string };
  targetHero?: boolean;
  stage?: "declared" | "priority" | "choosing" | "charging" | "impact" | "resolved" | string;
};
type OnlineGame = {
  active: 0 | 1;
  phase?: string;
  round?: number;
  winner?: number | null;
  priority?: PriorityView;
  stack?: StackFrame[];
  combatAction?: CombatAction | null;
  onlineFinalization?: { owner?: 0 | 1; stage?: string };
};
type RoomSnapshot = {
  id: string;
  status: string;
  revision: number;
  createdAt?: number;
  game?: OnlineGame | null;
};

const SESSION_PREFIX = "hemsfell-room-";
const POLL_MS = 760;
const DISCOVERY_MS = 3_500;
const WINDOW_NAMES: Record<string, string> = {
  "maintenance-triggers": "Manutenção",
  "main-action-response": "Ação da Principal",
  "main-end": "Fim da Principal",
  "combat-start": "Início do Combate",
  "after-attackers": "Após declaração de ataque",
  "after-blockers": "Após escolha de bloqueio",
  "combat-trigger": "Gatilho de Combate",
  "combat-end": "Fim do Combate",
  finalization: "Finalização",
  "activated-ability-response": "Habilidade ativada",
};

function readSessions(): Session[] {
  const result: Session[] = [];
  const preferred = new URLSearchParams(window.location.search).get("room");
  const keys: string[] = [];
  if (preferred) keys.push(`${SESSION_PREFIX}${preferred}`);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(SESSION_PREFIX) && !keys.includes(key)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "null") as { token?: unknown; isHost?: unknown } | null;
      if (!stored || typeof stored.token !== "string" || !stored.token) continue;
      result.push({ id: key.slice(SESSION_PREFIX.length), token: stored.token, isHost: stored.isHost === true });
    } catch { /* Ignore obsolete local sessions. */ }
  }
  return result;
}

async function fetchRoom(session: Session): Promise<RoomSnapshot | null> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(session.id)}?token=${encodeURIComponent(session.token)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const room = await response.json() as RoomSnapshot;
  return room.game ? room : null;
}

async function discoverSession(): Promise<{ session: Session; room: RoomSnapshot } | null> {
  const preferred = new URLSearchParams(window.location.search).get("room");
  const candidates = await Promise.all(readSessions().map(async (session) => ({ session, room: await fetchRoom(session) })));
  const statusRank: Record<string, number> = { started: 3, mulligan: 2, finished: 1 };
  return candidates
    .filter((entry): entry is { session: Session; room: RoomSnapshot } => !!entry.room && ["mulligan", "started", "finished"].includes(entry.room.status))
    .sort((a, b) => Number(b.session.id === preferred) - Number(a.session.id === preferred) || (statusRank[b.room.status] || 0) - (statusRank[a.room.status] || 0) || Number(b.room.createdAt || 0) - Number(a.room.createdAt || 0) || Number(b.room.revision || 0) - Number(a.room.revision || 0))[0] || null;
}

function combatStatus(game: OnlineGame) {
  const combat = game.combatAction;
  if (!combat) return null;
  const attacker = combat.attackerCard?.name || "A criatura";
  if (combat.stage === "priority") return `${attacker} declarou ataque · janela de resposta`;
  if (combat.stage === "choosing") return combat.attackerOwner === 1
    ? `Defenda-se de ${attacker}: escolha um bloqueador ou Não bloquear`
    : `Aguardando o oponente escolher o bloqueio de ${attacker}`;
  if (combat.stage === "charging" || combat.stage === "impact") return `${attacker} está resolvendo seu ataque`;
  return `${attacker} está em combate`;
}

function OnlinePriorityHud({ game }: { game: OnlineGame }) {
  const priority = game.priority;
  const stack = game.stack || [];
  const combat = combatStatus(game);
  if (priority?.model !== "online-v2" && !stack.length && !combat && !game.onlineFinalization) return null;
  const owner = priority?.owner;
  const ownerLabel = owner === 0 ? "Sua prioridade" : owner === 1 ? "Prioridade do oponente" : priority?.mode === "resolving" ? "Resolvendo" : "Sem prioridade pendente";
  const windowLabel = combat || (priority?.window ? WINDOW_NAMES[priority.window] || priority.window : game.phase === "combate" && game.active === 0 ? "Escolha uma criatura para atacar ou encerre o combate" : "Ação livre");
  return <aside className="online-priority-hud" data-priority-owner={owner ?? "none"} aria-live="polite">
    <div className="online-priority-heading"><span>ONLINE · PRIORIDADE</span><b>{ownerLabel}</b><small>{windowLabel}</small></div>
    <div className="online-priority-stack"><span>PILHA · {Math.max(Number(priority?.stackDepth || 0), stack.length)}</span>{stack.length ? <ol>{stack.slice().reverse().map((frame, index) => <li key={frame.id || `${frame.label}-${index}`}><i>{frame.controller === 0 ? "VOCÊ" : frame.controller === 1 ? "RIVAL" : "SISTEMA"}</i><b>{frame.label || frame.kind || "Ação"}</b></li>)}</ol> : <small>Nenhum efeito aguardando resolução.</small>}</div>
  </aside>;
}

export default function OnlineMatchRuntime() {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const applySnapshot = (currentSession: Session, snapshot: RoomSnapshot) => {
    sessionRef.current = currentSession;
    roomRef.current = snapshot;
    setRoom(snapshot);
    setGame(snapshot.game ? orientOnlineGameForRole(snapshot.game, currentSession.isHost ? "host" : "guest") as OnlineGame : null);
  };

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const reconcile = async () => {
      const found = await discoverSession().catch(() => null);
      if (cancelled) return;
      if (found) {
        const currentSession = sessionRef.current;
        const currentRoom = roomRef.current;
        const preferred = new URLSearchParams(window.location.search).get("room");
        const shouldSwitch = !currentSession || currentSession.id !== found.session.id && (found.session.id === preferred || currentRoom?.status === "finished" || Number(found.room.createdAt || 0) > Number(currentRoom?.createdAt || 0));
        if (shouldSwitch || currentSession?.id === found.session.id) {
          if (shouldSwitch) setSession(found.session);
          applySnapshot(found.session, found.room);
        }
      }
      timer = window.setTimeout(reconcile, DISCOVERY_MS);
    };
    void reconcile();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!session) return;
    sessionRef.current = session;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      const snapshot = await fetchRoom(session).catch(() => null);
      if (cancelled) return;
      if (snapshot) applySnapshot(session, snapshot);
      timer = window.setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [session?.id, session?.token, session?.isHost]);

  /* The authoritative priority owner also gates the visible local controls.
     This matters when Café do Tempo asks its controller to place a Cat during
     the opponent's turn: the active opponent must wait instead of racing a
     phase, attack or play-card click before the slot choice is persisted. */
  useEffect(() => {
    const blocked = room?.status === "started" && game?.winner == null && game?.active === 0 && game?.priority?.owner === 1;
    const selectors = [
      ".screen-game .phase-orb",
      ".screen-game .player-hand",
      ".screen-game .player-field",
      ".screen-game .player-terrain",
      ".screen-game .player-hero:not(.enemy)",
      ".screen-game .hero-abilities:not(.enemy)",
      ".screen-game .hero-command-bar:not(.enemy)",
    ];
    const apply = () => {
      const board = document.querySelector<HTMLElement>(".screen-game .hs-board");
      if (board) board.dataset.onlineActionBlocked = blocked ? "true" : "false";
      for (const selector of selectors) {
        document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
          if (blocked) element.setAttribute("inert", "");
          else element.removeAttribute("inert");
        });
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const selector of selectors) document.querySelectorAll<HTMLElement>(selector).forEach((element) => element.removeAttribute("inert"));
      document.querySelector<HTMLElement>(".screen-game .hs-board")?.removeAttribute("data-online-action-blocked");
    };
  }, [room?.status, room?.revision, game?.active, game?.winner, game?.priority?.owner]);

  if (!session || !room || !game || room.status !== "started" || game.winner != null) return null;
  return <OnlinePriorityHud game={game} />;
}
