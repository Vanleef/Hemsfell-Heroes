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

test("tutorial is reachable from the main menu and uses the presentation style layer", () => {
  assert.match(page, /type Screen=[^;]*"tutorial"/);
  assert.match(page, /setScreen\("tutorial"\)/);
  assert.match(page, /screen==="tutorial"&&<TutorialScreen/);
  assert.match(layout, /presentation\/styles\/tutorial\.css/);
});

test("tutorial is intentionally reduced to three focused sections", () => {
  assert.match(tutorialContent, /TutorialTabId = "start" \| "combat" \| "reference"/);
  for (const label of ["Como jogar", "Combate", "Referência"]) assert.match(tutorialContent, new RegExp(label));
  assert.equal((tutorialContent.match(/id: "(?:start|combat|reference)"/g) || []).length, 3);
  assert.doesNotMatch(tutorialContent, /Fluxo completo|Mecânicas|Comandos", description/);
});

test("quick start teaches the four turn stages, core controls and win condition", () => {
  for (const topic of ["Manutenção", "Principal", "Combate", "Finalização", "Energia", "Reserva", "Vida do Herói rival a 0"]) {
    assert.match(tutorial, new RegExp(topic, "i"));
  }
  for (const command of ["Hover por 1s", "Segurar por 1s", "Arrastar", "Clique", "⚡", "Passar"]) {
    assert.match(tutorialContent, new RegExp(command.replace(/[⚡]/g, "\\$&")));
  }
});

test("tutorial keeps only useful real-card visuals instead of a visual for every paragraph", () => {
  assert.match(tutorial, /function TutorialCard[\s\S]*<RemoteCardArt/);
  assert.match(tutorial, /<BoardVisual\/>/);
  assert.match(tutorial, /<CombatVisual\/>/);
  assert.match(tutorial, /Gimble, Presenteado Sortudo/);
  assert.doesNotMatch(tutorial, /Chapter|PriorityVisual|GameModesVisual|ControlModesVisual/);
});

test("combat tutorial matches the current one-attacker flow", () => {
  assert.match(tutorial, /Ataque uma criatura por vez/);
  assert.match(tutorialContent, /1\. Escolha quem ataca/);
  assert.match(tutorialContent, /2\. Responda/);
  assert.match(tutorialContent, /3\. Defenda/);
  assert.match(tutorialContent, /4\. Resolva o dano/);
  assert.match(tutorial, /bloqueador legal ou aceita o ataque sem bloqueio/i);
  assert.doesNotMatch(tutorial, /atacantes e bloqueadores são confirmados como grupos/i);
});

test("tutorial keyword copy stays derived from the canonical glossary but shows a concise subset", () => {
  assert.match(tutorialContent, /import \{ GAME_GLOSSARY/);
  assert.match(tutorialContent, /GAME_GLOSSARY\[key\]/);
  for (const keyword of ["Acelerado", "Primeiro Ato", "Último Suspiro", "Enjoo de Invocação", "Voar", "Veloz", "Atropelar", "Sufocado"]) {
    assert.match(tutorialContent, new RegExp(`keyword\\("${keyword}"`));
  }
  assert.match(tutorialContent, /O tutorial mostra apenas o vocabulário mais frequente/);
});

test("tutorial stays responsive, keyboard navigable and reduced-motion safe", () => {
  assert.match(tutorial, /ArrowLeft/);
  assert.match(tutorial, /ArrowRight/);
  assert.match(tutorial, /aria-labelledby=\{`tutorial-tab-/);
  assert.match(css, /\.tutorial-tabs\{position:sticky/);
  assert.match(css, /@media\(max-width:54rem\)/);
  assert.match(css, /@media\(max-width:36rem\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
