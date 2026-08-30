import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, layout, tutorial, tutorialContent, css] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/tutorial/tutorial-screen.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/data/content/tutorial-content.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/tutorial.css", import.meta.url), "utf8"),
]);
const tutorialSource = `${tutorial}\n${tutorialContent}`;

test("tutorial is reachable from the main menu and uses the presentation layer", () => {
  assert.match(page, /type Screen=[^;]*"tutorial"/);
  assert.match(page, /setScreen\("tutorial"\)/);
  assert.match(page, /screen==="tutorial"&&<TutorialScreen/);
  assert.match(page, /from "\.\/presentation\/tutorial"/);
  assert.match(layout, /presentation\/styles\/tutorial\.css/);
});

test("tutorial separates the guided learning path from the searchable glossary", () => {
  assert.match(tutorialContent, /TutorialViewId = "guide" \| "glossary"/);
  for (const label of ["Como jogar", "Glossário", "Seu primeiro duelo", "Leia uma carta", "Conheça o campo", "Jogue seu turno", "Entre em combate"]) {
    assert.match(tutorialContent, new RegExp(label));
  }
  assert.equal((tutorialContent.match(/id: "(?:first-duel|cards|board|turn|combat)"/g) || []).length, 5);
  assert.match(tutorial, /tutorial-chapter-rail/);
  assert.match(tutorial, /tutorial-lesson-nav/);
});

test("guided path teaches objective, cards, board, turn and core controls", () => {
  for (const topic of ["Vida do Herói rival a 0", "Custo", "Ofensividade", "Vitalidade", "Tipo e subtipo", "Nome e descrição", "Manutenção", "Principal", "Combate", "Finalização", "Energia", "Reserva"]) {
    assert.match(tutorialSource, new RegExp(topic, "i"));
  }
  for (const command of ["Hover por 1s", "Segurar por 1s", "Arrastar", "Clique", "Habilidade", "Passar"]) {
    assert.match(tutorialContent, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("tutorial uses real cards only where they teach a board concept", () => {
  assert.match(tutorial, /function TutorialCard[\s\S]*<RemoteCardArt/);
  assert.match(tutorial, /<BoardVisual\/>/);
  assert.match(tutorial, /<CombatVisual\/>/);
  assert.match(tutorial, /Gimble, Presenteado Sortudo/);
  assert.match(tutorial, /CARD_ANATOMY/);
  assert.doesNotMatch(tutorial, /PriorityVisual|GameModesVisual|ControlModesVisual/);
});

test("card anatomy markers and empty board zones match the actual interface", () => {
  const anatomy = tutorialContent.slice(tutorialContent.indexOf("export const CARD_ANATOMY"), tutorialContent.indexOf("export const TURN_STEPS"));
  assert.equal((anatomy.match(/badge: "[1-5]"/g) || []).length, 5);
  for (const marker of ["1", "2", "3", "4", "5"]) assert.match(css, new RegExp(`data-marker=\\"${marker}\\"`));
  assert.match(anatomy, /faixa final, abaixo da descrição/);
  assert.match(css, /data-marker="4"\]\{--marker-x:50%;--marker-y:97%/);
  assert.match(tutorial, /Representação do tabuleiro vazio do jogo/);
  for (const section of ["tutorial-board-heroes", "tutorial-board-terrains", "tutorial-board-rows", "tutorial-board-side-piles", "tutorial-board-hand", "tutorial-board-resource"]) assert.match(tutorial, new RegExp(section));
  assert.equal((tutorial.match(/tutorial-field-zone /g) || []).length, 4);
  assert.match(tutorial, /<b>3<\/b><i\/><small>TERRENO/);
  assert.match(tutorial, /<b>6<\/b><i\/><small>TERRENO/);
  assert.match(tutorial, /Criaturas e Imagens de Criatura/);
  assert.match(tutorial, /Encantos, Artefatos e Imagens auxiliares/);
  assert.doesNotMatch(tutorial, /Vença o duelo, não o manual|SUA JORNADA/);
});

test("glossary header is concise and isolated from the search controls", () => {
  assert.match(tutorial, /<h2 id="tutorial-glossary-title">Glossário<\/h2>/);
  assert.match(tutorial, /<p>Consulte regras e palavras-chave\.<\/p>/);
  assert.doesNotMatch(tutorial, /REFERÊNCIA RÁPIDA|PRIMEIROS TERMOS|Glossário de Hemsfell|Vocabulário para a primeira partida/);
  assert.match(css, /\.tutorial-glossary-heading\{display:grid/);
});

test("combat tutorial matches the current one-attacker flow", () => {
  assert.match(tutorial, /Ataque com uma criatura por vez/);
  assert.match(tutorialContent, /1\. Escolha quem ataca/);
  assert.match(tutorialContent, /2\. Responda/);
  assert.match(tutorialContent, /3\. Defenda/);
  assert.match(tutorialContent, /4\. Resolva o dano/);
  assert.match(tutorialContent, /bloqueador legal ou aceita o ataque sem bloqueio/i);
  assert.doesNotMatch(tutorialSource, /atacantes e bloqueadores são confirmados como grupos/i);
});

test("guide and complete searchable glossary derive from the canonical glossary", () => {
  assert.match(tutorialContent, /import \{[\s\S]*GAME_GLOSSARY/);
  assert.match(tutorialContent, /GAME_GLOSSARY\[key\]/);
  for (const keyword of ["Acelerado", "Primeiro Ato", "Último Suspiro", "Enjoo de Invocação", "Voar", "Veloz", "Atropelar", "Sufocado"]) {
    assert.match(tutorialContent, new RegExp(`keyword\\("${keyword}"`));
  }
  assert.match(tutorialContent, /Object\.entries\(GAME_GLOSSARY\)/);
  assert.match(tutorial, /type="search"/);
  assert.match(tutorial, /entryMatchesRange/);
  assert.match(tutorialContent, /#–D/);
});

test("tutorial stays responsive, keyboard navigable and reduced-motion safe", () => {
  assert.match(tutorial, /ArrowLeft/);
  assert.match(tutorial, /ArrowRight/);
  assert.match(tutorial, /aria-labelledby=\{\`tutorial-view-/);
  assert.match(tutorial, /aria-current=\{activeChapter/);
  assert.match(css, /\.tutorial-chapter-rail\{position:sticky/);
  assert.match(css, /@media\(max-width:48rem\)/);
  assert.match(css, /@media\(max-width:34rem\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
