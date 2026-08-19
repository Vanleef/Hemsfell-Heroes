"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { orientOnlineGameForRole } from "./online-state-orientation.mjs";
import { RemoteCardArt } from "./remote-card-art";

type Session = { id: string; token: string; isHost: boolean };
type Unit = {
  uid?: string;
  id?: string;
  name?: string;
  page?: number;
  slot?: number;
  atk?: number;
  hp?: number;
  text?: string;
  tags?: string[];
  temporaryTags?: string[];
  grantedKeywords?: string[];
  combatRestrictions?: Array<{ cannotCombatSubtype?: string }>;
  subtypes?: string[];
  attackLimit?: number;
  attacksThisTurn?: number;
  attackedThisTurn?: boolean;
  defenseUses?: number;
  cannotAttack?: boolean;
  cannotDefend?: boolean;
  exhausted?: boolean;
  summoning?: boolean;
  stunned?: boolean;
  immobilized?: boolean;
  suffocated?: boolean;
};
type Player = { heroId?: string; board?: Unit[] };
type AttackInstance = { attackId: string; attackerId: string; declaredSlot: number; occurrence?: number };
type OnlineCombatInteraction = {
  stage?: string;
  owner?: 0 | 1 | null;
  attackerOptions?: Array<{ attackerId: string; slot: number; maxUses: number; mandatoryUses: number }>;
  blockerOptions?: Array<{ attackId: string; defenderIds: string[] }>;
  defenderCapacities?: Record<string, number>;
};
type OnlineCombat = {
  stage: string;
  attackerOwner: 0 | 1;
  attackers: AttackInstance[];
  blocks?: Array<{ attackId: string; defenderId: string | null }>;
  resolutionIndex?: number;
  deadline?: number;
  interaction?: OnlineCombatInteraction | null;
};
type PriorityView = {
  model?: string;
  mode?: string;
  owner?: 0 | 1 | null;
  window?: string | null;
  consecutivePasses?: number;
  stackDepth?: number;
};
type StackFrame = { id?: string; kind?: string; controller?: 0 | 1 | null; label?: string };
type OnlineGame = {
  active: 0 | 1;
  phase?: string;
  round?: number;
  winner?: number | null;
  players: [Player, Player];
  priority?: PriorityView;
  stack?: StackFrame[];
  onlineCombat?: OnlineCombat;
  onlineFinalization?: { owner?: 0 | 1; stage?: string };
};
type RoomSnapshot = {
  id: string;
  status: string;
  revision: number;
  createdAt?: number;
  settings?: { responseSeconds?: number; turnSeconds?: number };
  game?: OnlineGame | null;
};
type CommandResult = RoomSnapshot & { error?: string };

