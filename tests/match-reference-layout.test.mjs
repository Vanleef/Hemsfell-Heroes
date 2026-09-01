import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, page, css, heroCss] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/match-reference.css", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-reference.css", import.meta.url), "utf8"),
]);
const terminalAuthorityMarker = "Symmetric energy axis and complete hero-panel composition";
const terminalAuthorityIndex = css.lastIndexOf(terminalAuthorityMarker);
const terminalCss = css.slice(terminalAuthorityIndex);

test("the match composition has one responsive stylesheet authority", () => {
  assert.match(layout, /import "\.\/presentation\/styles\/match-reference\.css"/);
  assert.match(layout, /match-reference\.css";[\s\S]*?hero-panel-reference\.css";/);
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
  assert.match(heroCss, /--hero-card-level-top:\s*calc\(var\(--hero-card-art-top\) \+ var\(--hero-card-art-height\) \+ var\(--hero-card-level-gap\)\)/);
  assert.match(heroCss, /--hero-card-abilities-top:\s*calc\(var\(--hero-card-level-top\) \+ var\(--hero-card-level-height\) \+ var\(--hero-card-section-gap\)\)/);
  assert.match(heroCss, /player-hero > \.hero-level-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 35%\) minmax\(0, 1fr\)/);
  assert.match(heroCss, /canonical-hero-panel > \.hero-command-bar\s*\{[\s\S]*?grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(heroCss, /player-hero:not\(\.enemy\) > \.level-button\s*\{[\s\S]*?bottom:\s*\.72cqh[\s\S]*?z-index:\s*30/);
});

test("the progression badge and all three independent ability chips defeat legacy list styling", () => {
  assert.match(heroCss, /hero-level-row > \.hero-evolution\s*\{[\s\S]*?display:\s*grid\s*!important[\s\S]*?border:[\s\S]*?opacity:\s*1\s*!important[\s\S]*?visibility:\s*visible\s*!important/);
  assert.match(heroCss, /hero-evolution > \.evolution-track\s*\{[\s\S]*?display:\s*block\s*!important[\s\S]*?visibility:\s*visible\s*!important/);
  assert.match(heroCss, /canonical-hero-panel > \.hero-command-bar\s*\{[\s\S]*?grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)[\s\S]*?gap:\s*\.68cqh\s*!important[\s\S]*?border:\s*0\s*!important[\s\S]*?background:\s*transparent\s*!important/);
  assert.match(heroCss, /hero-command-bar > \.hero-ability-chip\s*\{[\s\S]*?display:\s*grid\s*!important[\s\S]*?border:[\s\S]*?border-radius:[\s\S]*?background:\s*linear-gradient/);
  assert.match(heroCss, /hero-ability-chip\.is-locked\s*\{[\s\S]*?opacity:\s*\.5\s*!important/);
  assert.match(heroCss, /hero-ability-chip > \.hero-ability-copy\s*\{[\s\S]*?grid-template-rows:\s*auto auto[\s\S]*?row-gap:\s*\.3cqh/);
});

test("each hero and its ability bar share an isolated responsive stack", () => {
  assert.match(page, /className="hero-panel-stack canonical-hero-panel enemy"[\s\S]*?<PlayerHero[\s\S]*?<HeroAbilities player=\{foe\} enemy/);
  assert.match(page, /className="hero-panel-stack canonical-hero-panel player"[\s\S]*?<PlayerHero[\s\S]*?<HeroAbilities player=\{me\}/);
  assert.match(css, /> \.hero-panel-stack\.enemy\s*\{[\s\S]*?grid-row:\s*2 \/ 4/);
  assert.match(css, /> \.hero-panel-stack\.player\s*\{[\s\S]*?grid-row:\s*5 \/ 7/);
  assert.match(heroCss, /hero-panel-stack\.canonical-hero-panel\s*\{[\s\S]*?isolation:\s*isolate/);
});

test("the canonical hero card follows the approved portrait metadata powers action model", () => {
  assert.match(page, /hero-power-trigger[\s\S]*?hero-short-name[\s\S]*?<HeroPortrait[\s\S]*?hero-life/);
  assert.match(page, /className="hero-level-row"[\s\S]*?className="hero-level"[\s\S]*?className="hero-evolution"/);
  assert.match(page, /hero-evolution-copy[\s\S]*?PRÓX\. NÍVEL[\s\S]*?evolution-track/);
  assert.match(page, /hero-ability-slot[\s\S]*?hero-ability-copy[\s\S]*?ATIVA[\s\S]*?PASSIVA/);
  const abilitiesSource = page.slice(page.indexOf("function HeroAbilities"), page.indexOf("function ResourceSummary"));
  assert.doesNotMatch(abilitiesSource, /<header>/);
});

test("hero hover can never hide the canonical in-card ability list", () => {
  assert.match(heroCss, /canonical-hero-panel > \.hero-command-bar\s*\{[\s\S]*?opacity:\s*1\s*!important[\s\S]*?visibility:\s*visible\s*!important/);
  assert.match(page, /stateClass=locked\?"is-locked":active\?\(clickable\?"is-active is-available":"is-active is-unavailable"\):"is-passive"/);
});

test("long power text compacts in-card and expands into an accessible tooltip", () => {
  const modelCss = css.slice(css.lastIndexOf("Canonical hero card — measured from the approved Gimble reference"));
  assert.match(page, /data-ability-tooltip=\{abilityTooltip\}/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(heroCss, /hero-ability-chip\.copy-compact \.hero-ability-copy > p\s*\{[\s\S]*?-webkit-line-clamp:\s*unset[\s\S]*?font-size:/);
  assert.match(heroCss, /hero-ability-chip\.copy-dense \.hero-ability-copy > p\s*\{[\s\S]*?-webkit-line-clamp:\s*unset[\s\S]*?font-size:/);
  assert.match(heroCss, /hero-ability-copy > p[\s\S]*?white-space:\s*normal[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?text-wrap:\s*pretty/);
  assert.match(modelCss, /hero-ability-chip::after\s*\{[\s\S]*?content:\s*attr\(data-ability-tooltip\)[\s\S]*?width:\s*clamp\(14rem, 21cqw, 24rem\)/);
  assert.match(modelCss, /hero-ability-chip:is\(:hover, :focus-visible\)::after\s*\{[\s\S]*?opacity:\s*1/);
});

test("player power tooltips open upward above the hand and remain readable", () => {
  const modelCss = css.slice(css.lastIndexOf("Canonical hero card — measured from the approved Gimble reference"));
  assert.match(modelCss, /hero-panel-stack:is\(:hover, :focus-within\)\s*\{[\s\S]*?z-index:\s*9950/);
  assert.match(modelCss, /hero-ability-chip:is\(:hover, :focus-visible\)::after\s*\{[\s\S]*?pointer-events:\s*auto/);
  assert.match(modelCss, /hero-panel-stack\.player > \.hero-command-bar > \.hero-ability-chip::after,[\s\S]*?first-of-type::after\s*\{[\s\S]*?top:\s*auto[\s\S]*?bottom:\s*0/);
  assert.match(modelCss, /hero-panel-stack\.player[\s\S]*?hero-ability-chip:is\(:hover, :focus-visible\)::after,[\s\S]*?transform:\s*translate\(0, 0\)/);
});

test("hero life metadata and ability indices follow the reference alignment", () => {
  assert.match(heroCss, /hero-power-trigger > \.hero-life\s*\{[\s\S]*?right:\s*\.46cqw[\s\S]*?bottom:\s*\.62cqh/);
  assert.match(heroCss, /hero-level-row > \.hero-level\s*\{[\s\S]*?position:\s*static[\s\S]*?white-space:\s*nowrap/);
  assert.match(heroCss, /hero-ability-chip > \.hero-ability-slot\s*\{[\s\S]*?align-self:\s*center[\s\S]*?justify-self:\s*center/);
  assert.match(heroCss, /max-height: 32rem\)[\s\S]*?canonical-hero-panel\s*\{[\s\S]*?width:\s*min\(18\.4cqw, 31\.7cqh\)/);
});

test("evolution criteria and terrain ownership remain explicit", () => {
  const modelCss = css.slice(css.lastIndexOf("Canonical hero card — measured from the approved Gimble reference"));
  assert.match(modelCss, /hero-evolution > \.evolution-tooltip\s*\{[\s\S]*?width:\s*clamp\(16rem, 24cqw, 27rem\)/);
  assert.match(modelCss, /hero-evolution:is\(:hover, :focus-within\) > \.evolution-tooltip\s*\{[\s\S]*?opacity:\s*1[\s\S]*?visibility:\s*visible/);
  assert.match(modelCss, /terrain-slot\.enemy-terrain\s*\{[\s\S]*?border-color:\s*#79504f/);
  assert.match(modelCss, /terrain-slot\.player-terrain\s*\{[\s\S]*?border-color:\s*#466b76/);
});

test("every empty-slot glyph inherits the muted palette of its owner", () => {
  const modelCss = css.slice(css.lastIndexOf("Canonical hero card — measured from the approved Gimble reference"));
  assert.match(modelCss, /\.slot-type-icon\s*\{[\s\S]*?background-image:\s*none\s*!important/);
  assert.match(modelCss, /> \.enemy-field \.slot-type-icon,[\s\S]*?enemy-terrain > \.terrain-type-icon\s*\{[\s\S]*?color:\s*#a76b67/);
  assert.match(modelCss, /> \.player-field \.slot-type-icon,[\s\S]*?player-terrain > \.terrain-type-icon\s*\{[\s\S]*?color:\s*#6f9eaa/);
  assert.match(modelCss, /:is\(\.enemy-field, \.player-field\) span\.slot-type-icon::before\s*\{[\s\S]*?background:\s*currentColor/);
  assert.match(modelCss, /\.slot-type-icon > path:not\(\.slot-icon-cut\)\s*\{[\s\S]*?fill:\s*currentColor/);
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
