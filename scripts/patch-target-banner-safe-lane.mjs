import fs from "node:fs";

const guardPath = "app/match-ui-guard.tsx";
let guard = fs.readFileSync(guardPath, "utf8");

const marker = "export default function MatchUiGuard() {";
const helper = `function layoutTargetBannerInSafeLane() {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
  const banner = board?.querySelector<HTMLElement>(":scope > .target-banner");
  if (!board || !banner) return;

  const boardRect = board.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height) return;

  const commandBars = Array.from(board.querySelectorAll<HTMLElement>(":scope > .hero-command-bar"))
    .filter((node) => node.getClientRects().length > 0)
    .map((node) => node.getBoundingClientRect());
  const creatureSlots = Array.from(board.querySelectorAll<HTMLElement>(".paired-field .creature-slot"))
    .filter((node) => node.getClientRects().length > 0)
    .map((node) => node.getBoundingClientRect());
  const terrains = Array.from(board.querySelectorAll<HTMLElement>(":scope > .terrain-slot"))
    .filter((node) => node.getClientRects().length > 0)
    .map((node) => node.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);

  if (!commandBars.length || !creatureSlots.length || terrains.length < 2) return;

  // Horizontal safe lane: begins immediately after the command bars and ends
  // at the outer edge of the creature-space group. Because this lives in the
  // center row, it never covers the creature cards themselves.
  const leftPx = Math.max(...commandBars.map((rect) => rect.right));
  const rightPx = Math.max(...creatureSlots.map((rect) => rect.right));

  // Vertical safe lane: exactly the free interval between both Cruel Terrains.
  const topPx = terrains[0].bottom;
  const bottomPx = terrains[terrains.length - 1].top;

  const clampPct = (value: number) => Math.max(0, Math.min(100, value));
  const left = clampPct(((leftPx - boardRect.left) / boardRect.width) * 100);
  const right = clampPct(((rightPx - boardRect.left) / boardRect.width) * 100);
  const top = clampPct(((topPx - boardRect.top) / boardRect.height) * 100);
  const bottom = clampPct(((bottomPx - boardRect.top) / boardRect.height) * 100);

  if (right <= left || bottom <= top) return;
  banner.style.setProperty("--target-safe-left", left.toFixed(3) + "%");
  banner.style.setProperty("--target-safe-right", right.toFixed(3) + "%");
  banner.style.setProperty("--target-safe-top", top.toFixed(3) + "%");
  banner.style.setProperty("--target-safe-bottom", bottom.toFixed(3) + "%");
  banner.dataset.safeLaneMeasured = "true";
}

`;

if (!guard.includes("function layoutTargetBannerInSafeLane()")) {
  if (!guard.includes(marker)) throw new Error("MatchUiGuard marker not found");
  guard = guard.replace(marker, helper + marker);
}

const syncNeedle = "      enhanceMatchResult();\n";
if (!guard.includes("      layoutTargetBannerInSafeLane();")) {
  if (!guard.includes(syncNeedle)) throw new Error("sync insertion point not found");
  guard = guard.replace(syncNeedle, syncNeedle + "      layoutTargetBannerInSafeLane();\n");
}

const listenerNeedle = "    document.addEventListener(\"change\", onChange, true);\n";
if (!guard.includes("window.addEventListener(\"resize\", scheduleSync);")) {
  if (!guard.includes(listenerNeedle)) throw new Error("listener insertion point not found");
  guard = guard.replace(listenerNeedle, listenerNeedle + "    window.addEventListener(\"resize\", scheduleSync);\n");
}

const cleanupNeedle = "      document.removeEventListener(\"change\", onChange, true);\n";
if (!guard.includes("window.removeEventListener(\"resize\", scheduleSync);")) {
  if (!guard.includes(cleanupNeedle)) throw new Error("cleanup insertion point not found");
  guard = guard.replace(cleanupNeedle, cleanupNeedle + "      window.removeEventListener(\"resize\", scheduleSync);\n");
}

fs.writeFileSync(guardPath, guard);

const cssPath = "app/ui-overrides.css";
let css = fs.readFileSync(cssPath, "utf8");
const block = `

/* Targeting banner: exact responsive safe lane between command bars / creature
   spaces horizontally and both Cruel Terrains vertically. Geometry is measured
   from the rendered board and exposed as relative percentages by MatchUiGuard. */
.screen-game .game-content.hs-board > .target-banner[data-safe-lane-measured="true"] {
  position: absolute !important;
  left: var(--target-safe-left) !important;
  right: auto !important;
  top: var(--target-safe-top) !important;
  bottom: auto !important;
  width: calc(var(--target-safe-right) - var(--target-safe-left)) !important;
  height: calc(var(--target-safe-bottom) - var(--target-safe-top)) !important;
  min-width: 0 !important;
  max-width: none !important;
  min-height: 0 !important;
  max-height: none !important;
  box-sizing: border-box !important;
  transform: none !important;
  margin: 0 !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  align-items: center !important;
  gap: clamp(.3rem,.65cqw,.6rem) !important;
  padding: clamp(.24rem,.5cqh,.42rem) clamp(.42rem,.72cqw,.68rem) !important;
  overflow: visible !important;
  z-index: 760 !important;
}
.screen-game .game-content.hs-board > .target-banner[data-safe-lane-measured="true"] > :is(b,span) {
  min-width: 0 !important;
  margin: 0 !important;
  align-self: center !important;
}
.screen-game .game-content.hs-board > .target-banner[data-safe-lane-measured="true"] > button {
  justify-self: end !important;
  align-self: center !important;
  margin: 0 !important;
}
`;
if (!css.includes("Targeting banner: exact responsive safe lane")) css += block;
fs.writeFileSync(cssPath, css);

const testPath = "tests/target-banner-safe-lane-regression.test.mjs";
fs.writeFileSync(testPath, `import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\ntest("target banner uses measured relative safe-lane geometry", () => {\n  const guard = fs.readFileSync(new URL("../app/match-ui-guard.tsx", import.meta.url), "utf8");\n  const css = fs.readFileSync(new URL("../app/ui-overrides.css", import.meta.url), "utf8");\n  assert.match(guard, /function layoutTargetBannerInSafeLane\\(\\)/);\n  assert.match(guard, /hero-command-bar/);\n  assert.match(guard, /paired-field \\.creature-slot/);\n  assert.match(guard, /:scope > \\.terrain-slot/);\n  assert.match(guard, /--target-safe-left/);\n  assert.match(guard, /--target-safe-bottom/);\n  assert.match(css, /target-banner\\[data-safe-lane-measured="true"\\]/);\n  assert.match(css, /width: calc\\(var\\(--target-safe-right\\) - var\\(--target-safe-left\\)\\)/);\n  assert.match(css, /height: calc\\(var\\(--target-safe-bottom\\) - var\\(--target-safe-top\\)\\)/);\n});\n`);
