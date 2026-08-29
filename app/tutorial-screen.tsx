"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { RemoteCardArt } from "./remote-card-art";
import {
  BASIC_COMMANDS,
  BOARD_ZONES,
  CARD_TYPES,
  COMBAT_STEPS,
  TUTORIAL_KEYWORDS,
  TUTORIAL_TABS,
  type TutorialTabId,
} from "./tutorial-content";

// Stable tutorial navigation: Fluxo completo · Tabuleiro · Comandos · Combate · Mecânicas.

function TutorialCard({ page, name, className = "" }: { page: number; name: string; className?: string }) {
  return <RemoteCardArt page={page} name={name} className={`tutorial-card-art ${className}`.trim()} />;
}

function SetupVisual() {
  return <div className="tutorial-visual setup-visual" aria-label="Dois Heróis com 30 de Vida e uma mão inicial de sete cartas">
    <div className="setup-hero"><TutorialCard page={2} name="Gimble, Presenteado Sortudo"/><span>30 <i>♥</i></span></div>
    <b className="versus-mark">VS</b>
    <div className="setup-hero"><TutorialCard page={26} name="Sr. Goblin, o Mercador de Bugigangas"/><span>30 <i>♥</i></span></div>
    <footer>{Array.from({ length: 7 }, (_, index) => <i key={index}/>)}<strong>7 CARTAS</strong></footer>
  </div>;
}

function BoardVisual() {
  return <div className="tutorial-visual board-visual" aria-label="Representação das zonas do tabuleiro">
    <span className="zone-label enemy-label">CAMPO ADVERSÁRIO</span>
    <div className="mini-row enemy-row"><i/><i/><TutorialCard page={35} name="Bombardeiro Gente Boa"/><i/><i/></div>
    <div className="mini-row mini-support-row"><i/><i/><TutorialCard page={36} name="Chaminé, o Mafioso"/><i/><i/></div>
    <div className="cruel-line"><span>TERRENO CRUEL</span><TutorialCard page={22} name="Alpes Dracônicos"/></div>
    <div className="mini-row"><i/><TutorialCard page={3} name="Valorian, o pseudodragão"/><i/><TutorialCard page={4} name="Dr.Elizabeth"/><i/></div>
    <div className="mini-row mini-support-row"><i/><TutorialCard page={19} name="Coração de Rubi"/><i/><i/><i/></div>
    <span className="zone-label player-label">SEU CAMPO</span>
  </div>;
}

function PhaseVisual({ active = 1 }: { active?: number }) {
  const phases = ["Manutenção", "Principal", "Combate", "Finalização"];
  return <div className="tutorial-visual phase-visual" aria-label="As quatro etapas do turno">
    <div className="phase-track" aria-hidden="true"/>
    {phases.map((phase, index) => <div className={index === active ? "active" : index < active ? "done" : ""} key={phase}>
      <i>{index < active ? "✓" : index + 1}</i><b>{phase}</b>
    </div>)}
  </div>;
}

function CommandVisual() {
  return <div className="tutorial-visual command-visual" aria-label="Hover, pressionar e arrastar uma carta">
    <TutorialCard page={3} name="Valorian, o pseudodragão"/>
    <span className="command-callout hover-callout"><i>◉</i><b>Hover · 1s</b><small>Preview rápido</small></span>
    <span className="command-callout hold-callout"><i className="hold-ring"/><b>Segure · 1s</b><small>Descrição completa</small></span>
    <span className="command-callout drag-callout"><i>↗</i><b>Arraste</b><small>Jogue no espaço válido</small></span>
  </div>;
}

function ResourceVisual() {
  return <div className="tutorial-visual resource-visual" aria-label="Energia principal e Energia de Reserva">
    <section><span>ENERGIA PRINCIPAL</span><div>{Array.from({ length: 10 }, (_, index) => <i className={index < 5 ? "filled" : ""} key={index}/>)}</div><b>5 / 10</b></section>
    <section className="reserve"><span>RESERVA</span><div>{Array.from({ length: 3 }, (_, index) => <i className={index < 2 ? "filled" : ""} key={index}/>)}</div><b>2 / 3</b></section>
    <TutorialCard page={69} name="Bola de Fogo"/>
    <footer><strong>Acelerado</strong><span>No turno adversário, use apenas a Reserva.</span></footer>
  </div>;
}

function CombatVisual() {
  return <div className="tutorial-visual combat-visual" aria-label="Uma criatura atacante e uma criatura bloqueadora">
    <div><span>ATACANTE</span><TutorialCard page={3} name="Valorian, o pseudodragão"/><b>⚔</b></div>
    <i className="combat-arrow">➜</i>
    <div><span>BLOQUEADORA</span><TutorialCard page={35} name="Bombardeiro Gente Boa"/><b>🛡</b></div>
    <footer><i/> Dano simultâneo <em>·</em> Veloz pode causar dano primeiro</footer>
  </div>;
}

