import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, layout, tutorial, tutorialContent, css] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/tutorial/tutorial-screen.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/data/content/tutorial-content.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/tutorial.css", import.meta.url), "utf8"),
]);

test("tutorial is reachable from the main menu and shell navigation", () => {
  assert.match(page, /type Screen=[^;]*"tutorial"/);
  assert.match(page, /setScreen\("tutorial"\)/);
  assert.match(page, /screen==="tutorial"&&<TutorialScreen/);
  assert.match(layout, /import "\.\/tutorial\.css"/);
});

test("tutorial covers the full match flow in focused tabs", () => {
  for (const label of ["Fluxo completo", "Tabuleiro", "Comandos", "Combate", "Mecânicas"]) {
    assert.match(tutorial, new RegExp(label));
  }
  for (const topic of ["Manutenção", "Principal", "Combate", "Finalização", "mulligan", "Energia", "Reserva", "prioridade", "vida do herói inimigo a 0"]) {
    assert.match(tutorial, new RegExp(topic, "i"));
  }
  assert.match(tutorial, /Hover · 1s/);
  assert.match(tutorial, /Segure · 1s/);
  assert.match(tutorial, /Arraste/);
});

test("each flow chapter has an illustrated game visual with real card art", () => {
  assert.match(tutorial, /function TutorialCard[\s\S]*<RemoteCardArt/);
  assert.match(tutorial, /<Chapter number="01"[\s\S]*<Chapter number="07"/);
  assert.match(tutorial, /<SetupVisual\/>/);
  assert.match(tutorial, /<BoardVisual\/>/);
  assert.match(tutorial, /<CommandVisual\/>/);
  assert.match(tutorial, /<CombatVisual\/>/);
  assert.match(tutorial, /<PriorityVisual\/>/);
  assert.match(tutorial, /<VictoryVisual\/>/);
  assert.doesNotMatch(tutorial, /<RemoteCardArt[^>]*priority/);
});

test("tutorial layout remains usable on tablet and mobile", () => {
  assert.match(css, /\.tutorial-tabs\s*\{[\s\S]*position:sticky/);
  assert.match(css, /@media\(max-width:48rem\)/);
  assert.match(css, /\.tutorial-tabs\{grid-template-columns:repeat\(5,max-content\);overflow-x:auto\}/);
  assert.match(css, /\.tutorial-chapter,[^{]*\{grid-template-columns:1fr\}/);
});

test("tutorial explains priority controls, game modes and top-only LIFO resolution", () => {
  assert.match(tutorial, /Modo: Assistido/);
  assert.match(tutorial, /Modo: Manual/);
  assert.match(tutorial, /FULL CONTROL · NUNCA AUTO-PASSA/);
  assert.match(tutorial, /Dois passes resolvem somente o item do topo/);
  assert.match(tutorial, /VS IA/);
  assert.match(tutorial, /ONLINE 1×1/);
  assert.match(tutorial, /Servidor autoritativo/);
});

test("tutorial keyword copy is derived from the canonical game glossary", () => {
  assert.match(tutorialContent, /import \{ GAME_GLOSSARY/);
  assert.match(tutorialContent, /GAME_GLOSSARY\[key\]/);
  for (const keyword of ["Acelerado", "Primeiro Ato", "Último Suspiro", "Enjoo de Invocação", "Voar", "Veloz", "Atropelar", "Sufocado"]) {
    assert.match(tutorialContent, new RegExp(`keyword\\("${keyword}"`));
  }
});

test("tutorial tabs support keyboard navigation and reduced motion", () => {
  assert.match(tutorial, /ArrowLeft/);
  assert.match(tutorial, /ArrowRight/);
  assert.match(tutorial, /aria-labelledby=\{`tutorial-tab-/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