const SESSION_PREFIX = "hemsfell-room-";
const POLL_MS = 760;
const DISCOVERY_MS = 3_500;
const fold = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const unitId = (unit: Unit) => String(unit.uid || unit.id || "");
const keywords = (unit: Unit) => unit.suffocated ? [] : [...(unit.tags || []), ...(unit.temporaryTags || []), ...(unit.grantedKeywords || [])];
const hasKeyword = (unit: Unit, pattern: RegExp) => keywords(unit).some((value) => pattern.test(String(value))) || (!unit.suffocated && pattern.test(String(unit.text || "")));
const hasSubtype = (unit: Unit, subtype: string) => [...(unit.subtypes || []), ...(unit.tags || [])].some((value) => fold(value) === fold(subtype));
const attackUses = (unit: Unit) => Number(unit.attacksThisTurn ?? (unit.attackedThisTurn ? 1 : 0));
const remainingAttackUses = (unit: Unit) => Math.max(0, Number(unit.attackLimit || 1) - attackUses(unit));
const defenderCapacity = (unit: Unit) => {
  if (unit.suffocated) return 1;
  const text = [...keywords(unit), unit.text || ""].join(" ");
  return Math.max(1, Number(text.match(/defensor\s*(\d+)/i)?.[1] || 1));
};
const formatSeconds = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const WINDOW_NAMES: Record<string, string> = {
  "maintenance-triggers": "Manutenção",
  "main-action-response": "Ação da Principal",
  "main-end": "Fim da Principal",
  "combat-start": "Início do Combate",
  "after-attackers": "Após os atacantes",
  "after-blockers": "Após os bloqueadores",
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

function obviousAttackReady(player: Player, unit: Unit) {
  if (!unitId(unit) || unit.cannotAttack || unit.exhausted || unit.summoning || unit.stunned || unit.immobilized || remainingAttackUses(unit) <= 0) return false;
  if (player.heroId === "tessalia" && Number(unit.slot) !== 2) {
    const commander = (player.board || []).some((candidate) => Number(candidate.slot) === 2 && !candidate.suffocated);
    if (!commander) return false;
  }
  return true;
}

function obviousBlockLegal(attacker: Unit, defender: Unit) {
  if (!unitId(defender) || defender.exhausted || defender.stunned || defender.cannotDefend) return false;
  if (hasKeyword(attacker, /furtivo/i)) return false;
  if (hasKeyword(attacker, /voar/i) && !hasKeyword(defender, /voar/i)) return false;
  if ((attacker.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(defender, rule.cannotCombatSubtype))) return false;
  if ((defender.combatRestrictions || []).some((rule) => rule.cannotCombatSubtype && hasSubtype(attacker, rule.cannotCombatSubtype))) return false;
  return true;
}

function OnlinePriorityHud({ game }: { game: OnlineGame }) {
  const priority = game.priority;
  const stack = game.stack || [];
  if (priority?.model !== "online-v2" && !stack.length && !game.onlineCombat && !game.onlineFinalization) return null;
  const owner = priority?.owner;
  const ownerLabel = owner === 0 ? "Sua prioridade" : owner === 1 ? "Prioridade do oponente" : priority?.mode === "resolving" ? "Resolvendo" : "Sem prioridade pendente";
  const windowLabel = priority?.window ? WINDOW_NAMES[priority.window] || priority.window : game.onlineCombat?.stage === "declare-attackers" ? "Declaração de atacantes" : game.onlineCombat?.stage === "declare-blockers" ? "Declaração de bloqueadores" : "Ação livre";
  return <aside className="online-priority-hud" data-priority-owner={owner ?? "none"} aria-live="polite">
    <div className="online-priority-heading"><span>ONLINE · PRIORIDADE</span><b>{ownerLabel}</b><small>{windowLabel}</small></div>
    <div className="online-priority-stack"><span>PILHA · {Math.max(Number(priority?.stackDepth || 0), stack.length)}</span>{stack.length ? <ol>{stack.slice().reverse().map((frame, index) => <li key={frame.id || `${frame.label}-${index}`}><i>{frame.controller === 0 ? "VOCÊ" : frame.controller === 1 ? "RIVAL" : "SISTEMA"}</i><b>{frame.label || frame.kind || "Ação"}</b></li>)}</ol> : <small>Nenhum efeito aguardando resolução.</small>}</div>
  </aside>;
}

function AttackerDeclaration({ game, counts, setCounts, busy, error, onConfirm }: {
  game: OnlineGame;
  counts: Record<string, number>;
  setCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  busy: boolean;
  error: string;
  onConfirm: () => void;
}) {
  const combat = game.onlineCombat!;
  const localAttacker = combat.attackerOwner === 0;
  const player = game.players[0];
  const units = [...(player.board || [])].sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0));
  const authoritativeOptions = combat.interaction?.attackerOptions;
  const optionById = authoritativeOptions ? new Map(authoritativeOptions.map((option) => [option.attackerId, option])) : null;
  if (!localAttacker) return <div className="online-combat-blocker online-combat-wait"><div className="online-combat-wait-card"><i>⚔</i><span>COMBATE ONLINE</span><h2>O oponente está declarando os atacantes</h2><p>As escolhas serão confirmadas em grupo antes da janela de resposta.</p></div></div>;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return <div className="online-combat-blocker"><section className="online-group-combat-dialog attacker-dialog" role="dialog" aria-modal="true" aria-labelledby="online-attack-title">
    <header><div><span>COMBATE · DECLARAÇÃO EM GRUPO</span><h2 id="online-attack-title">Escolha todos os atacantes</h2></div><strong>{total} ataque(s)</strong></header>
    <p>Selecione quantas vezes cada criatura apta atacará. A ordem de resolução segue os espaços da esquerda para a direita.</p>
    <div className="online-combat-card-grid">{units.map((unit) => {
      const id = unitId(unit), authoritative = optionById?.get(id), ready = optionById ? !!authoritative : obviousAttackReady(player, unit), remaining = authoritative?.maxUses ?? remainingAttackUses(unit), mandatoryUses = authoritative?.mandatoryUses ?? (ready && hasKeyword(unit, /indom[aá]vel/i) ? remaining : 0), selected = counts[id] || 0, mandatory = mandatoryUses > 0;
      return <article className={`${selected ? "selected" : ""} ${!ready ? "disabled" : ""}`} key={id || unit.name}>
        <div className="online-combat-card-art">{unit.page && unit.name ? <RemoteCardArt page={unit.page} name={unit.name} priority /> : <span>⚔</span>}</div>
        <div className="online-combat-card-copy"><b>{unit.name || "Criatura"}</b><small>Espaço {Number(unit.slot || 0) + 1} · {remaining} ataque(s) disponível(is)</small>{mandatory && <em>INDOMÁVEL · obrigatório</em>}</div>
        <div className="online-count-stepper"><button disabled={!ready || selected <= mandatoryUses} onClick={() => setCounts((current) => ({ ...current, [id]: Math.max(mandatoryUses, (current[id] || 0) - 1) }))}>−</button><strong>{selected}</strong><button disabled={!ready || selected >= remaining} onClick={() => setCounts((current) => ({ ...current, [id]: Math.min(remaining, (current[id] || 0) + 1) }))}>+</button></div>
      </article>;
    })}</div>
    {error && <div className="online-combat-error">{error}</div>}
    <footer><span>As opções válidas vêm do mesmo preflight autoritativo do servidor. Depois da confirmação, o defensor recebe prioridade antes de escolher bloqueadores.</span><button className="online-combat-confirm" disabled={busy} onClick={onConfirm}>{busy ? "Confirmando…" : total ? `DECLARAR ${total} ATAQUE(S)` : "NÃO DECLARAR ATAQUES"}</button></footer>
  </section></div>;
}

