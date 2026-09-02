import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/evolution-tooltip-portal-runtime.tsx", "utf8");
const portalCss = fs.readFileSync("app/presentation/styles/evolution-tooltip-portal-final.css", "utf8");
const terrainRuntime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("evolution criteria escapes the board and is triggered from measured progress geometry", () => {
  assert.match(runtime, /document\.body\.appendChild\(nextPortal\)/);
  assert.match(runtime, /className = `evolution-tooltip \$\{PORTAL_CLASS\}`/);
  assert.match(runtime, /const triggerAtPoint = \(clientX: number, clientY: number\)/);
  assert.match(runtime, /document\.addEventListener\("pointermove", onPointerMove, true\)/);
  assert.match(portalCss, /position:\s*fixed\s*!important/);
  assert.match(portalCss, /z-index:\s*2147483647\s*!important/);
  assert.match(layout, /EvolutionTooltipPortalRuntime/);
  assert.match(layout, /evolution-tooltip-portal-final\.css/);
});

test("phase-orb direct label and arrow use black fill with a gold outline", () => {
  assert.match(portalCss, /color:\s*#080603\s*!important/);
  assert.match(portalCss, /-webkit-text-fill-color:\s*#080603\s*!important/);
  assert.match(portalCss, /-webkit-text-stroke:\s*\.5px #efc961\s*!important/);
});

test("Cruel Terrain has one responsive positioning authority with a half-gap gutter", () => {
  assert.match(terrainRuntime, /measuredGap \* 0\.50/);
  assert.match(terrainRuntime, /firstRect\.width \* 0\.08/);
  assert.match(terrainRuntime, /const x = firstSlotLeft - slotWidth - clearance/);
  assert.doesNotMatch(layout, /TerrainProximityRuntime/);
});
