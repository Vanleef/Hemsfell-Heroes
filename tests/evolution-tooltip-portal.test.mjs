import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/evolution-tooltip-portal-runtime.tsx", "utf8");
const portalCss = fs.readFileSync("app/presentation/styles/evolution-tooltip-portal-final.css", "utf8");
const terrainRuntime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("evolution criteria uses browser Top Layer and only progress-track hover geometry", () => {
  assert.match(runtime, /PROGRESS_SELECTOR = "\.screen-game \.hero-evolution > \.evolution-track"/);
  assert.match(runtime, /SOURCE_SELECTOR/);
  assert.match(runtime, /document\.body\.appendChild\(nextPortal\)/);
  assert.match(runtime, /nextPortal\.setAttribute\("popover", "manual"\)/);
  assert.match(runtime, /nextPortal\.showPopover\?\.\(\)/);
  assert.match(runtime, /const suppressReactOwnedTooltips =/);
  assert.match(runtime, /style\.setProperty\("display", "none", "important"\)/);
  assert.match(runtime, /const progressAtPoint = \(clientX: number, clientY: number\)/);
  assert.match(runtime, /document\.addEventListener\("pointermove", onPointerMove, true\)/);
  assert.match(portalCss, /evolution-tooltip:not\(\.evolution-tooltip-portal\)[^}]*display:\s*none\s*!important/);
  assert.match(portalCss, /position:\s*fixed\s*!important/);
  assert.match(portalCss, /z-index:\s*2147483647\s*!important/);
  assert.match(layout, /EvolutionTooltipPortalRuntime/);
  assert.match(layout, /evolution-tooltip-portal-final\.css/);
});

test("phase-orb direct label and arrow use larger black copy with a white outline", () => {
  assert.match(portalCss, /color:\s*#080603\s*!important/);
  assert.match(portalCss, /-webkit-text-fill-color:\s*#080603\s*!important/);
  assert.match(portalCss, /-webkit-text-stroke:\s*\.55px #ffffff\s*!important/);
  assert.match(portalCss, /font-size:\s*clamp\(\.62rem, min\(\.9cqw, 1\.38cqh\), \.92rem\)\s*!important/);
  assert.match(portalCss, /button > span[^}]*font-size:\s*1\.3em\s*!important/);
});

test("actionable phase-orb uses a vivid yellow-gold surface instead of burnt orange", () => {
  assert.match(portalCss, /button:not\(:disabled\)[^}]*#f8dd55[^}]*#ddb61f[^}]*#a57a08/);
  assert.match(portalCss, /border-color:\s*#fff09a\s*!important/);
  assert.match(portalCss, /rgb\(255 224 74 \/ 58%\)/);
});

test("Cruel Terrain has one responsive positioning authority with a half-gap gutter", () => {
  assert.match(terrainRuntime, /measuredGap \* 0\.50/);
  assert.match(terrainRuntime, /firstRect\.width \* 0\.08/);
  assert.match(terrainRuntime, /const x = firstSlotLeft - slotWidth - clearance/);
  assert.doesNotMatch(layout, /TerrainProximityRuntime/);
});
