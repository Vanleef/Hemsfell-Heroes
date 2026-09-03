"use client";

import Image from "next/image";

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

const HERO_RESULT_ART: Record<number, { src: string; position: string }> = {
  2: { src: "/heroes/gimble.webp", position: "58% 18%" },
  26: { src: "/heroes/goblin.webp", position: "50% 19%" },
  54: { src: "/heroes/uruk.webp", position: "50% 20%" },
  110: { src: "/heroes/tifon.webp", position: "50% 22%" },
  129: { src: "/heroes/saymon.webp", position: "50% 18%" },
  152: { src: "/heroes/tessalia.webp", position: "57% 18%" },
  180: { src: "/heroes/quarion.webp", position: "50% 18%" },
  211: { src: "/heroes/rasmus.webp", position: "57% 17%" },
  255: { src: "/heroes/ngoro.webp", position: "50% 17%" },
  273: { src: "/heroes/zayan.webp", position: "50% 19%" },
  291: { src: "/heroes/natureza.webp", position: "58% 20%" },
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
  const heroArt = HERO_RESULT_ART[heroPage] ?? HERO_RESULT_ART[2];
  const cleanHeroName = heroName.replace(/^\(IA\)\s*/, "");

  return <div className="overlay match-result-overlay" role="dialog" aria-modal="true" aria-labelledby="match-result-winner-name">
    <section className="match-result-card">
      <header className="match-result-heading">
        <small>FIM DE PARTIDA</small>
        <h2 id="match-result-winner-name">{heroName}</h2>
      </header>
      <div className="match-result-portrait">
        <Image
          className="match-result-hero-art"
          src={heroArt.src}
          alt={cleanHeroName}
          fill
          priority
          sizes="(max-width: 34rem) 72vw, 18rem"
          style={{ objectPosition: heroArt.position }}
        />
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
