"use client";

import { useEffect, useState } from "react";
import { orientOnlineGameForRole } from "./application/session/online-state-orientation.mjs";

type Session = { id: string; isHost: boolean };
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

const ONLINE_ROOM_SNAPSHOT_EVENT = "hemsfell:online-room-snapshot";
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
  const commandTypesKey = (game?.priority?.commandTypes || []).join(",");

  /* The match screen owns the only HTTP poll. The HUD consumes those canonical
     snapshots through a same-document event so it cannot double the request
     rate, race the board snapshot, or send a second Assisted auto-pass. */
  useEffect(() => {
    const consume = (event: Event) => {
      const detail = (event as CustomEvent<{ session?: Session; room?: RoomSnapshot }>).detail;
      const nextSession = detail?.session;
      const snapshot = detail?.room;
      if (!nextSession || typeof nextSession.id !== "string" || !snapshot || snapshot.id !== nextSession.id || !Number.isFinite(Number(snapshot.revision))) return;
      setSession(nextSession);
      setRoom(snapshot);
      setGame(snapshot.game ? orientOnlineGameForRole(snapshot.game, nextSession.isHost ? "host" : "guest") as OnlineGame : null);
    };
    window.addEventListener(ONLINE_ROOM_SNAPSHOT_EVENT, consume);
    return () => window.removeEventListener(ONLINE_ROOM_SNAPSHOT_EVENT, consume);
  }, []);

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
        board.dataset.onlineCommandTypes = commandTypesKey;
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
  }, [room?.status, room?.revision, game?.winner, game?.priority?.owner, game?.priority?.interactionState, commandTypesKey]);

  if (!session || !room || !game || room.status !== "started" || game.winner != null) return null;
  return <OnlinePriorityHud game={game} />;
}
