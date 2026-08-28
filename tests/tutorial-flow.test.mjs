import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, layout, tutorial, css] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/tutorial-screen.tsx", import.meta.url), "utf8"),
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
