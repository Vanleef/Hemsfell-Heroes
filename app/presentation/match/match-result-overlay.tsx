"use client";

import { RemoteCardArt } from "../cards/remote-card-art";

type MatchResultOverlayProps = {
  heroPage: number;
  heroName: string;
  rounds: number;
  online: boolean;
  rematchPending?: boolean;
  rematchRequestedByMe?: boolean;
  rematchRequestedByOpponent?: boolean;
  onMenu: () => void;
  onRematch: () => void;
};

export function MatchResultOverlay({
  heroPage,
  heroName,
  rounds,
  online,
  rematchPending = false,
  rematchRequestedByMe = false,
  rematchRequestedByOpponent = false,
  onMenu,
  onRematch,
}: MatchResultOverlayProps) {
  const waiting = online && (rematchPending || rematchRequestedByMe);
  const rematchLabel = waiting ? "Aguardando o outro jogador…" : "Jogar novamente";
  const rematchStatus = rematchRequestedByMe
    ? "Aguardando o outro jogador escolher jogar novamente."
    : rematchRequestedByOpponent
      ? "O outro jogador quer jogar novamente."
      : "";

  return <div className="overlay match-result-overlay" role="dialog" aria-modal="true" aria-labelledby="match-result-winner-name">
    <section className="match-result-card">
      <header className="match-result-heading">
        <small>FIM DE PARTIDA</small>
        <h2 id="match-result-winner-name">{heroName}</h2>
      </header>
      <div className="match-result-portrait">
        <RemoteCardArt page={heroPage} name={heroName.replace(/^\(IA\)\s*/, "")} priority />
      </div>
      <strong className="match-result-winner">Vencedor</strong>
      <p className="match-result-summary">Partida encerrada após {rounds} {rounds === 1 ? "turno" : "turnos"}.</p>
      {online && rematchStatus ? <p className="match-result-rematch-status" aria-live="polite">{rematchStatus}</p> : null}
      <footer className="match-result-actions">
        <button type="button" className="match-result-menu" onClick={onMenu}>Voltar ao menu</button>
        <button type="button" className="gold match-result-rematch" onClick={onRematch} disabled={waiting}>{rematchLabel}</button>
      </footer>
    </section>
  </div>;
}
