"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { RemoteCardArt } from "../cards/remote-card-art";
import {
  BASIC_COMMANDS,
  BOARD_ZONES,
  CARD_ANATOMY,
  CARD_TYPES,
  COMBAT_STEPS,
  GLOSSARY_ENTRIES,
  GLOSSARY_RANGES,
  QUICK_FACTS,
  TURN_STEPS,
  TUTORIAL_CHAPTERS,
  TUTORIAL_VIEWS,
  type GlossaryRangeId,
  type TutorialChapterId,
  type TutorialGlossaryEntry,
  type TutorialViewId,
} from "./tutorial-content";

function TutorialCard({ page, name, className = "" }: { page: number; name: string; className?: string }) {
  return <RemoteCardArt page={page} name={name} className={`tutorial-card-art ${className}`.trim()} />;
}

function LessonHeading({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return <header className="tutorial-lesson-heading">
    <span>{step}</span>
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
  const slots = (prefix: string) => <div className="tutorial-board-slot-row" aria-hidden="true">
    {Array.from({ length: 5 }, (_, index) => <i key={`${prefix}-${index}`}/>) }
  </div>;
  const backs = (prefix: string) => <div className="tutorial-board-hand" aria-hidden="true">
    {Array.from({ length: 7 }, (_, index) => <i key={`${prefix}-${index}`}/>) }
  </div>;
  const piles = (owner: "opponent" | "player") => <div className={`tutorial-board-piles is-${owner}`} aria-hidden="true">
    <i>DECK</i><i>EXTRA</i><i>CEM.</i><i>OBS.</i>
  </div>;
  return <div className="tutorial-board-diagram">
    <div className="tutorial-board-visual" aria-label="Representação do tabuleiro vazio do jogo com as zonas do oponente e do jogador">
      <div className="tutorial-board-phase">MANUTENÇÃO · PRINCIPAL · COMBATE · FINALIZAÇÃO</div>
      <div className="tutorial-board-hand-area is-opponent">{backs("opponent-hand")}</div>
      <div className="tutorial-board-resource is-opponent"><span>ENERGIA E RESERVA DO OPONENTE</span><i/></div>
      <div className="tutorial-board-playfield">
        <div className="tutorial-board-heroes" aria-hidden="true"><i><b>♥ 30</b></i><i><b>♥ 30</b></i></div>
        <div className="tutorial-board-terrains">
          <div><b>3</b><i/><small>TERRENO</small></div>
          <div><b>6</b><i/><small>TERRENO</small></div>
        </div>
        <div className="tutorial-board-rows">
          <div className="tutorial-field-zone is-opponent auxiliary"><b>1</b>{slots("opponent-auxiliary")}</div>
          <div className="tutorial-field-zone is-opponent creature"><b>2</b>{slots("opponent-creature")}</div>
          <div className="tutorial-field-divider"><i/><span>CAMPO CENTRAL</span><i/></div>
          <div className="tutorial-field-zone is-player creature"><b>4</b>{slots("player-creature")}</div>
          <div className="tutorial-field-zone is-player auxiliary"><b>5</b>{slots("player-auxiliary")}</div>
        </div>
        <div className="tutorial-board-side-piles">{piles("opponent")}{piles("player")}</div>
      </div>
      <div className="tutorial-board-resource is-player"><span>SUA ENERGIA E RESERVA</span><i/></div>
      <div className="tutorial-board-hand-area is-player">{backs("player-hand")}</div>
    </div>
    <div className="tutorial-board-legend" aria-label="Tipos permitidos em cada zona">
      <article><b>1</b><span><strong>Auxiliares do oponente</strong><small>Encantos, Artefatos e Imagens auxiliares.</small></span></article>
      <article><b>2</b><span><strong>Criaturas do oponente</strong><small>Criaturas e Imagens de Criatura.</small></span></article>
      <article><b>3</b><span><strong>Terreno Cruel do oponente</strong><small>Um Terreno.</small></span></article>
      <article><b>4</b><span><strong>Suas criaturas</strong><small>Criaturas e Imagens de Criatura.</small></span></article>
      <article><b>5</b><span><strong>Seus auxiliares</strong><small>Encantos, Artefatos e Imagens auxiliares.</small></span></article>
      <article><b>6</b><span><strong>Seu Terreno Cruel</strong><small>Um Terreno.</small></span></article>
    </div>
  </div>;
}

function CombatVisual() {
  return <div className="tutorial-combat-visual" aria-label="Exemplo simples de ataque e bloqueio">
    <div><small>ATACANTE</small><TutorialCard page={3} name="Valorian, o pseudodragão"/></div>
    <span aria-hidden="true">→</span>
    <div><small>BLOQUEADOR</small><TutorialCard page={35} name="Bombardeiro Gente Boa"/></div>
  </div>;
}

function FirstDuelLesson() {
  return <>
    <LessonHeading step="ETAPA 1 DE 5" title="Objetivo e recursos da partida" description="Conheça a condição principal de vitória e os valores usados no início da partida."/>
    <section className="tutorial-fact-grid" aria-label="Números essenciais da partida">
      {QUICK_FACTS.map(item => <article key={item.title}>
        <b>{item.badge}</b><div><h3>{item.title}</h3><p>{item.description}</p></div>
      </article>)}
    </section>
    <section className="tutorial-lesson-split">
      <div className="tutorial-objective-copy">
        <span>OBJETIVO PRINCIPAL</span>
        <h3>Leve a Vida do Herói rival a 0.</h3>
        <p>Você também pode vencer por outras condições previstas pelas regras ou pela rendição do oponente.</p>
        <aside className="tutorial-rule-note"><b>Energia e Reserva</b><span>Gaste Energia para jogar cartas. Até 3 de Energia não usada pode abastecer a Reserva para respostas e efeitos permitidos.</span></aside>
      </div>
      <TutorialCard page={2} name="Gimble, Presenteado Sortudo" className="tutorial-hero-card"/>
    </section>
  </>;
}

function CardsLesson() {
  return <>
    <LessonHeading step="ETAPA 2 DE 5" title="Informações de uma carta" description="Veja onde ficam o custo, os atributos, o tipo, o subtipo, o nome e a descrição."/>
    <section className="tutorial-card-anatomy">
      <div className="tutorial-card-stage">
        <div className="tutorial-card-blueprint">
          <TutorialCard page={3} name="Valorian, o pseudodragão"/>
          {CARD_ANATOMY.map(item => <i key={item.badge} data-marker={item.badge}><span>{item.badge}</span></i>)}
        </div>
      </div>
      <ol>
        {CARD_ANATOMY.map(item => <li key={item.title}><b>{item.badge}</b><div><h3>{item.title}</h3><p>{item.description}</p></div></li>)}
      </ol>
    </section>
    <section className="tutorial-type-grid" aria-label="Tipos de carta">
      {CARD_TYPES.map(type => <article key={type.title}><h3>{type.title}</h3><p>{type.description}</p></article>)}
    </section>
  </>;
}

function BoardLesson() {
  return <>
    <LessonHeading step="ETAPA 3 DE 5" title="Zonas do tabuleiro" description="Cada jogador possui cinco espaços de criatura, cinco espaços auxiliares e um espaço de Terreno Cruel."/>
    <section className="tutorial-board-layout">
      <BoardVisual/>
      <div className="tutorial-zone-grid">
        {BOARD_ZONES.map(zone => <article key={zone.title}><span>{zone.badge}</span><h3>{zone.title}</h3><p>{zone.description}</p></article>)}
      </div>
    </section>
  </>;
}

function TurnLesson() {
  return <>
    <LessonHeading step="ETAPA 4 DE 5" title="Etapas do turno" description="O turno segue Manutenção, Principal, Combate e Finalização. Use Passar quando terminar uma ação ou não quiser responder."/>
    <TurnFlowVisual/>
    <ol className="tutorial-step-list">
      {TURN_STEPS.map(step => <li key={step.title}><b>{step.title}</b><span>{step.description}</span></li>)}
    </ol>
    <section className="tutorial-command-grid" aria-label="Controles básicos">
      {BASIC_COMMANDS.map(command => <article key={command.title}><b>{command.title}</b><p>{command.description}</p></article>)}
    </section>
  </>;
}

function CombatLesson() {
  return <>
    <LessonHeading step="ETAPA 5 DE 5" title="Combate" description="Ataque com uma criatura por vez. Cada ataque segue declaração, resposta, bloqueio e resolução de dano."/>
    <section className="tutorial-combat-layout">
      <CombatVisual/>
      <ol className="tutorial-step-list combat">
        {COMBAT_STEPS.map(step => <li key={step.title}><b>{step.title}</b><span>{step.description}</span></li>)}
      </ol>
    </section>
    <section className="tutorial-rule-grid">
      <article><b>Enjoo de Invocação</b><p>Normalmente impede atacar e pagar custos de Virar no turno em que a criatura entra. Ela ainda pode bloquear.</p></article>
      <article><b>Sem bloqueio</b><p>O dano do ataque vai para o Herói defensor quando nenhuma criatura bloqueia.</p></article>
      <article><b>Prioridade</b><p>Use um Acelerado, uma habilidade legal ou passe. Respostas resolvem do topo para baixo.</p></article>
      <article><b>No turno rival</b><p>Feitiços Acelerados usam a Reserva. Guarde recursos se quiser responder.</p></article>
    </section>
  </>;
}

function GuideLesson({ chapter }: { chapter: TutorialChapterId }) {
  if (chapter === "first-duel") return <FirstDuelLesson/>;
  if (chapter === "cards") return <CardsLesson/>;
  if (chapter === "board") return <BoardLesson/>;
  if (chapter === "turn") return <TurnLesson/>;
  return <CombatLesson/>;
}

const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

function entryMatchesRange(entry: TutorialGlossaryEntry, range: GlossaryRangeId) {
  if (range === "all") return true;
  const initial = normalizeText(entry.label).charAt(0).toUpperCase();
  if (range === "symbols-d") return initial < "E";
  if (range === "e-l") return initial >= "E" && initial <= "L";
  if (range === "m-s") return initial >= "M" && initial <= "S";
  return initial >= "T";
}

function GlossaryView() {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<GlossaryRangeId>("all");
  const normalizedQuery = normalizeText(query.trim());
  const entries = useMemo(() => GLOSSARY_ENTRIES.filter(entry => {
    const searchable = [entry.label, entry.description, ...(entry.aliases ?? [])].map(normalizeText).join(" ");
    return entryMatchesRange(entry, range) && (!normalizedQuery || searchable.includes(normalizedQuery));
  }), [normalizedQuery, range]);

  return <section className="tutorial-glossary" aria-labelledby="tutorial-glossary-title">
    <header className="tutorial-glossary-heading">
      <h2 id="tutorial-glossary-title">Glossário</h2>
      <p>Consulte regras e palavras-chave.</p>
    </header>

    <div className="tutorial-glossary-tools">
      <label htmlFor="tutorial-glossary-search">
        <span>Buscar no glossário</span>
        <input
          id="tutorial-glossary-search"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Ex.: Voar, Reserva, destruir..."
          autoComplete="off"
        />
      </label>
      <div className="tutorial-range-filter" role="group" aria-label="Filtrar termos por letra">
        {GLOSSARY_RANGES.map(item => <button type="button" aria-pressed={range === item.id} onClick={() => setRange(item.id)} key={item.id}>{item.label}</button>)}
      </div>
      <output aria-live="polite">{entries.length} {entries.length === 1 ? "termo" : "termos"}</output>
    </div>

    {entries.length ? <div className="tutorial-glossary-list">
      {entries.map(entry => <article data-tone={entry.tone} key={entry.key}>
        <header><h3>{entry.label}</h3><span>{entry.tone}</span></header>
        <p>{entry.description}</p>
        {entry.aliases?.length ? <small>Também aparece como: {entry.aliases.join(", ")}</small> : null}
      </article>)}
    </div> : <div className="tutorial-glossary-empty">
      <h3>Nenhum termo encontrado</h3>
      <p>Tente outra palavra ou volte ao filtro “Todos”.</p>
      <button type="button" onClick={() => { setQuery(""); setRange("all"); }}>Limpar busca</button>
    </div>}
  </section>;
}

export function TutorialScreen({ onBack }: { onBack: () => void }) {
  const [activeView, setActiveView] = useState<TutorialViewId>("guide");
  const [activeChapter, setActiveChapter] = useState<TutorialChapterId>("first-duel");
  const chapterIndex = Math.max(0, TUTORIAL_CHAPTERS.findIndex(chapter => chapter.id === activeChapter));
  const chapter = TUTORIAL_CHAPTERS[chapterIndex];

  const selectAdjacentView = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = TUTORIAL_VIEWS[(index + direction + TUTORIAL_VIEWS.length) % TUTORIAL_VIEWS.length];
    setActiveView(next.id);
    document.getElementById(`tutorial-view-${next.id}`)?.focus();
  };

  const goToChapter = (index: number) => {
    const next = TUTORIAL_CHAPTERS[index];
    if (!next) return;
    setActiveChapter(next.id);
    requestAnimationFrame(() => document.getElementById("tutorial-lesson")?.focus());
  };

  return <section className="tutorial-screen">
    <header className="tutorial-header">
      <button type="button" className="tutorial-back" onClick={onBack} aria-label="Voltar ao menu">← <span>Menu</span></button>
      <div><p>ACADEMIA DE HEMSFELL</p><h1>Aprenda a jogar</h1></div>
      <nav className="tutorial-view-tabs" role="tablist" aria-label="Áreas do tutorial">
        {TUTORIAL_VIEWS.map((view, index) => <button
          id={`tutorial-view-${view.id}`}
          type="button"
          role="tab"
          aria-selected={activeView === view.id}
          aria-controls="tutorial-content"
          tabIndex={activeView === view.id ? 0 : -1}
          onClick={() => setActiveView(view.id)}
          onKeyDown={event => selectAdjacentView(event, index)}
          key={view.id}
        >{view.label}</button>)}
      </nav>
    </header>

    <main id="tutorial-content" className="tutorial-content" role="tabpanel" aria-labelledby={`tutorial-view-${activeView}`}>
      {activeView === "guide" ? <div className="tutorial-guide">
        <aside className="tutorial-chapter-rail" aria-label="Capítulos do guia">
          <header><span>CAPÍTULOS</span><b>{chapterIndex + 1} de {TUTORIAL_CHAPTERS.length}</b></header>
          <div className="tutorial-progress" aria-hidden="true"><i style={{ width: `${((chapterIndex + 1) / TUTORIAL_CHAPTERS.length) * 100}%` }}/></div>
          <nav>{TUTORIAL_CHAPTERS.map((item, index) => <button
            type="button"
            className={activeChapter === item.id ? "active" : ""}
            aria-current={activeChapter === item.id ? "step" : undefined}
            onClick={() => goToChapter(index)}
            key={item.id}
          ><i>{index + 1}</i><span><b>{item.label}</b><small>{item.description}</small></span></button>)}</nav>
        </aside>

        <article id="tutorial-lesson" className="tutorial-lesson" tabIndex={-1}>
          <GuideLesson chapter={activeChapter}/>
          <footer className="tutorial-lesson-nav">
            <button type="button" onClick={() => goToChapter(chapterIndex - 1)} disabled={chapterIndex === 0}>← Anterior</button>
            <span>{chapter.label}</span>
            {chapterIndex < TUTORIAL_CHAPTERS.length - 1
              ? <button type="button" className="primary" onClick={() => goToChapter(chapterIndex + 1)}>Próximo →</button>
              : <button type="button" className="primary" onClick={() => setActiveView("glossary")}>Abrir glossário →</button>}
          </footer>
        </article>
      </div> : <GlossaryView/>}
    </main>
  </section>;
}
