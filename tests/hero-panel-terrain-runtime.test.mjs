import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const geometryCss = fs.readFileSync("app/presentation/styles/hero-panel-layout-final.css", "utf8");
const balanceCss = fs.readFileSync("app/presentation/styles/hero-panel-visual-balance-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("Cruel Terrain is anchored to the first rendered owner slot with proportional extra clearance", () => {
  assert.match(runtime, /const TERRAIN_GAP_MULTIPLIER = 1\.45/);
  assert.match(runtime, /\.field-slot\[data-slot="1"\]/);
  assert.match(runtime, /\.field-slot\[data-slot="2"\]/);
  assert.match(runtime, /secondRect\.left - firstRect\.right/);
  assert.match(runtime, /geometry\.firstRect\.left - boardRect\.left - terrainRect\.width - geometry\.clearance/);
  assert.match(runtime, /fieldRect\.top - boardRect\.top \+ \(fieldRect\.height - terrainRect\.height\) \/ 2/);
  assert.match(runtime, /is-field-anchored/);
  assert.match(geometryCss, /\.terrain-slot\.is-field-anchored/);
  assert.match(geometryCss, /left: var\(--terrain-anchor-x\)/);
  assert.match(geometryCss, /top: var\(--terrain-anchor-y\)/);
  assert.match(layout, /<TerrainFieldAnchorRuntime \/>/);
});

test("hero artwork fills and slightly overscans its portrait band", () => {
  assert.match(geometryCss, /--hero-card-art-top: 0cqh/);
  assert.match(geometryCss, /hero-power-trigger[\s\S]*?left: 0 !important;[\s\S]*?right: 0 !important;[\s\S]*?width: 100% !important;/);
  assert.match(balanceCss, /hero-power-trigger > \.hero-portrait[\s\S]*?inset: -\.12cqh -\.08cqw !important;/);
  assert.match(balanceCss, /hero-portrait > img[\s\S]*?transform: scale\(1\.045\) !important;[\s\S]*?object-fit: cover !important;/);
});

test("expanded hero balances compact height with readable ability rows", () => {
  assert.match(balanceCss, /canonical-hero-panel\.is-expanded \{[\s\S]*?height: 47\.8cqh !important;/);
  assert.match(balanceCss, /grid-template-rows: repeat\(3, auto\) !important;/);
  assert.match(balanceCss, /hero-ability-chip[\s\S]*?min-height: 3\.55cqh !important;[\s\S]*?padding: \.34cqh \.4cqw !important;/);
  assert.match(balanceCss, /hero-ability-copy > p[\s\S]*?line-height: 1\.15 !important;/);
  assert.match(balanceCss, /height: 46\.4cqh !important;/);
});
