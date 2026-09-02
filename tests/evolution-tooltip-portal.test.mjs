import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/evolution-tooltip-portal-runtime.tsx", "utf8");
const portalCss = fs.readFileSync("app/presentation/styles/evolution-tooltip-portal-final.css", "utf8");
const globalTooltipCss = fs.readFileSync("app/presentation/styles/global-tooltip-layer-final.css", "utf8");
const terrainRuntime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("evolution criteria uses browser Top Layer and is anchored to progress hover beside the hero", () => {
  assert.match(runtime, /PROGRESS_SURFACE_SELECTOR = "\.screen-game \.hero-evolution"/);
  assert.match(runtime, /SOURCE_SELECTOR/);
  assert.match(runtime, /document\.body\.appendChild\(nextPortal\)/);
  assert.match(runtime, /className = `ui-tooltip-portal evolution-tooltip \$\{PORTAL_CLASS\}`/);
  assert.match(runtime, /nextPortal\.setAttribute\("popover", "manual"\)/);
  assert.match(runtime, /nextPortal\.showPopover\?\.\(\)/);
  assert.match(runtime, /const suppressReactOwnedTooltips =/);
  assert.match(runtime, /style\.setProperty\("display", "none", "important"\)/);
  assert.match(runtime, /document\.addEventListener\("pointerover", onPointerOver, true\)/);
  assert.match(runtime, /document\.addEventListener\("pointerout", onPointerOut, true\)/);
  assert.match(runtime, /panelRect\.right \+ sideGap/);
  assert.match(runtime, /progressRect\.top \+ \(progressRect\.height - tooltipRect\.height\) \/ 2/);
  assert.match(runtime, /style\.setProperty\("left", `\$\{Math\.round\(left\)\}px`, "important"\)/);
  assert.match(runtime, /style\.setProperty\("top", `\$\{Math\.round\(top\)\}px`, "important"\)/);
  assert.match(portalCss, /evolution-tooltip:not\(\.evolution-tooltip-portal\)[^}]*display:\s*none\s*!important/);
  assert.match(portalCss, /body > \.evolution-tooltip-portal:popover-open/);
  assert.doesNotMatch(portalCss, /inset:\s*auto\s*!important/);
  assert.match(layout, /EvolutionTooltipPortalRuntime/);
  assert.match(layout, /evolution-tooltip-portal-final\.css/);
});

test("terminal tooltip authority keeps body portals above cards and overlays", () => {
  assert.match(globalTooltipCss, /--hemsfell-tooltip-layer:\s*2147483647/);
  assert.match(globalTooltipCss, /body > \[data-floating-ui-portal\]/);
  assert.match(globalTooltipCss, /body > \.ui-tooltip-portal/);
  const evolutionImport = layout.indexOf('import "./presentation/styles/evolution-tooltip-portal-final.css"');
  const globalImport = layout.indexOf('import "./presentation/styles/global-tooltip-layer-final.css"');
  assert.ok(evolutionImport >= 0 && globalImport > evolutionImport);
});

test("phase-orb uses a saturated orange fantasy medallion without an inset ring", () => {
  assert.match(portalCss, /-webkit-text-stroke:\s*\.55px #ffffff\s*!important/);
  assert.match(portalCss, /font-size:\s*clamp\(\.66rem, min\(\.96cqw, 1\.46cqh\), 1rem\)\s*!important/);
  assert.match(portalCss, /button:not\(:disabled\)[^}]*background:\s*#db7412\s*!important/);
  assert.match(portalCss, /#ffb347[^}]*#f28a1c[^}]*#d56e0d[^}]*#8f4308/);
  assert.match(portalCss, /phase-orb-ready-pulse 2\.15s/);
  assert.match(portalCss, /button::after[^}]*content:\s*none\s*!important[^}]*display:\s*none\s*!important/);
  assert.match(portalCss, /button > span[^}]*font-size:\s*1\.32em\s*!important/);
});

test("disabled phase-orb keeps the same depth model but is gray, desaturated and non-interactive", () => {
  assert.match(portalCss, /button:disabled[^}]*border-color:\s*#7d8286\s*!important/);
  assert.match(portalCss, /button:disabled[^}]*background:\s*#555b60\s*!important/);
  assert.match(portalCss, /button:disabled[^}]*filter:\s*grayscale\(1\) saturate\(0\) brightness\(\.82\)\s*!important/);
  assert.match(portalCss, /button:disabled[^}]*cursor:\s*not-allowed\s*!important/);
  assert.match(portalCss, /button:disabled[^}]*opacity:\s*1\s*!important/);
  assert.match(portalCss, /#8a9095[^}]*#6e7479[^}]*#555b60[^}]*#393e42/);
  assert.doesNotMatch(portalCss, /button:disabled::after/);
});

test("Cruel Terrain has one responsive positioning authority with a half-gap gutter", () => {
  assert.match(terrainRuntime, /measuredGap \* 0\.50/);
  assert.match(terrainRuntime, /firstRect\.width \* 0\.08/);
  assert.match(terrainRuntime, /const x = firstSlotLeft - slotWidth - clearance/);
  assert.doesNotMatch(layout, /TerrainProximityRuntime/);
});
