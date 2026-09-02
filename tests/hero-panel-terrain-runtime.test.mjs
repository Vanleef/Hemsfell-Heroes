import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-panel-layout-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("Cruel Terrain is anchored to the rendered owner field and measured slot gap", () => {
  assert.match(runtime, /fieldRect\.left - boardRect\.left - terrainRect\.width - gap/);
  assert.match(runtime, /fieldRect\.top - boardRect\.top \+ \(fieldRect\.height - terrainRect\.height\) \/ 2/);
  assert.match(runtime, /b\.left - a\.right/);
  assert.match(runtime, /is-field-anchored/);
  assert.match(css, /\.terrain-slot\.is-field-anchored/);
  assert.match(css, /left: var\(--terrain-anchor-x\)/);
  assert.match(css, /top: var\(--terrain-anchor-y\)/);
  assert.match(layout, /<TerrainFieldAnchorRuntime \/>/);
});

test("hero artwork fills its portrait band", () => {
  assert.match(css, /--hero-card-art-top: 0cqh/);
  assert.match(css, /hero-power-trigger[\s\S]*?left: 0 !important;[\s\S]*?right: 0 !important;[\s\S]*?width: 100% !important;/);
  assert.match(css, /hero-portrait > img[\s\S]*?object-fit: cover !important;/);
});

test("expanded hero uses natural compact ability rows and bounded responsive height", () => {
  assert.match(css, /hero-panel-stack\.canonical-hero-panel\.is-expanded \{[\s\S]*?height: 46\.2cqh !important;/);
  assert.match(css, /grid-template-rows: repeat\(3, auto\) !important;/);
  assert.match(css, /hero-ability-chip[\s\S]*?padding: \.22cqh \.34cqw !important;/);
  assert.match(css, /hero-ability-copy > p[\s\S]*?line-height: 1\.08 !important;/);
  assert.match(css, /height: 44\.5cqh !important;/);
});
