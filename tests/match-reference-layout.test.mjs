import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, page, css] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/match-reference.css", import.meta.url), "utf8"),
]);
const terminalAuthorityMarker = "Symmetric energy axis and complete hero-panel composition";
const terminalAuthorityIndex = css.lastIndexOf(terminalAuthorityMarker);
const terminalCss = css.slice(terminalAuthorityIndex);

test("the match composition has one responsive stylesheet authority", () => {
  assert.match(layout, /import "\.\/presentation\/styles\/match-reference\.css"/);
  for (const legacy of [
    "reference-board-layout", "reference-layout", "final-responsive-layout",
    "mobile-landscape-pc-parity", "match-stability-polish",
    "desktop-reference-calibration", "reference-composition-parity",
    "reference-composition-polish", "reference-user-adjustments",
  ]) assert.doesNotMatch(layout, new RegExp(legacy));
});

test("the battlefield is mirrored around a real fifty-percent seam", () => {
  assert.match(css, /grid-template-rows:\s*5\.6fr 12\.4fr 29fr 6fr 29fr 18fr\s*!important/);
  assert.match(css, /game-content\.hs-board::after\s*\{[\s\S]*?top:\s*50cqh\s*!important/);
  assert.match(css, /> \.paired-field\s*\{[\s\S]*?grid-template-rows:\s*repeat\(2, max-content\)[\s\S]*?row-gap:\s*3\.8cqh/);
});

test("slot symbols and cards retain proportional responsive targets", () => {
  assert.match(css, /creature-type-icon::before[\s\S]*?crossed swords|creature = crossed swords/i);
  assert.match(css, /auxiliary-type-icon::before[\s\S]*?mystic eye|auxiliary = mystic eye/i);
  assert.match(css, /aspect-ratio:\s*5\s*\/\s*7\s*!important/);
  assert.match(css, /terrain-type-icon[\s\S]*?calc\(var\(--hh-polish-slot-w\) \* \.58\)/);
});

test("energy uses one circumference with capacity and current-energy orbs", () => {
  assert.match(css, /energy-dial:has\(\.energy-ring > i:not\(\.locked\)\)[\s\S]*?outline:\s*0[\s\S]*?box-shadow:\s*none/);
  assert.match(css, /energy-ring > i:not\(\.locked\)[\s\S]*?border:/);
  assert.match(css, /energy-ring > i\.filled[\s\S]*?background:/);
  assert.ok(terminalAuthorityIndex > 0, "the terminal responsive authority must exist");
  assert.match(terminalCss, /--hh-energy-axis-offset:\s*9\.6cqh/);
  assert.match(terminalCss, /> :is\(\.enemy-energy, \.player-energy\)[\s\S]*?margin-top:\s*var\(--hh-energy-axis-offset\)/);
  assert.match(terminalCss, /> \.player-energy\s*\{[\s\S]*?margin-top:\s*calc\(var\(--hh-energy-axis-offset\) \+ \.2cqh\)/);
  assert.match(terminalCss, /> \.phase-orb\s*\{[\s\S]*?align-self:\s*center[\s\S]*?translate:\s*0\s*!important/);
  assert.match(terminalCss, /energy-ring > i\s*\{[\s\S]*?width:\s*15%[\s\S]*?transform-origin:\s*50% 383%/);
  assert.match(terminalCss, /energy-dial > strong\s*\{[\s\S]*?flex-direction:\s*row/);
  assert.doesNotMatch(terminalCss, /player-energy[\s\S]*?margin-top:\s*(?:18\.5|19)cqh/);
});

test("hero panels reserve distinct portrait, progression, ability and evolve regions", () => {
  assert.match(terminalCss, /> \.player-hero\.enemy\s*\{[\s\S]*?height:\s*41\.5cqh/);
  assert.match(terminalCss, /> \.player-hero:not\(\.enemy\)\s*\{[\s\S]*?height:\s*46cqh/);
  assert.match(terminalCss, /> \.player-hero > \.hero-evolution\s*\{[\s\S]*?visibility:\s*visible[\s\S]*?z-index:\s*210/);
  assert.match(terminalCss, /hero-evolution > \.evolution-track\s*\{[\s\S]*?display:\s*block[\s\S]*?height:\s*\.72cqh/);
  assert.match(terminalCss, /:is\(\.hero-abilities, \.hero-command-bar\)[\s\S]*?margin-top:\s*var\(--hh-hero-abilities-top\)/);
  assert.match(terminalCss, /> \.player-hero:not\(\.enemy\) > \.level-button\s*\{[\s\S]*?bottom:\s*\.8cqh[\s\S]*?z-index:\s*220/);
  assert.doesNotMatch(terminalCss, /evolution-track\s*\{[\s\S]*?display:\s*none/);
});

test("each hero and its ability bar share an isolated responsive stack", () => {
  assert.match(page, /className="hero-panel-stack enemy"[\s\S]*?<PlayerHero[\s\S]*?<HeroAbilities player=\{foe\} enemy/);
  assert.match(page, /className="hero-panel-stack player"[\s\S]*?<PlayerHero[\s\S]*?<HeroAbilities player=\{me\}/);
  assert.match(css, /> \.hero-panel-stack\.enemy\s*\{[\s\S]*?grid-row:\s*2 \/ 4/);
  assert.match(css, /> \.hero-panel-stack\.player\s*\{[\s\S]*?grid-row:\s*5 \/ 7/);
  assert.match(css, /\.hero-panel-stack > \.hero-command-bar\s*\{[\s\S]*?position:\s*absolute[\s\S]*?inset:\s*23\.9cqh/);
});

test("the canonical hero card follows the approved portrait metadata powers action model", () => {
  const modelMarker = "Canonical hero card — measured from the approved Gimble reference";
  const modelCss = css.slice(css.lastIndexOf(modelMarker));
  assert.ok(modelCss.length > modelMarker.length, "the approved hero-card model must be terminal");
  assert.match(modelCss, /--hh-hero-art-height:\s*19\.2cqh/);
  assert.match(modelCss, /--hh-hero-meta-top:\s*19\.65cqh/);
  assert.match(modelCss, /--hh-hero-powers-top:\s*23\.9cqh/);
  assert.match(modelCss, /hero-short-name\s*\{[\s\S]*?place-items:\s*center[\s\S]*?font-weight:\s*900/);
  assert.match(modelCss, /hero-evolution\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) \.58cqh/);
  assert.match(modelCss, /hero-panel-stack > \.hero-command-bar\s*\{[\s\S]*?grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(modelCss, /hero-panel-stack\.player > \.hero-command-bar\s*\{[\s\S]*?4\.55cqh/);
  assert.match(modelCss, /level-button\s*\{[\s\S]*?clip-path:\s*polygon/);
});

test("the final reference removes the seam and gives each field an owner color", () => {
  assert.match(terminalCss, /game-content\.hs-board::after\s*\{[\s\S]*?content:\s*none[\s\S]*?display:\s*none/);
  assert.match(terminalCss, /enemy-field \.creature-slot[\s\S]*?enemy-terrain[\s\S]*?border-color:\s*#79504f/);
  assert.match(terminalCss, /player-field \.creature-slot[\s\S]*?player-terrain[\s\S]*?border-color:\s*#466b76/);
});

test("side piles use the enlarged terminal scale", () => {
  assert.match(terminalCss, /> \.side-piles\s*\{[\s\S]*?width:\s*min\(15\.6cqw, 27\.8cqh\)/);
  assert.match(terminalCss, /\.side-piles \.pile-card\s*\{\s*width:\s*82%/);
});

test("short landscape and mobile setup remain explicitly responsive", () => {
  assert.match(css, /@media \(orientation: landscape\) and \(max-width: 64rem\)/);
  assert.match(css, /@media \(max-width: 48rem\)[\s\S]*?\.match-setup\s*\{[\s\S]*?overflow-x:\s*clip/);
  assert.match(css, /\.match-setup > \.difficulty\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
