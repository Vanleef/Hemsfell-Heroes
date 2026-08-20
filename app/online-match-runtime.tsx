"use client";

import { useEffect, useRef, useState } from "react";
import { orientOnlineGameForRole } from "./online-state-orientation.mjs";
import { shouldAutoPass } from "./rules-engine/priority.mjs";

type Session = { id: string; token: string; isHost: boolean };
type ResponseControl = "assisted" | "full-control";
type PriorityView = {
  model?: string;
  mode?: string;
  owner?: 0 | 1 | null;
  window?: string | null;
  interactionState?: string;
  commandTypes?: string[];
  consecutivePasses?: number;
  stackDepth?: number;
};
type PendingResponse = {
  responder: 0 | 1;
  actor: 0 | 1;
  action?: string;
  passes?: number;
  deadline?: number;
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
  players?: unknown[];
  pendingResponse?: PendingResponse | null;
  pendingAction?: Record<string, unknown>;
  priorityStack?: unknown[];
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
/* Priority is a short-lived interaction. Poll it faster than ordinary lobby
   discovery so Assisted mode feels like a continuous turn instead of a modal
   round-trip. The server remains authoritative for every pass. */
const POLL_MS = 320;
const DISCOVERY_MS = 3_500;
const ASSISTED_PASS_DELAY_MS = 45;
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
const INTERACTION_NAMES: Record<string, string> = {
  "maintenance-decision": "Escolha de Manutenção",
  "action-priority": "Sua ação",
  "response-priority": "Janela de resposta",
  "combat-idle": "Escolha um ataque ou encerre o combate",
  "awaiting-blocker": "Escolha de bloqueio",
  "resolving-attack": "Resolvendo combate",
  "finalization-effects": "Resolvendo fim de turno",
  "finalization-response": "Resposta de fim de turno",
  decision: "Escolha obrigatória",
  reposition: "Reposicionamento obrigatório",
  resolving: "Resolvendo",
};

function onlineRuntimeIsRelevant() {
  const preferred = new URLSearchParams(window.location.search).get("room");
  if (preferred) return true;
  return !!document.querySelector(".match-clock");
}

function readResponseControl(): ResponseControl {
  const toggle = document.querySelector<HTMLElement>(".screen-game .priority-control-toggle");
  return /full\s*control/i.test(toggle?.textContent || "") ? "full-control" : "assisted";
}

function readSessions(): Session[] {
  const result: Session[] = [];
  if (!onlineRuntimeIsRelevant()) return result;
  const preferred = new URLSearchParams(window.location.search).get("room");
  const keys: string[] = [];
  if (preferred) keys.push(`${SESSION_PREFIX}${preferred}`);
  if (!preferred) {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(SESSION_PREFIX) && !keys.includes(key)) keys.push(key);
    }
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
  if (response.status === 404) {
    localStorage.removeItem(`${SESSION_PREFIX}${session.id}`);
    return null;
  }
  if (!response.ok) return null;
  const room = await response.json() as RoomSnapshot;
  return room.game ? room : null;
}

async function discoverSession(): Promise<{ session: Session; room: RoomSnapshot } | null> {
  if (!onlineRuntimeIsRelevant()) return null;
  const preferred = new URLSearchParams(window.location.search).get("room");
  const sessions = readSessions();
  if (!sessions.length) return null;
  const candidates = await Promise.all(sessions.map(async (session) => ({ session, room: await fetchRoom(session) })));
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
  const onlineModel = /^online-v\d+$/.test(String(priority?.model || ""));
  if (!onlineModel && !stack.length && !combat && !game.onlineFinalization) return null;
  const owner = priority?.owner;
  const ownerLabel = owner === 0 ? "Sua prioridade" : owner === 1 ? "Prioridade do oponente" : priority?.mode === "resolving" ? "Resolvendo" : "Sem prioridade pendente";
  const stateLabel = priority?.interactionState ? INTERACTION_NAMES[priority.interactionState] || priority.interactionState : null;
  const windowLabel = combat || (priority?.window ? WINDOW_NAMES[priority.window] || priority.window : stateLabel || "Ação livre");
  return <aside className="online-priority-hud" data-priority-owner={owner ?? "none"} data-interaction-state={priority?.interactionState || "unknown"} aria-live="polite">
    <div className="online-priority-heading"><span>ONLINE · PRIORIDADE</span><b>{ownerLabel}</b><small>{windowLabel}</small></div>
    <div className="online-priority-stack"><span>PILHA · {Math.max(Number(priority?.stackDepth || 0), stack.length)}</span>{stack.length ? <ol>{stack.slice().reverse().map((frame, index) => <li key={frame.id || `${frame.label}-${index}`}><i>{frame.controller === 0 ? "VOCÊ" : frame.controller === 1 ? "RIVAL" : "SISTEMA"}</i><b>{frame.label || frame.kind || "Ação"}</b></li>)}</ol> : <small>Nenhum efeito aguardando resolução.</small>}</div>
  </aside>;
}

