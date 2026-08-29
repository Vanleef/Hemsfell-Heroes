"use client";

import { useState, type KeyboardEvent } from "react";
import { RemoteCardArt } from "../cards/remote-card-art";
import {
  BASIC_COMMANDS,
  BOARD_ZONES,
  CARD_TYPES,
  COMBAT_STEPS,
  QUICK_FACTS,
  TURN_STEPS,
  TUTORIAL_KEYWORDS,
  TUTORIAL_TABS,
  type TutorialTabId,
} from "./tutorial-content";

function TutorialCard({ page, name, className = "" }: { page: number; name: string; className?: string }) {
  return <RemoteCardArt page={page} name={name} className={`tutorial-card-art ${className}`.trim()} />;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="tutorial-section-heading">
    <span>{eyebrow}</span>
    <h2>{title}</h2>
    <p>{description}</p>
  </header>;
}

function TurnFlowVisual() {
  return <div className="tutorial-turn-flow" aria-label="Ordem das etapas do turno">
    {TURN_STEPS.map((step, index) => <div key={step.title}>
      <i>{index + 1}</i>
      <b>{step.title}</b>
      {index < TURN_STEPS.length - 1 ? <span aria-hidden="true">→</span> : null}
    </div>)}
  </div>;
}

function BoardVisual() {
  return <div className="tutorial-board-visual" aria-label="Resumo das principais zonas do tabuleiro">
    <span className="tutorial-board-side">OPONENTE</span>
    <div className="tutorial-board-row enemy"><i/><i/><TutorialCard page={35} name="Bombardeiro Gente Boa"/><i/><i/></div>
    <div className="tutorial-board-row support"><i/><i/><i/><i/><i/></div>
    <div className="tutorial-board-terrain"><span>TERRENO CRUEL</span><TutorialCard page={22} name="Alpes Dracônicos"/></div>
    <div className="tutorial-board-row"><i/><TutorialCard page={3} name="Valorian, o pseudodragão"/><i/><TutorialCard page={4} name="Dr.Elizabeth"/><i/></div>
    <div className="tutorial-board-row support"><i/><TutorialCard page={19} name="Coração de Rubi"/><i/><i/><i/></div>
    <span className="tutorial-board-side player">VOCÊ</span>
  </div>;
}

function CombatVisual() {
  return <div className="tutorial-combat-visual" aria-label="Exemplo simples de ataque e bloqueio">
    <div><small>ATACANTE</small><TutorialCard page={3} name="Valorian, o pseudodragão"/></div>
    <span aria-hidden="true">→</span>
    <div><small>BLOQUEADOR</small><TutorialCard page={35} name="Bombardeiro Gente Boa"/></div>
  </div>;
}

function StartTab() {
  return <div className="tutorial-tab-content">
    <SectionHeading eyebrow="COMECE AQUI" title="O jogo em menos de dois minutos" description="Aprenda o fluxo básico primeiro. Os detalhes aparecem nos tooltips durante a partida."/>

    <section className="tutorial-quick-facts">{QUICK_FACTS.map(item => <article key={item.title}>
      <b>{item.badge}</b><div><h3>{item.title}</h3><p>{item.description}</p></div>
    </article>)}</section>

    <section className="tutorial-simple-block">
      <div>
        <SectionHeading eyebrow="SEU TURNO" title="Quatro etapas" description="Siga esta ordem e use o botão de etapa quando terminar o que deseja fazer."/>
        <TurnFlowVisual/>
        <ol className="tutorial-step-list">{TURN_STEPS.map(step => <li key={step.title}><b>{step.title}</b><span>{step.description}</span></li>)}</ol>
      </div>
      <aside className="tutorial-card-example">
        <TutorialCard page={2} name="Gimble, Presenteado Sortudo"/>
        <div><small>OBJETIVO</small><b>Leve a Vida do Herói rival a 0.</b><span>Você também pode vencer por outras condições previstas pelas regras ou pela rendição do oponente.</span></div>
      </aside>
    </section>

    <SectionHeading eyebrow="CONTROLES" title="Só seis interações para lembrar" description="A interface destaca o que é válido; você não precisa decorar atalhos para começar."/>
    <section className="tutorial-command-grid">{BASIC_COMMANDS.map(command => <article key={command.title}><b>{command.title}</b><p>{command.description}</p></article>)}</section>

    <aside className="tutorial-rule-note"><b>Energia</b><span>Gaste Energia para jogar cartas. A Energia principal não usada pode abastecer a Reserva, até 3, para respostas e efeitos permitidos.</span></aside>
  </div>;
}

