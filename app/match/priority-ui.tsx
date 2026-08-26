"use client";

import type { ReactNode } from "react";
import type { PriorityControlMode } from "./use-priority-control";

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
  available,
  heroAbilities,
  budget,
  offTurn,
  seconds,
  passes = 0,
  renderCard,
  cardName,
  onPlay,
  onHeroAbility,
  onPass,
}: {
  action: string;
  available: Array<ResponseOption<TCard>>;
  heroAbilities: Array<{ abilityId: string; label: string }>;
  budget: number;
  offTurn: boolean;
  seconds: number;
  passes?: number;
  renderCard: (card: TCard, index: number, onPlay: () => void) => ReactNode;
  cardName: (card: TCard) => string;
  onPlay: (idx: number) => void;
  onHeroAbility: (abilityId: string) => void;
  onPass: () => void;
}) {
  const hasResponses = available.length > 0 || heroAbilities.length > 0;
  return <div className="overlay response-overlay"><section className="response-dialog" role="dialog" aria-modal="true" aria-labelledby="response-title"><header><span>JANELA DE RESPOSTA</span><b className={seconds <= 5 ? "urgent" : ""}>⏱ {seconds}s</b><b>{offTurn ? "Reserva" : "Energia"} · {budget}</b></header><h2 id="response-title">Sua prioridade</h2><div className="priority-status"><b>{passes === 0 ? "Primeiro passe" : "Segundo passe"}</b><span>{passes === 0 ? "A prioridade voltará ao jogador da ação" : "A ação será encerrada após este passe."}</span></div><p>O oponente realizou: <strong>{action}</strong>. Use um Feitiço Acelerado, uma habilidade ativa disponível do seu Herói ou passe.</p>{available.length ? <div className="response-cards">{available.map(({ card, index, cost }) => <div key={`${cardName(card)}-${index}`}>{renderCard(card, index, () => onPlay(index))}<b>{cardName(card)}</b><small>Responder · custo {cost}</small></div>)}</div> : null}{heroAbilities.length ? <div className="response-hero-abilities">{heroAbilities.map(ability => <button key={ability.abilityId} onClick={() => onHeroAbility(ability.abilityId)}><i>⚡</i><span><b>{ability.label}</b><small>Habilidade ativa do Herói</small></span></button>)}</div> : null}{!hasResponses ? <div className="no-response-card"><i>◇</i><b>Nenhuma resposta utilizável</b><span>Não há Feitiço Acelerado nem habilidade ativa de Herói legal neste momento. Passe para devolver a prioridade.</span></div> : null}<footer><button className="pass-response" onClick={onPass}>Passar prioridade</button></footer></section></div>;
}
