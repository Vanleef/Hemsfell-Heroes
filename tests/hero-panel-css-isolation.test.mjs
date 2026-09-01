import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, heroCss] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-reference.css", import.meta.url), "utf8"),
]);

const boardScope = String.raw`html body \.screen-game\.screen-game \.game-stage > \.game-content\.hs-board > \.hero-panel-stack\.canonical-hero-panel`;

test("canonical hero styling is imported after the shared match layout", () => {
  assert.match(layout, /match-reference\.css";[\s\S]*hero-panel-reference\.css";/);
});

test("canonical ability layout uses the full board path to outrank legacy important rules", () => {
  assert.match(heroCss, new RegExp(`${boardScope} > \\.hero-command-bar\\s*\\{[\\s\\S]*grid-template-rows:\\s*repeat\\(3, minmax\\(0, 1fr\\)\\)`));
  assert.match(heroCss, new RegExp(`${boardScope} > \\.hero-command-bar > \\.hero-ability-chip\\s*\\{[\\s\\S]*display:\\s*grid\\s*!important`));
  assert.match(heroCss, new RegExp(`${boardScope} > \\.hero-command-bar > \\.hero-ability-chip > \\.hero-ability-copy\\s*\\{[\\s\\S]*grid-template-columns:\\s*max-content minmax\\(0, 1fr\\)`));
});

test("legacy list decoration and transformed ability indices are explicitly neutralized", () => {
  assert.match(heroCss, /hero-ability-chip::before\s*\{[\s\S]*content:\s*none\s*!important[\s\S]*display:\s*none\s*!important/);
  assert.match(heroCss, /hero-ability-chip > \.hero-ability-slot\s*\{[\s\S]*border-radius:\s*50%\s*!important[\s\S]*transform:\s*none\s*!important/);
});

test("each ability row has explicit icon, semantic label and description geometry", () => {
  assert.match(heroCss, /hero-ability-copy > b\s*\{[\s\S]*white-space:\s*nowrap\s*!important[\s\S]*border-radius:/);
  assert.match(heroCss, /hero-ability-copy > p,[\s\S]*copy-normal \.hero-ability-copy > p\s*\{[\s\S]*white-space:\s*normal\s*!important[\s\S]*-webkit-line-clamp:\s*unset\s*!important/);
});
