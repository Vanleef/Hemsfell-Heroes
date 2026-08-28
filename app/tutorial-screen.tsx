"use client";

import { useState, type ReactNode } from "react";
import { RemoteCardArt } from "./remote-card-art";

type TutorialTab = "flow" | "board" | "commands" | "combat" | "mechanics";

const TABS: Array<{ id: TutorialTab; label: string; description: string }> = [
  { id: "flow", label: "Fluxo completo", description: "Da preparação à vitória" },
  { id: "board", label: "Tabuleiro", description: "Zonas e recursos" },
  { id: "commands", label: "Comandos", description: "Como interagir" },
  { id: "combat", label: "Combate", description: "Ataque e defesa" },
  { id: "mechanics", label: "Mecânicas", description: "Cartas e palavras-chave" },
];

function TutorialCard({ page, name, className = "" }: { page: number; name: string; className?: string }) {
  return <RemoteCardArt page={page} name={name} className={`tutorial-card-art ${className}`.trim()} />;
}

function SetupVisual() {
  return <div className="tutorial-visual setup-visual" aria-label="Dois heróis e suas mãos iniciais">
    <div><TutorialCard page={2} name="Gimble, Presenteado Sortudo"/><span>30 ♥</span></div>
    <b>VS</b>
    <div><TutorialCard page={26} name="Sr. Goblin, o Mercador"/><span>30 ♥</span></div>
    <footer><i/><i/><i/><i/><i/><i/><i/><strong>7 cartas</strong></footer>
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
    {phases.map((phase, index) => <div className={index === active ? "active" : index < active ? "done" : ""} key={phase}><i>{index + 1}</i><b>{phase}</b></div>)}
  </div>;
}

function CommandVisual() {
  return <div className="tutorial-visual command-visual" aria-label="Hover, pressionar e arrastar uma carta">
    <TutorialCard page={3} name="Valorian, o pseudodragão"/>
    <span className="command-callout hover-callout"><b>Hover · 1s</b><small>Preview rápido</small></span>
    <span className="command-callout hold-callout"><i/><b>Segure · 1s</b><small>Descrição completa</small></span>
    <span className="command-callout drag-callout"><b>Arraste</b><small>Jogue no espaço válido</small></span>
  </div>;
}

function ResourceVisual() {
  return <div className="tutorial-visual resource-visual" aria-label="Energia principal e energia de reserva">
    <section><span>ENERGIA</span><div>{Array.from({ length: 10 }, (_, index) => <i className={index < 5 ? "filled" : ""} key={index}/>)}</div><b>5/10</b></section>
    <section className="reserve"><span>RESERVA</span><div>{Array.from({ length: 3 }, (_, index) => <i className={index < 2 ? "filled" : ""} key={index}/>)}</div><b>2/3</b></section>
    <TutorialCard page={69} name="Bola de Fogo"/>
  </div>;
}

function CombatVisual() {
  return <div className="tutorial-visual combat-visual" aria-label="Uma criatura atacante e uma criatura bloqueadora">
    <div><span>ATACANTE</span><TutorialCard page={3} name="Valorian, o pseudodragão"/><b>⚔</b></div>
    <i className="combat-arrow">➜</i>
    <div><span>BLOQUEADORA</span><TutorialCard page={35} name="Bombardeiro Gente Boa"/><b>🛡</b></div>
    <footer>Dano simultâneo, salvo regras como Veloz</footer>
  </div>;
}

function PriorityVisual() {
  return <div className="tutorial-visual priority-visual" aria-label="Pilha e janela de resposta">
    <TutorialCard page={18} name="Bater as Asas"/>
    <div><span>AÇÃO</span><b>1</b></div><i>→</i><div className="response"><span>RESPOSTA</span><b>2</b></div><i>→</i><div><span>RESOLVE</span><b>✓</b></div>
    <small>A última resposta adicionada resolve primeiro.</small>
  </div>;
}

function VictoryVisual() {
  return <div className="tutorial-visual victory-visual" aria-label="Herói adversário chegando a zero de vida">
    <TutorialCard page={2} name="Gimble, Presenteado Sortudo"/>
    <div><span>30</span><i>♥</i><b>→</b><strong>0</strong><small>VIDA DO HERÓI</small></div>
    <TutorialCard page={26} name="Sr. Goblin, o Mercador" className="defeated"/>
  </div>;
}

function Chapter({ number, eyebrow, title, children, visual }: { number: string; eyebrow: string; title: string; children: ReactNode; visual: ReactNode }) {
  return <article className="tutorial-chapter">
    <div className="tutorial-chapter-copy"><header><i>{number}</i><span><small>{eyebrow}</small><h3>{title}</h3></span></header>{children}</div>
    <figure>{visual}</figure>
  </article>;
}