function BlockerDeclaration({ game, assignments, setAssignments, busy, error, now, onConfirm }: {
  game: OnlineGame;
  assignments: Record<string, string | null>;
  setAssignments: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  busy: boolean;
  error: string;
  now: number;
  onConfirm: () => void;
}) {
  const combat = game.onlineCombat!;
  const localDefender = combat.attackerOwner === 1;
  const attackerPlayer = game.players[combat.attackerOwner];
  const defenderPlayer = game.players[1 - combat.attackerOwner];
  const attacks = [...(combat.attackers || [])].sort((a, b) => a.declaredSlot - b.declaredSlot || a.attackId.localeCompare(b.attackId));
  const deadline = Number(combat.deadline || 0);
  const time = deadline ? formatSeconds(deadline - now) : "--:--";
  const blockerOptions = combat.interaction?.blockerOptions;
  const blockerIdsByAttack = blockerOptions ? new Map(blockerOptions.map((option) => [option.attackId, new Set(option.defenderIds)])) : null;
  const authoritativeCapacities = combat.interaction?.defenderCapacities;
  if (!localDefender) return <div className="online-combat-blocker online-combat-wait"><div className="online-combat-wait-card"><i>🛡</i><span>DEFESA ADVERSÁRIA</span><h2>O oponente está declarando os bloqueadores</h2><p>Seu relógio de ação permanece pausado enquanto o defensor decide.</p><strong>⏱ {time}</strong></div></div>;

  const selectedUsage = (defenderId: string, exceptAttackId?: string) => Object.entries(assignments).filter(([attackId, chosen]) => attackId !== exceptAttackId && chosen === defenderId).length;
  return <div className="online-combat-blocker"><section className="online-group-combat-dialog blocker-dialog" role="dialog" aria-modal="true" aria-labelledby="online-block-title">
    <header><div><span>COMBATE · BLOQUEIOS EM GRUPO</span><h2 id="online-block-title">Escolha todos os bloqueadores</h2></div><strong className={deadline && deadline - now <= 5_000 ? "urgent" : ""}>⏱ {time}</strong></header>
    <p>Cada ataque pode receber um bloqueador ou seguir direto ao herói. As opções vêm da validação autoritativa e Defensor X pode ser usado até a capacidade restante.</p>
    <div className="online-block-lanes">{attacks.map((instance, laneIndex) => {
      const attacker = (attackerPlayer.board || []).find((unit) => unitId(unit) === instance.attackerId);
      if (!attacker) return null;
      const current = assignments[instance.attackId] || "";
      const authoritativeIds = blockerIdsByAttack?.get(instance.attackId);
      const options = (defenderPlayer.board || []).filter((defender) => {
        const id = unitId(defender);
        const legalPair = blockerIdsByAttack ? !!authoritativeIds?.has(id) : obviousBlockLegal(attacker, defender);
        if (!legalPair) return false;
        const remainingCapacity = authoritativeCapacities?.[id] ?? Math.max(0, defenderCapacity(defender) - Number(defender.defenseUses || 0));
        return selectedUsage(id, instance.attackId) < remainingCapacity || current === id;
      });
      return <article key={instance.attackId} className={current ? "blocked" : "direct"}>
        <div className="online-lane-number">{laneIndex + 1}</div>
        <div className="online-lane-attacker"><div>{attacker.page && attacker.name ? <RemoteCardArt page={attacker.page} name={attacker.name} priority /> : <span>⚔</span>}</div><span><b>{attacker.name || "Atacante"}</b><small>Espaço {instance.declaredSlot + 1}{hasKeyword(attacker, /furtivo/i) ? " · Furtivo" : hasKeyword(attacker, /voar/i) ? " · Voar" : ""}</small></span></div>
        <label><span>BLOQUEADOR</span><select value={current} onChange={(event) => setAssignments((value) => ({ ...value, [instance.attackId]: event.target.value || null }))}><option value="">Não bloquear · dano ao herói</option>{options.map((defender) => { const id = unitId(defender), capacity = authoritativeCapacities?.[id] ?? Math.max(0, defenderCapacity(defender) - Number(defender.defenseUses || 0)); return <option value={id} key={id}>{defender.name || "Criatura"} · espaço {Number(defender.slot || 0) + 1} · {selectedUsage(id, instance.attackId)}/{capacity} uso(s) nesta declaração</option>; })}</select></label>
      </article>;
    })}</div>
    {error && <div className="online-combat-error">{error}</div>}
    <footer><span>Após confirmar, abre a última janela de resposta antes de o dano ser resolvido da esquerda para a direita.</span><button className="online-combat-confirm" disabled={busy} onClick={onConfirm}>{busy ? "Confirmando…" : "CONFIRMAR BLOQUEIOS"}</button></footer>
  </section></div>;
}

