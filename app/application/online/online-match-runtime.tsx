"use client";

import { useEffect, useState } from "react";

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
type HudView = {
  session: Session;
  status: string;
  game: OnlineGame | null;
  signature: string;
};

const ONLINE_ROOM_SNAPSHOT_EVENT = "hemsfell:online-room-snapshot";
const ACTION_SURFACE_SELECTORS = [
  ".screen-game .phase-orb",
  ".screen-game .player-hand",
  ".screen-game .player-field",
  ".screen-game .player-terrain",
  ".screen-game .player-hero:not(.enemy)",
  ".screen-game .hero-abilities:not(.enemy)",
  ".screen-game .hero-command-bar:not(.enemy)",
] as const;

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

const flipOwner = (owner: 0 | 1 | null | undefined) => owner == null ? owner : owner === 0 ? 1 : 0;

/** The board already orients the full authoritative game for the guest. The
 * HUD only needs a tiny public subset, so avoid cloning decks/hands/board. */
function orientHudGame(game: OnlineGame, isHost: boolean): OnlineGame {
  if (isHost) return game;
  return {
    active: game.active === 0 ? 1 : 0,
    phase: game.phase,
    round: game.round,
    winner: game.winner == null ? game.winner : game.winner === 0 ? 1 : 0,
    priority: game.priority ? { ...game.priority, owner: flipOwner(game.priority.owner) } : undefined,
    stack: game.stack?.map((frame) => ({ ...frame, controller: flipOwner(frame.controller) })),
    combatAction: game.combatAction ? { ...game.combatAction, attackerOwner: flipOwner(game.combatAction.attackerOwner) as 0 | 1 } : null,
    onlineFinalization: game.onlineFinalization ? { ...game.onlineFinalization, owner: flipOwner(game.onlineFinalization.owner) as 0 | 1 | undefined } : undefined,
  };
}

function hudSignature(status: string, game: OnlineGame | null, isHost: boolean) {
  if (!game) return `${status}|none|${isHost ? 1 : 0}`;
  const priority = game.priority;
  const stack = game.stack || [];
  const combat = game.combatAction;
  return [
    status,
    isHost ? 1 : 0,
    game.active,
    game.phase || "",
    game.round || 0,
    game.winner ?? "",
    priority?.model || "",
    priority?.mode || "",
    priority?.owner ?? "",
    priority?.window || "",
    priority?.interactionState || "",
    (priority?.commandTypes || []).join(","),
    priority?.stackDepth || 0,
    stack.map((frame) => `${frame.id || ""}:${frame.controller ?? ""}:${frame.label || frame.kind || ""}`).join(";"),
    combat ? `${combat.attackerOwner}:${combat.attackerUid || ""}:${combat.defenderUid || ""}:${combat.targetHero ? 1 : 0}:${combat.stage || ""}` : "",
    game.onlineFinalization ? `${game.onlineFinalization.owner ?? ""}:${game.onlineFinalization.stage || ""}` : "",
  ].join("|");
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
  const [view, setView] = useState<HudView | null>(null);
  const game = view?.game ?? null;
  const commandTypesKey = (game?.priority?.commandTypes || []).join(",");

  useEffect(() => {
    const consume = (event: Event) => {
      const detail = (event as CustomEvent<{ session?: Session; room?: RoomSnapshot }>).detail;
      const nextSession = detail?.session;
      const snapshot = detail?.room;
      if (!nextSession || typeof nextSession.id !== "string" || !snapshot || snapshot.id !== nextSession.id || !Number.isFinite(Number(snapshot.revision))) return;
      const signature = hudSignature(snapshot.status, snapshot.game || null, nextSession.isHost);
      setView((current) => {
        if (current?.signature === signature && current.session.id === nextSession.id && current.session.isHost === nextSession.isHost) return current;
        return {
          session: nextSession,
          status: snapshot.status,
          game: snapshot.game ? orientHudGame(snapshot.game, nextSession.isHost) : null,
          signature,
        };
      });
    };
    window.addEventListener(ONLINE_ROOM_SNAPSHOT_EVENT, consume);
    return () => window.removeEventListener(ONLINE_ROOM_SNAPSHOT_EVENT, consume);
  }, []);

  useEffect(() => {
    const started = view?.status === "started" && game?.winner == null;
    const owner = game?.priority?.owner;
    const blocked = !!started && owner !== 0;
    const board = document.querySelector<HTMLElement>(".screen-game .hs-board");
    if (board) {
      board.dataset.onlineActionBlocked = blocked ? "true" : "false";
      board.dataset.onlineInteractionState = game?.priority?.interactionState || "unknown";
      board.dataset.onlineCommandTypes = commandTypesKey;
    }
    for (const selector of ACTION_SURFACE_SELECTORS) {
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (blocked) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
      });
    }
    return () => {
      for (const selector of ACTION_SURFACE_SELECTORS) document.querySelectorAll<HTMLElement>(selector).forEach((element) => element.removeAttribute("inert"));
      board?.removeAttribute("data-online-action-blocked");
      board?.removeAttribute("data-online-interaction-state");
      board?.removeAttribute("data-online-command-types");
    };
  }, [view?.status, game?.winner, game?.priority?.owner, game?.priority?.interactionState, commandTypesKey]);

  if (!view || !game || view.status !== "started" || game.winner != null) return null;
  return <OnlinePriorityHud game={game} />;
}