function FlowTab() {
  return <div className="tutorial-flow">
    <Chapter number="01" eyebrow="PREPARAÇÃO" title="Escolha o herói e prepare a mão" visual={<SetupVisual/>}>
      <p>Cada jogador começa normalmente com <b>30 de vida</b>, um herói, um Deck Principal válido de <b>49 cartas</b> e até 7 cartas na mão inicial. O Deck Extra guarda Imagens que entram apenas por efeitos.</p>
      <ul><li>No Online, confirme o deck e aguarde a escolha de quem começa.</li><li>No mulligan, mantenha a mão ou devolva tudo para comprar uma carta a menos.</li></ul>
    </Chapter>
    <Chapter number="02" eyebrow="ETAPA 1" title="Manutenção: prepare recursos" visual={<PhaseVisual active={0}/> }>
      <p>Suas cartas são preparadas conforme as regras e você escolhe entre <b>aumentar a Energia Máxima em 1 e comprar 1</b>, ou manter o limite e <b>comprar 2</b>. A energia principal é então recarregada.</p>
      <ul><li>Energia Máxima chega a 10.</li><li>Efeitos de “início da Manutenção” resolvem nesta etapa.</li></ul>
    </Chapter>
    <Chapter number="03" eyebrow="ETAPA 2" title="Principal: construa o campo" visual={<BoardVisual/>}>
      <p>Arraste cartas da mão para espaços válidos. Criaturas ocupam a fileira superior; Artefatos e outras constantes usam a fileira auxiliar; Terrenos ficam na zona de Terreno Cruel.</p>
      <ul><li>Pague os custos usando Energia e, quando permitido, Reserva.</li><li>Escolha alvos destacados e conclua decisões antes de continuar.</li><li>Use o ícone ⚡ para habilidades ativáveis disponíveis.</li></ul>
    </Chapter>
    <Chapter number="04" eyebrow="COMANDOS" title="Leia, inspecione e jogue cartas" visual={<CommandVisual/>}>
      <p>Mantenha o cursor por <b>1 segundo</b> para o preview rápido. Pressione sem mover por <b>1 segundo</b> para abrir a descrição detalhada. Para jogar, arraste imediatamente até a zona destacada.</p>
      <ul><li>Um clique simples não abre descrições.</li><li>Qualquer movimento de arraste cancela a inspeção pressionada.</li></ul>
    </Chapter>
    <Chapter number="05" eyebrow="ETAPA 3" title="Combate: declare ataques" visual={<CombatVisual/>}>
      <p>Escolha uma criatura apta para atacar. O defensor seleciona uma criatura legal para bloquear ou aceita o ataque direto. As duas criaturas causam dano conforme sua Ofensividade.</p>
      <ul><li>Criaturas normalmente entram com Enjoo e não atacam no mesmo turno.</li><li>Atacantes ficam viradas, salvo efeitos como Alerta.</li><li>Voar, Furtivo, Veloz, Atropelar e Defensor alteram o combate.</li></ul>
    </Chapter>
    <Chapter number="06" eyebrow="PRIORIDADE" title="Responda antes da resolução" visual={<PriorityVisual/>}>
      <p>Ações importantes podem abrir uma janela de resposta. Use um feitiço <b>Acelerado</b>, uma habilidade legal ou passe. Quando ambos passam, a pilha resolve da resposta mais recente para a ação original.</p>
      <ul><li>No turno adversário, Acelerados usam apenas a Reserva.</li><li>Popups de alvo e efeitos aparecem somente após a apresentação da ação anterior.</li></ul>
    </Chapter>
    <Chapter number="07" eyebrow="ETAPA 4 E VITÓRIA" title="Finalize e reduza o herói rival a zero" visual={<VictoryVisual/>}>
      <p>Na Finalização, conclua efeitos de fim do turno e encerre. Até <b>3 energias principais restantes</b> vão para a Reserva. Depois, o adversário inicia sua Manutenção.</p>
      <ul><li>Você vence ao reduzir a vida do herói inimigo a 0.</li><li>Um jogador também perde ao iniciar a Manutenção sem carta para comprar ou ao se render.</li></ul>
    </Chapter>
  </div>;
}

function BoardTab() {
  const zones = [
    ["Herói", "Sua vida, nível, progresso de evolução e habilidades. Chegar a 0 de vida causa derrota."],
    ["Criaturas", "Cinco espaços de combate. Criaturas atacam, bloqueiam e mantêm dano até a próxima Manutenção do controlador."],
    ["Auxiliares", "Cinco espaços alinhados às criaturas. Artefatos normalmente exigem uma criatura diretamente acima."],
    ["Terreno Cruel", "Uma zona de Terreno por jogador. Um novo Terreno substitui o anterior."],
    ["Deck Principal", "Fonte normal de compras. Começa com 49 cartas válidas para o herói."],
    ["Deck Extra", "Reserva de Imagens criadas ou invocadas por efeitos; não é comprada normalmente."],
    ["Cemitério", "Cartas destruídas, resolvidas ou descartadas. Pode ser consultado durante a partida."],
    ["Obscuro", "Zona de banimento. Cartas enviadas para lá não estão no Cemitério."],
  ];
  return <div className="tutorial-reference"><BoardVisual/><section className="tutorial-reference-grid">{zones.map(([title, text]) => <article key={title}><i>◇</i><h3>{title}</h3><p>{text}</p></article>)}</section></div>;
}