export default function OnlineMatchRuntime() {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [attackerCounts, setAttackerCounts] = useState<Record<string, number>>({});
  const [blockAssignments, setBlockAssignments] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const stageKeyRef = useRef("");
  const roomRef = useRef<RoomSnapshot | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const busyRef = useRef(false);

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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const combat = game?.onlineCombat;
  const stageKey = `${session?.id || ""}:${game?.round || 0}:${combat?.stage || ""}:${combat?.attackerOwner ?? ""}`;
  useEffect(() => {
    if (!game || !combat || stageKeyRef.current === stageKey) return;
    stageKeyRef.current = stageKey;
    setError("");
    if (combat.stage === "declare-attackers") {
      const player = game.players[0];
      const mandatory: Record<string, number> = {};
      if (combat.attackerOwner === 0) {
        if (combat.interaction?.attackerOptions) for (const option of combat.interaction.attackerOptions) if (option.mandatoryUses > 0) mandatory[option.attackerId] = option.mandatoryUses;
        else for (const unit of player.board || []) if (obviousAttackReady(player, unit) && hasKeyword(unit, /indom[aá]vel/i)) mandatory[unitId(unit)] = remainingAttackUses(unit);
      }
      setAttackerCounts(mandatory);
    } else setAttackerCounts({});
    if (combat.stage === "declare-blockers") setBlockAssignments(Object.fromEntries((combat.attackers || []).map((instance) => [instance.attackId, null])));
    else setBlockAssignments({});
  }, [stageKey, combat?.interaction]);

  const command = async (payload: Record<string, unknown>): Promise<boolean> => {
    const currentSession = sessionRef.current;
    if (!currentSession || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      let baseRevision = roomRef.current?.revision;
      if (baseRevision == null) return false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(`/api/rooms/${encodeURIComponent(currentSession.id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "command", token: currentSession.token, command: payload, baseRevision }),
        });
        const result = await response.json() as CommandResult;
        if (result.game) applySnapshot(currentSession, result);
        if (response.status === 409 && attempt === 0 && result.revision != null) {
          baseRevision = result.revision;
          continue;
        }
        if (!response.ok) {
          setError(result.error || "O servidor recusou esta declaração.");
          return false;
        }
        return true;
      }
      setError("A sala mudou enquanto a declaração era enviada. Revise o estado atual e tente novamente.");
      return false;
    } catch {
      setError("Conexão instável. A declaração não foi enviada; tente novamente.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const orderedAttackIds = useMemo(() => {
    if (!game) return [];
    return [...(game.players[0].board || [])]
      .sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0))
      .flatMap((unit) => Array.from({ length: attackerCounts[unitId(unit)] || 0 }, () => unitId(unit)));
  }, [game, attackerCounts]);

  if (!session || !room || !game || room.status !== "started" || game.winner != null) return null;

  const confirmAttackers = () => { void command({ type: "declareAttackers", attackerIds: orderedAttackIds }); };
  const confirmBlockers = () => {
    const assignments = Object.entries(blockAssignments).flatMap(([attackId, defenderId]) => defenderId ? [{ attackId, defenderId }] : []);
    void command({ type: "declareBlockers", assignments });
  };

  return <>
    <OnlinePriorityHud game={game} />
    {combat?.stage === "declare-attackers" && <AttackerDeclaration game={game} counts={attackerCounts} setCounts={setAttackerCounts} busy={busy} error={error} onConfirm={confirmAttackers} />}
    {combat?.stage === "declare-blockers" && <BlockerDeclaration game={game} assignments={blockAssignments} setAssignments={setBlockAssignments} busy={busy} error={error} now={now} onConfirm={confirmBlockers} />}
  </>;
}