export default function OnlineMatchRuntime() {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [responseControl, setResponseControl] = useState<ResponseControl>("assisted");
  const roomRef = useRef<RoomSnapshot | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const assistedPassKeyRef = useRef("");
  const assistedPassInFlightRef = useRef(false);

  const applySnapshot = (currentSession: Session, snapshot: RoomSnapshot) => {
    sessionRef.current = currentSession;
    roomRef.current = snapshot;
    setRoom(snapshot);
    setGame(snapshot.game ? orientOnlineGameForRole(snapshot.game, currentSession.isHost ? "host" : "guest") as OnlineGame : null);
  };

  /* `priorityControl` lives in the main match screen. Observe its rendered
     toggle so this independent authoritative runtime honors Full Control too. */
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setResponseControl(readResponseControl()));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const reconcile = async () => {
      if (!onlineRuntimeIsRelevant()) {
        if (sessionRef.current) {
          sessionRef.current = null;
          roomRef.current = null;
          setSession(null);
          setRoom(null);
          setGame(null);
        }
        timer = window.setTimeout(reconcile, DISCOVERY_MS);
        return;
      }
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
      if (!onlineRuntimeIsRelevant()) {
        sessionRef.current = null;
        roomRef.current = null;
        setSession(null);
        setRoom(null);
        setGame(null);
        return;
      }
      const snapshot = await fetchRoom(session).catch(() => null);
      if (cancelled) return;
      if (snapshot) applySnapshot(session, snapshot);
      timer = window.setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [session?.id, session?.token, session?.isHost]);

  /* Assisted mode acts on the authoritative pendingResponse immediately. It
     must not wait for the presentation layer's delayed response modal: when the
     responder has no legal/payable action, the server receives Pass Priority
     almost immediately and both clients advance to the same next snapshot. */
  useEffect(() => {
    if (!session || !room || !game || room.status !== "started" || game.winner != null || responseControl !== "assisted") {
      assistedPassKeyRef.current = "";
      return;
    }
    const pending = game.pendingResponse;
    if (!pending || pending.responder !== 0 || !shouldAutoPass(game as any, 0, "assisted")) {
      if (!pending || pending.responder !== 0) assistedPassKeyRef.current = "";
      return;
    }
    const key = `${room.id}:${room.revision}:${pending.actor}:${pending.responder}:${pending.passes ?? 0}:${pending.action || ""}`;
    if (assistedPassKeyRef.current === key || assistedPassInFlightRef.current) return;
    assistedPassKeyRef.current = key;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (assistedPassInFlightRef.current) return;
      assistedPassInFlightRef.current = true;
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(session.id)}`, {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "command",
            token: session.token,
            baseRevision: room.revision,
            commandId: `assisted-pass:${crypto.randomUUID()}`,
            command: { type: "passPriority", auto: true },
          }),
        });
        const snapshot = await response.json().catch(() => null) as RoomSnapshot | null;
        if (!cancelled && snapshot?.game && Number.isFinite(Number(snapshot.revision))) applySnapshot(session, snapshot);
      } catch {
        /* Polling reconciles transient network failures; never manufacture a
           local pass or mutate the authoritative snapshot optimistically. */
      } finally {
        assistedPassInFlightRef.current = false;
      }
    }, ASSISTED_PASS_DELAY_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [session?.id, session?.token, room?.id, room?.revision, room?.status, game, responseControl]);

  /* Local player is always oriented as owner 0.  The canonical input owner
     therefore gates the entire normal action surface during opponent priority,
     blocker selection, server resolution and mandatory decisions. */
  useEffect(() => {
    const started = room?.status === "started" && game?.winner == null;
    const owner = game?.priority?.owner;
    const blocked = !!started && owner !== 0;
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
      if (board) {
        board.dataset.onlineActionBlocked = blocked ? "true" : "false";
        board.dataset.onlineInteractionState = game?.priority?.interactionState || "unknown";
        board.dataset.onlineCommandTypes = (game?.priority?.commandTypes || []).join(",");
      }
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
      const board = document.querySelector<HTMLElement>(".screen-game .hs-board");
      board?.removeAttribute("data-online-action-blocked");
      board?.removeAttribute("data-online-interaction-state");
      board?.removeAttribute("data-online-command-types");
    };
  }, [room?.status, room?.revision, game?.winner, game?.priority?.owner, game?.priority?.interactionState, game?.priority?.commandTypes?.join(",")]);

  if (!session || !room || !game || room.status !== "started" || game.winner != null) return null;
  return <OnlinePriorityHud game={game} />;
}