function CombatTab() {
  return <div className="tutorial-tab-content">
    <SectionHeading eyebrow="COMBATE" title="Ataque uma criatura por vez" description="O fluxo é sempre: declarar, responder, defender e resolver."/>
    <section className="tutorial-combat-layout">
      <CombatVisual/>
      <ol className="tutorial-step-list combat">{COMBAT_STEPS.map(step => <li key={step.title}><b>{step.title}</b><span>{step.description}</span></li>)}</ol>
    </section>

    <section className="tutorial-rule-cards">
      <article><b>Enjoo de Invocação</b><p>Normalmente impede atacar e pagar custos de Virar no turno em que a criatura entra. Ela ainda pode bloquear.</p></article>
      <article><b>Sem bloqueio</b><p>O dano do ataque vai para o Herói defensor quando nenhuma criatura bloqueia.</p></article>
      <article><b>Prioridade</b><p>Use um Acelerado, uma habilidade legal ou passe. Respostas resolvem do topo para baixo.</p></article>
      <article><b>Assistido x Manual</b><p>Assistido auto-passa quando não há resposta legal. Manual mantém as suas janelas abertas.</p></article>
    </section>

    <aside className="tutorial-rule-note"><b>No turno do oponente</b><span>Feitiços Acelerados usam a Reserva. Guarde recursos se quiser responder.</span></aside>
  </div>;
}

function ReferenceTab() {
  return <div className="tutorial-tab-content">
    <SectionHeading eyebrow="TABULEIRO" title="Onde cada coisa fica" description="As zonas válidas ficam destacadas quando você arrasta ou escolhe uma carta."/>
    <section className="tutorial-board-layout">
      <BoardVisual/>
      <div className="tutorial-zone-grid">{BOARD_ZONES.map(zone => <article key={zone.title}><span>{zone.badge}</span><h3>{zone.title}</h3><p>{zone.description}</p></article>)}</div>
    </section>

    <SectionHeading eyebrow="TIPOS DE CARTA" title="O básico de cada tipo" description="O tipo define onde a carta vai e se ela permanece no campo."/>
    <section className="tutorial-type-grid">{CARD_TYPES.map(type => <article key={type.title}><h3>{type.title}</h3><p>{type.description}</p></article>)}</section>

    <SectionHeading eyebrow="PALAVRAS-CHAVE" title="As mais comuns" description="Este é só o resumo. Passe o mouse sobre palavras-chave durante a partida para ver a definição completa."/>
    <section className="tutorial-keyword-grid">{TUTORIAL_KEYWORDS.map(entry => <article data-tone={entry.tone} key={entry.title}><h3>{entry.title}</h3><p>{entry.description}</p></article>)}</section>

    <aside className="tutorial-rule-note"><b>Não precisa memorizar tudo</b><span>Alvos válidos, habilidades disponíveis, custos e palavras-chave são explicados pela própria interface enquanto você joga.</span></aside>
  </div>;
}

export function TutorialScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<TutorialTabId>("start");
  const activeIndex = Math.max(0, TUTORIAL_TABS.findIndex(tab => tab.id === activeTab));
  const active = TUTORIAL_TABS[activeIndex];

  const selectAdjacentTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = TUTORIAL_TABS[(index + direction + TUTORIAL_TABS.length) % TUTORIAL_TABS.length];
    setActiveTab(next.id);
    document.getElementById(`tutorial-tab-${next.id}`)?.focus();
  };

  return <section className="tutorial-screen">
    <header className="tutorial-hero">
      <button type="button" onClick={onBack}>← Menu</button>
      <div><p>TUTORIAL</p><h1>Aprenda a jogar</h1><span>O essencial para começar uma partida sem atravessar um manual inteiro.</span></div>
    </header>

    <nav className="tutorial-tabs" role="tablist" aria-label="Seções do tutorial">{TUTORIAL_TABS.map((tab, index) => <button
      id={`tutorial-tab-${tab.id}`}
      type="button"
      role="tab"
      aria-selected={activeTab === tab.id}
      aria-controls="tutorial-panel"
      tabIndex={activeTab === tab.id ? 0 : -1}
      className={activeTab === tab.id ? "active" : ""}
      onClick={() => setActiveTab(tab.id)}
      onKeyDown={event => selectAdjacentTab(event, index)}
      key={tab.id}
    ><b>{tab.label}</b><span>{tab.description}</span></button>)}</nav>

    <main id="tutorial-panel" className="tutorial-panel" role="tabpanel" tabIndex={0} aria-labelledby={`tutorial-tab-${active.id}`}>
      {activeTab === "start" ? <StartTab/> : activeTab === "combat" ? <CombatTab/> : <ReferenceTab/>}
    </main>
  </section>;
}