function PriorityVisual() {
  return <div className="tutorial-visual priority-visual" aria-label="Pilha LIFO e janela de resposta">
    <header><span>JANELA DE RESPOSTA</span><b>SUA PRIORIDADE</b></header>
    <div className="priority-card-source"><TutorialCard page={18} name="Bater as Asas"/><small>AÇÃO ORIGINAL</small></div>
    <ol className="stack-frames">
      <li><span>3</span><b>Resposta B</b><small>resolve primeiro</small></li>
      <li><span>2</span><b>Resposta A</b><small>aguarda</small></li>
      <li><span>1</span><b>Ação original</b><small>aguarda</small></li>
    </ol>
    <footer><b>LIFO</b><span>Dois passes resolvem somente o item do topo.</span></footer>
  </div>;
}

function VictoryVisual() {
  return <div className="tutorial-visual victory-visual" aria-label="Herói adversário chegando a zero de Vida">
    <TutorialCard page={2} name="Gimble, Presenteado Sortudo"/>
    <div><span>30</span><i>♥</i><b>→</b><strong>0</strong><small>VIDA DO HERÓI</small></div>
    <TutorialCard page={26} name="Sr. Goblin, o Mercador de Bugigangas" className="defeated"/>
  </div>;
}

function ControlModesVisual() {
  return <div className="tutorial-visual control-modes-visual" aria-label="Comparação entre controle Assistido e Manual">
    <header><span>CONTROLE DE PRIORIDADE</span><b>Alterne fora de uma interação</b></header>
    <section className="assisted"><i>✓</i><div><b>Modo: Assistido</b><span>Abre a janela quando existe resposta utilizável.</span><small>AUTO-PASSA se não houver ação legal</small></div></section>
    <section className="manual"><i>◆</i><div><b>Modo: Manual</b><span>Exibe toda janela para você decidir.</span><small>FULL CONTROL · NUNCA AUTO-PASSA</small></div></section>
    <footer>Mudar durante uma interação agenda o novo modo para depois dela.</footer>
  </div>;
}

function GameModesVisual() {
  return <div className="tutorial-visual game-modes-visual" aria-label="Diferenças entre jogar contra IA e jogar Online">
    <section><i>♟</i><b>VS IA</b><span>Motor local</span><small>O bot decide sem rede e a apresentação bloqueia entradas até concluir.</small></section>
    <em>MESMAS<br/>REGRAS DE CARTA</em>
    <section><i>◎</i><b>ONLINE 1×1</b><span>Servidor autoritativo</span><small>Comandos, timers, prioridade, reconexão e zonas privadas são validados pela sala.</small></section>
  </div>;
}

