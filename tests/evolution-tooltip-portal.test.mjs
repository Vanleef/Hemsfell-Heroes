import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/evolution-tooltip-portal-runtime.tsx", "utf8");
const portalCss = fs.readFileSync("app/presentation/styles/evolution-tooltip-portal-final.css", "utf8");
const terrainRuntime = fs.readFileSync("app/presentation/runtime/terrain-proximity-runtime.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("evolution criteria escapes the board through a body-level fixed portal", () => {
  assert.match(runtime, /document\.body\.appendChild\(nextPortal\)/);
  assert.match(runtime, /className = `evolution-tooltip \$\{PORTAL_CLASS\}`/);
  assert.match(portalCss, /position:\s*fixed\s*!important/);
  assert.match(portalCss, /z-index:\s*2147483647\s*!important/);
  assert.match(layout, /EvolutionTooltipPortalRuntime/);
  assert.match(layout, /evolution-tooltip-portal-final\.css/);
});

test("phase-orb copy is black with a gold outline", () => {
  assert.match(portalCss, /color:\s*#080603\s*!important/);
  assert.match(portalCss, /-webkit-text-stroke:\s*\.5px #efc961\s*!important/);
});

test("Cruel Terrain keeps a smaller responsive gutter beside the field", () => {
  assert.match(terrainRuntime, /measuredGap \* 0\.50/);
  assert.match(terrainRuntime, /firstRect\.width \* 0\.08/);
  assert.match(terrainRuntime, /Math\.max\(0, firstSlotLeft - slotWidth - clearance\)/);
});
