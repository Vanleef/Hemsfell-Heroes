"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ResponseSpotlight } from "./response-spotlight";
import type { PriorityControlMode } from "./use-priority-control";
import { useDeadlineSeconds } from "../presentation/runtime/deadline-clock";

export function PriorityControlToggle({
  mode,
  queued,
  onToggle,
}: {
  mode: PriorityControlMode;
  queued: boolean;
  onToggle: () => void;
}) {
  const assisted = mode === "assisted";
  const explanation = assisted
    ? "Assistido: a janela só aparece quando houver uma resposta utilizável."
    : "Manual: toda janela de prioridade é exibida para você decidir.";
  const title = queued
    ? `Alteração agendada para depois da jogada/prioridade atual. ${explanation}`
    : explanation;
  return <button className="priority-control-toggle" title={title} onClick={onToggle}>{assisted ? "Modo: Assistido" : "Modo: Manual"}</button>;
}

type ResponseOption<TCard> = { card: TCard; index: number; cost: number };

export function ResponseModal<TCard>({
  action,
  sourceId,
  feedback,
  available,
  heroAbilities,
  budget,
  offTurn,
  deadline,
  passes = 0,
  renderCard,
  cardName,
  onPlay,
  onHeroAbility,
  onPass,
}: {
  action: string;
  sourceId?: string;
  feedback?: string;
  available: Array<ResponseOption<TCard>>;
  heroAbilities: Array<{ abilityId: string; label: string }>;
  budget: number;
  offTurn: boolean;
  deadline?: number | null;
  passes?: number;
  renderCard: (card: TCard, index: number, onPlay: () => void) => ReactNode;
  cardName: (card: TCard) => string;
  onPlay: (idx: number) => void;
  onHeroAbility: (abilityId: string) => void;
  onPass: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')]
        .filter(node => node.getClientRects().length > 0);
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", containFocus);
    return () => { document.removeEventListener("keydown", containFocus); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const seconds = useDeadlineSeconds(deadline);
  const hasResponses = available.length > 0 || heroAbilities.length > 0;
  return <div className="overlay response-overlay"><ResponseSpotlight sourceId={sourceId}/><section ref={dialogRef} tabIndex={-1} className="response-dialog" role="dialog" aria-modal="true" aria-labelledby="response-title"><header><span>JANELA DE RESPOSTA</span><b className={seconds <= 5 ? "urgent" : ""}>⏱ {seconds}s</b><b>{offTurn ? "Reserva" : "Energia"} · {budget}</b></header><h2 id="response-title">Sua prioridade</h2><div className="priority-status"><b>{passes === 0 ? "Primeiro passe" : "Segundo passe"}</b><span>{passes === 0 ? "A prioridade voltará ao jogador da ação" : "A ação será encerrada após este passe."}</span></div><p>O oponente realizou: <strong>{action}</strong>. Use um Feitiço Acelerado, uma habilidade ativa disponível do seu Herói ou passe.</p>{available.length ? <div className="response-cards">{available.map(({ card, index, cost }) => <div key={`${cardName(card)}-${index}`}>{renderCard(card, index, () => onPlay(index))}<b>{cardName(card)}</b><small>Responder · custo {cost}</small></div>)}</div> : null}{heroAbilities.length ? <div className="response-hero-abilities">{heroAbilities.map(ability => <button key={ability.abilityId} onClick={() => onHeroAbility(ability.abilityId)}><i>⚡</i><span><b>{ability.label}</b><small>Habilidade ativa do Herói</small></span></button>)}</div> : null}{!hasResponses ? <div className="no-response-card"><i>◇</i><b>Nenhuma resposta utilizável</b><span>Não há Feitiço Acelerado nem habilidade ativa de Herói legal neste momento. Passe para devolver a prioridade.</span></div> : null}{feedback&&<p role="alert" className="response-feedback">{feedback}</p>}<footer><button className="pass-response" onClick={onPass}>Passar prioridade</button></footer></section></div>;
}