function Chapter({ number, eyebrow, title, children, visual }: { number: string; eyebrow: string; title: string; children: ReactNode; visual: ReactNode }) {
  return <article className="tutorial-chapter">
    <div className="tutorial-chapter-copy"><header><i>{number}</i><span><small>{eyebrow}</small><h3>{title}</h3></span></header>{children}</div>
    <figure>{visual}</figure>
  </article>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="tutorial-section-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}

function FlowTab() {
  return <div className="tutorial-flow">
    <Chapter number="01" eyebrow="PREPARAÇÃO" title="Escolha o Herói e prepare a mão" visual={<SetupVisual/>}>
      <p>Cada jogador começa normalmente com <b>30 de Vida</b>, um Herói, um Deck Principal válido de <b>49 cartas</b> e 7 cartas na mão inicial. O Deck Extra guarda Imagens que entram apenas por efeitos.</p>
      <ul><li>No Online, confirme o deck e aguarde a definição de quem começa.</li><li>No mulligan, mantenha a mão ou devolva tudo para comprar uma carta a menos.</li></ul>
    </Chapter>
    <Chapter number="02" eyebrow="ETAPA 1" title="Manutenção: prepare cartas e recursos" visual={<PhaseVisual active={0}/> }>
      <p>Desvire o que puder, restaure o dano das criaturas e escolha entre <b>+1 de Energia Máxima e comprar 1</b> ou <b>comprar 2</b>. Depois, a Energia principal é gerada até o máximo.</p>
      <ul><li>No primeiro turno, a opção de aumentar Energia é obrigatória.</li><li>Energia Máxima chega a 10; gatilhos de Manutenção resolvem nesta etapa.</li></ul>
    </Chapter>
    <Chapter number="03" eyebrow="ETAPA 2" title="Principal: desenvolva seu campo" visual={<BoardVisual/>}>
      <p>Arraste cartas da mão para espaços válidos. Criaturas ocupam a fileira de combate; Artefatos e Encantos usam auxiliares; Terrenos ficam na zona de Terreno Cruel.</p>
      <ul><li>Pague custos e conclua alvos ou decisões antes de continuar.</li><li>A Reserva paga Feitiços e efeitos quando permitido, nunca Criaturas.</li><li>O ícone ⚡ indica uma habilidade ativável disponível.</li></ul>
    </Chapter>
    <Chapter number="04" eyebrow="COMANDOS" title="Leia, inspecione e jogue cartas" visual={<CommandVisual/>}>
      <p>Mantenha o cursor por <b>1 segundo</b> para o preview rápido. Pressione sem mover por <b>1 segundo</b> para abrir a descrição detalhada. Para jogar, arraste imediatamente até a zona destacada.</p>
      <ul><li>Um clique simples não abre descrições.</li><li>Qualquer movimento de arraste cancela a inspeção pressionada.</li></ul>
    </Chapter>
    <Chapter number="05" eyebrow="ETAPA 3" title="Combate: ataque, responda e bloqueie" visual={<CombatVisual/>}>
      <p>Declare criaturas aptas. O defensor escolhe bloqueadores legais ou aceita dano direto; depois das janelas de resposta, cada confronto aplica a Ofensividade das criaturas.</p>
      <ul><li>Enjoo impede atacar no turno de entrada, mas não impede defender.</li><li>Atacantes ficam viradas, salvo efeitos como Alerta.</li><li>Voar, Furtivo, Veloz, Atropelar e Defensor X alteram o confronto.</li></ul>
    </Chapter>
    <Chapter number="06" eyebrow="PRIORIDADE" title="Responda antes da resolução" visual={<PriorityVisual/>}>
      <p>Ações interativas abrem prioridade. Use um Feitiço <b>Acelerado</b>, uma habilidade legal ou passe. Respostas entram no topo da pilha e resolvem em ordem inversa.</p>
      <ul><li>Dois passes consecutivos resolvem apenas o item do topo; uma nova ação zera a contagem.</li><li>No turno adversário, Acelerados usam apenas a Reserva.</li><li>Assistido auto-passa somente quando não existe resposta legal; Manual mostra toda janela.</li></ul>
    </Chapter>
    <Chapter number="07" eyebrow="ETAPA 4 E VITÓRIA" title="Finalize e leve o Herói rival a zero" visual={<VictoryVisual/>}>
      <p>Na Finalização, a Energia principal restante vai para a Reserva, até o limite de <b>3</b>. Efeitos de fim do turno e a janela final resolvem antes da limpeza e da troca do jogador ativo.</p>
      <ul><li>Você vence ao reduzir a vida do herói inimigo a 0.</li><li>Um jogador também perde ao iniciar a Manutenção sem carta para comprar, por condição especial ou ao se render.</li></ul>
    </Chapter>
  </div>;
}

function BoardTab() {
  return <div className="tutorial-reference">
    <SectionHeading eyebrow="MAPA DO CAMPO" title="Cada zona tem uma responsabilidade" description="Identifique onde cada tipo de carta pode existir antes de tentar jogá-la."/>
    <BoardVisual/>
    <section className="tutorial-reference-grid">{BOARD_ZONES.map(zone => <article key={zone.title}><i>◇</i><span>{zone.badge}</span><h3>{zone.title}</h3><p>{zone.description}</p></article>)}</section>
    <aside className="tutorial-rule-note"><b>Visibilidade</b><span>Campo, Cemitério e Obscuro são públicos. Mãos e decks permanecem privados, exceto para cartas explicitamente reveladas.</span></aside>
  </div>;
}

function CommandsTab() {
  return <div className="tutorial-reference">
    <SectionHeading eyebrow="INTERAÇÃO" title="Faça cada gesto com intenção" description="Inspecionar, jogar e responder são comandos diferentes e não competem entre si."/>
    <CommandVisual/>
    <section className="tutorial-command-grid">{BASIC_COMMANDS.map((command, index) => <article key={command.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{command.title}</h3><p>{command.description}</p></div></article>)}</section>
    <SectionHeading eyebrow="PRIORIDADE" title="Assistido ou Manual (Full Control)" description="O modo altera apenas quando a interface pergunta; a legalidade das respostas continua no motor."/>
    <ControlModesVisual/>
    <div className="control-mode-grid">
      <article><b>Assistido</b><p>Mostra a janela quando existe um Acelerado ou habilidade de Herói utilizável. Sem resposta legal, faz auto-pass para manter o ritmo.</p></article>
      <article><b>Manual · Full Control</b><p>Exibe toda janela pertencente a você e aguarda Passar prioridade, mesmo quando nenhuma resposta está disponível.</p></article>
      <article><b>Troca segura</b><p>Se você alternar o modo durante uma jogada ou janela ativa, a mudança fica agendada e vale após a interação atual.</p></article>
    </div>
    <SectionHeading eyebrow="MODOS DE PARTIDA" title="PvAI e Online compartilham regras, não autoridade" description="A fonte da decisão e os controles de sessão mudam; o catálogo e as regras de carta permanecem os mesmos."/>
    <GameModesVisual/>
    <div className="game-mode-grid">
      <article><span>VS IA</span><h3>Resposta local</h3><p>O motor e a IA executam no cliente. Não há espera de rede nem reconexão de oponente.</p></article>
      <article><span>ONLINE 1×1</span><h3>Sala autoritativa</h3><p>O cliente envia comandos; o servidor valida estado, prioridade, timers, privacidade e revisões antes de atualizar ambos os jogadores.</p></article>
    </div>
  </div>;
}

function CombatTab() {
  return <div className="tutorial-reference">
    <SectionHeading eyebrow="COMBATE" title="Declare primeiro; o dano vem depois" description="Ataques e bloqueios são confirmados antes da resolução, com janelas claras para Acelerados."/>
    <CombatVisual/>
    <div className="combat-guide-grid">{COMBAT_STEPS.map((step, index) => <article key={step.title}><span>{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}</div>
    <div className="combat-rule-strip">
      <article><b>Enjoo</b><span>Não ataca nem paga Virar no turno de entrada, mas pode bloquear.</span></article>
      <article><b>Dano direto</b><span>Sem bloqueador, a Ofensividade reduz a Vida do Herói defensor.</span></article>
      <article><b>Dano letal</b><span>Destrói a criatura, salvo proteção como Indestrutível.</span></article>
      <article><b>Atropelar</b><span>Excesso após dano letal alcança o Herói defensor.</span></article>
    </div>
    <aside className="tutorial-rule-note"><b>Online</b><span>Atacantes e bloqueadores são confirmados como grupos. O servidor congela as escolhas legais e resolve as linhas na ordem definida.</span></aside>
  </div>;
}

function MechanicsTab() {
  return <div className="tutorial-reference">
    <SectionHeading eyebrow="RECURSOS" title="Energia principal cria pressão; Reserva protege respostas" description="Planeje o turno sem gastar tudo se quiser reagir depois."/>
    <ResourceVisual/>
    <SectionHeading eyebrow="TIPOS DE CARTA" title="Saiba o destino de cada carta" description="O tipo define a zona, o timing e como a carta permanece — ou não — no campo."/>
    <section className="tutorial-mechanics-grid card-types-grid">{CARD_TYPES.map(type => <article key={type.title}><h3>{type.title}</h3><p>{type.description}</p></article>)}</section>
    <SectionHeading eyebrow="PALAVRAS-CHAVE" title="Regras frequentes em linguagem curta" description="As definições abaixo vêm do mesmo glossário usado pelos tooltips durante a partida."/>
    <section className="tutorial-keyword-grid">{TUTORIAL_KEYWORDS.map(entry => <article data-tone={entry.tone} key={entry.title}><header><i>◆</i><h3>{entry.title}</h3></header><p>{entry.description}</p><small>{entry.example}</small></article>)}</section>
    <aside className="tutorial-rule-note"><b>Custos alternativos</b><span>Alguns efeitos também exigem Vida, marcadores, Virar ou sacrificar. Custos são pagos antes da resolução e a ação só pode começar se puderem ser pagos.</span></aside>
  </div>;
}

export function TutorialScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<TutorialTabId>("flow");
  const activeIndex = TUTORIAL_TABS.findIndex(tab => tab.id === activeTab);
  const active = TUTORIAL_TABS[activeIndex] ?? TUTORIAL_TABS[0];

  const selectAdjacentTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!(["ArrowLeft", "ArrowRight"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = TUTORIAL_TABS[(index + direction + TUTORIAL_TABS.length) % TUTORIAL_TABS.length];
    setActiveTab(next.id);
    // Roving tabindex keeps the five-tab strip reachable without requiring
    // five Tab presses, including when the strip scrolls horizontally.
    document.getElementById(`tutorial-tab-${next.id}`)?.focus();
  };

  return <section className="tutorial-screen">
    <header className="tutorial-hero">
      <button type="button" onClick={onBack}>← Menu</button>
      <div><p>ACADEMIA DE HEMSFELL</p><h1>Aprenda a jogar</h1><span>Do primeiro mulligan à última janela de prioridade.</span></div>
      <strong aria-hidden="true">?</strong>
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
      {activeTab === "flow" ? <FlowTab/> : activeTab === "board" ? <BoardTab/> : activeTab === "commands" ? <CommandsTab/> : activeTab === "combat" ? <CombatTab/> : <MechanicsTab/>}
    </main>
  </section>;
}
