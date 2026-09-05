type Owner = "opponent" | "player";

function SlotRow({ zone, owner, badge }: { zone: "aux" | "creature"; owner: Owner; badge: string }) {
  return <div className={`hh-tutorial-board-row is-${owner} is-${zone}`} data-zone-badge={badge}>
    <b className="hh-tutorial-zone-badge">{badge}</b>
    {Array.from({ length: 5 }, (_, index) => <i className="hh-tutorial-board-slot" key={index} />)}
  </div>;
}

function Hand({ owner }: { owner: Owner }) {
  return <div className={`hh-tutorial-live-hand is-${owner}`}>
    {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
  </div>;
}

function Hero({ owner }: { owner: Owner }) {
  return <div className={`hh-tutorial-live-hero is-${owner}`}>
    <i /><span><b>NV. 1</b><strong>{owner === "player" ? "Gimble" : "Sr. Goblin"}</strong><small>♥ 30</small></span>
  </div>;
}

function Energy({ owner }: { owner: Owner }) {
  return <div className={`hh-tutorial-live-energy is-${owner}`}>
    <b>ENERGIA</b><i>{owner === "player" ? "1/1" : "0/0"}</i><small>RESERVA · ○ ○ ○</small>
  </div>;
}

function Piles({ owner }: { owner: Owner }) {
  return <div className={`hh-tutorial-live-piles is-${owner}`}>
    {["DECK", "EXTRA", "CEM.", "OBS."].map((label) => <i key={label}>{label}</i>)}
  </div>;
}

function Terrain({ owner, badge }: { owner: Owner; badge: string }) {
  return <div className={`hh-tutorial-live-terrain is-${owner}`}><b className="hh-tutorial-zone-badge">{badge}</b><i /></div>;
}

/** Current composition on the first render, including SSR and chapter remounts. */
export default function TutorialCurrentBoard() {
  return <div className="tutorial-board-visual hh-tutorial-current-board" data-hh-current-board="true"
    role="img" aria-label="Tabuleiro atual: heróis à esquerda, cinco espaços de criaturas e cinco auxiliares por jogador, terrenos, mãos, energia e pilhas laterais">
    <div className="hh-tutorial-live-topbar">
      <span>☰ &nbsp; Turno 1 &nbsp; <b>Seu turno</b></span>
      <strong>① MANUTENÇÃO ② PRINCIPAL ③ COMBATE ④ FINALIZAÇÃO</strong><small>MODO: ASSISTIDO</small>
    </div>
    <div className="hh-tutorial-live-stage" aria-hidden="true">
      <Hero owner="opponent" /><Hero owner="player" />
      <Hand owner="opponent" /><Hand owner="player" />
      <Terrain owner="opponent" badge="3" /><Terrain owner="player" badge="6" />
      <div className="hh-tutorial-live-field">
        <SlotRow zone="aux" owner="opponent" badge="1" />
        <SlotRow zone="creature" owner="opponent" badge="2" />
        <div className="hh-tutorial-live-divider"><i /><span>CAMPO CENTRAL</span><i /></div>
        <SlotRow zone="creature" owner="player" badge="4" />
        <SlotRow zone="aux" owner="player" badge="5" />
      </div>
      <Energy owner="opponent" /><Energy owner="player" />
      <div className="hh-tutorial-live-phase"><small>FASE ATUAL</small><b>PRINCIPAL</b><span>COMBATE →</span></div>
      <Piles owner="opponent" /><Piles owner="player" />
    </div>
  </div>;
}
