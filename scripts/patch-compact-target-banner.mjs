// one-shot patch runner: compact target banner
import fs from 'node:fs';

const guardPath = 'app/match-ui-guard.tsx';
const cssPath = 'app/ui-overrides.css';
const testPath = 'tests/target-banner-safe-lane-regression.test.mjs';

let guard = fs.readFileSync(guardPath, 'utf8');
const guardNeedle = `  banner.style.setProperty("--target-safe-left", left.toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-right", right.toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-top", top.toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-bottom", bottom.toFixed(3) + "%");`;
const guardReplacement = `  banner.style.setProperty("--target-safe-left", left.toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-right", right.toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-top", top.toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-bottom", bottom.toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-center-x", ((left + right) / 2).toFixed(3) + "%");\n  banner.style.setProperty("--target-safe-center-y", ((top + bottom) / 2).toFixed(3) + "%");`;
if (!guard.includes(guardNeedle)) throw new Error('target banner guard anchor not found');
guard = guard.replace(guardNeedle, guardReplacement);
fs.writeFileSync(guardPath, guard);

let css = fs.readFileSync(cssPath, 'utf8');
const start = css.indexOf('/* Targeting banner: exact responsive safe lane');
const end = css.indexOf('/* Hand-limit picker:', start);
if (start < 0 || end < 0) throw new Error('target banner CSS block not found');
const compactBlock = `/* Targeting banner: compact content-sized prompt centered inside the measured\n   safe lane. The safe lane constrains placement; it must not dictate panel size. */\n.screen-game .game-content.hs-board > .target-banner[data-safe-lane-measured="true"] {\n  position: absolute !important;\n  left: var(--target-safe-center-x) !important;\n  top: var(--target-safe-center-y) !important;\n  right: auto !important;\n  bottom: auto !important;\n  width: max-content !important;\n  height: auto !important;\n  min-width: 0 !important;\n  max-width: calc(var(--target-safe-right) - var(--target-safe-left)) !important;\n  min-height: 0 !important;\n  max-height: calc(var(--target-safe-bottom) - var(--target-safe-top)) !important;\n  box-sizing: border-box !important;\n  transform: translate(-50%, -50%) !important;\n  margin: 0 !important;\n  display: inline-grid !important;\n  grid-template-columns: minmax(0, auto) auto !important;\n  align-items: center !important;\n  justify-content: start !important;\n  gap: clamp(.4rem,.7cqw,.72rem) !important;\n  padding: clamp(.28rem,.48cqh,.4rem) clamp(.48rem,.76cqw,.72rem) !important;\n  overflow: visible !important;\n  z-index: 760 !important;\n}\n.screen-game .game-content.hs-board > .target-banner[data-safe-lane-measured="true"] > :is(b,span) {\n  min-width: 0 !important;\n  width: max-content !important;\n  max-width: min(28cqw, 32rem) !important;\n  margin: 0 !important;\n  align-self: center !important;\n  white-space: normal !important;\n}\n.screen-game .game-content.hs-board > .target-banner[data-safe-lane-measured="true"] > button {\n  justify-self: end !important;\n  align-self: center !important;\n  margin: 0 !important;\n  white-space: nowrap !important;\n}\n\n`;
css = css.slice(0, start) + compactBlock + css.slice(end);
fs.writeFileSync(cssPath, css);

const test = `import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\ntest("target banner stays compact while centered inside measured safe lane", () => {\n  const guard = fs.readFileSync(new URL("../app/match-ui-guard.tsx", import.meta.url), "utf8");\n  const css = fs.readFileSync(new URL("../app/ui-overrides.css", import.meta.url), "utf8");\n  assert.match(guard, /function layoutTargetBannerInSafeLane\\(\\)/);\n  assert.match(guard, /hero-command-bar/);\n  assert.match(guard, /paired-field \\.creature-slot/);\n  assert.match(guard, /:scope > \\.terrain-slot/);\n  assert.match(guard, /--target-safe-center-x/);\n  assert.match(guard, /--target-safe-center-y/);\n  assert.match(css, /target-banner\\[data-safe-lane-measured="true"\\]/);\n  assert.match(css, /width: max-content/);\n  assert.match(css, /height: auto/);\n  assert.match(css, /left: var\\(--target-safe-center-x\\)/);\n  assert.match(css, /top: var\\(--target-safe-center-y\\)/);\n  assert.match(css, /transform: translate\\(-50%, -50%\\)/);\n  assert.doesNotMatch(css, /width: calc\\(var\\(--target-safe-right\\) - var\\(--target-safe-left\\)\\) !important;\\n  height: calc/);\n});\n`;
fs.writeFileSync(testPath, test);