function CommandsTab() {
  const commands = [
    ["Hover por 1s", "Abre o preview compacto. Sair da carta cancela o temporizador."],
    ["Pressionar por 1s", "Mostra a descrição completa. O círculo central acompanha o progresso."],
    ["Arrastar", "Joga uma carta da mão ou reposiciona quando uma regra autorizar. O movimento cancela a inspeção."],
    ["Clique em alvo", "Durante combate ou efeito, escolha somente elementos destacados como válidos."],
    ["Ícone ⚡", "Ativa a habilidade de uma constante quando custos, condições e limite de uso permitem."],
    ["Botão de etapa", "Avança Principal → Combate → Finalização → próximo turno quando não há decisão pendente."],
    ["Responder / Passar", "Adiciona uma resposta legal à pilha ou devolve a prioridade ao outro jogador."],
    ["Registro", "Abre o histórico de ações, dano, compras, efeitos e mudanças de etapa."],
  ];
  return <div className="tutorial-reference"><CommandVisual/><section className="tutorial-command-grid">{commands.map(([title, text], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</section></div>;
}

function CombatTab() {
  return <div className="tutorial-reference"><CombatVisual/><div className="combat-guide-grid">
    <article><span>1</span><h3>Declare</h3><p>Na etapa de Combate, clique em uma criatura pronta, sem Enjoo, Atordoado ou Imobilizado impeditivo.</p></article>
    <article><span>2</span><h3>Responda</h3><p>Se uma janela abrir, os jogadores alternam prioridade com Acelerados e habilidades permitidas.</p></article>
    <article><span>3</span><h3>Defenda</h3><p>O defensor escolhe um bloqueador legal ou “Não bloquear”. Voar e Furtivo restringem essa escolha.</p></article>
    <article><span>4</span><h3>Resolva</h3><p>Sem Veloz, dano de atacante e defensor é simultâneo. Dano letal destrói; Indestrutível resiste à destruição.</p></article>
    <article><span>5</span><h3>Continue</h3><p>Declare outro ataque apto ou encerre. Uma criatura Indomável apta precisa atacar antes do fim do Combate.</p></article>
  </div><aside className="tutorial-rule-note"><b>Dano direto</b><span>Sem bloqueador, a Ofensividade do atacante reduz a vida do herói defensor. Atropelar também pode levar excesso de dano ao herói.</span></aside></div>;
}

function MechanicsTab() {
  const mechanics = [
    ["Criatura", "Entra no campo de criaturas, combate e possui Ofensividade/Vitalidade."],
    ["Feitiço", "Resolve seu efeito e normalmente vai ao Cemitério. Acelerado pode responder."],
    ["Artefato", "Constante auxiliar normalmente ligada à criatura na mesma coluna."],
    ["Encanto", "Constante auxiliar com efeito contínuo ou ativável."],
    ["Terreno", "Constante da zona de Terreno Cruel; apenas um por jogador."],
    ["Imagem", "Carta do Deck Extra criada por efeito; ao sair, segue regras próprias de Imagem."],
    ["Primeiro Ato", "Dispara quando a carta entra em campo."],
    ["Último Suspiro", "Dispara quando a carta é destruída."],
    ["Fura-Fila", "Ativa se você já jogou outra carta antes dela no turno."],
    ["Evolução", "Cumpra os marcos do herói para liberar níveis e habilidades."],
  ];
  return <div className="tutorial-reference"><ResourceVisual/><section className="tutorial-mechanics-grid">{mechanics.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</section><aside className="tutorial-rule-note"><b>Energia e Reserva</b><span>Energia principal recarrega na Manutenção. A Reserva guarda até 3 e é essencial para respostas; custos específicos podem usar vida, marcadores, virar ou sacrificar cartas.</span></aside></div>;
}

export function TutorialScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<TutorialTab>("flow");
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  return <section className="tutorial-screen">
    <header className="tutorial-hero"><button type="button" onClick={onBack}>← Menu</button><div><p>ACADEMIA DE HEMSFELL</p><h1>Aprenda a jogar</h1><span>Um guia visual do primeiro mulligan ao golpe final.</span></div><strong>?</strong></header>
    <nav className="tutorial-tabs" role="tablist" aria-label="Seções do tutorial">{TABS.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls="tutorial-panel" className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)} key={tab.id}><b>{tab.label}</b><span>{tab.description}</span></button>)}</nav>
    <main id="tutorial-panel" className="tutorial-panel" role="tabpanel" tabIndex={0} aria-label={active.label}>
      {activeTab === "flow" ? <FlowTab/> : activeTab === "board" ? <BoardTab/> : activeTab === "commands" ? <CommandsTab/> : activeTab === "combat" ? <CombatTab/> : <MechanicsTab/>}
    </main>
  </section>;
}
