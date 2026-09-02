import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-panel-visual-balance-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("Cruel Terrain is anchored from the first rendered slot with extra proportional clearance", () => {
  assert.match(runtime, /const TERRAIN_GAP_MULTIPLIER = 1\.45/);
  assert.match(runtime, /\.field-slot\[data-slot="1"\]/);
  assert.match(runtime, /\.field-slot\[data-slot="2"\]/);
  assert.match(runtime, /geometry\.firstRect\.left - boardRect\.left - terrainRect\.width - geometry\.clearance/);
  assert.match(runtime, /\(fieldRect\.height - terrainRect\.height\) \/ 2/);
});

test("hero portrait gets a tiny responsive overscan instead of dead frame space", () => {
  assert.match(sheet, /hero-power-trigger > \.hero-portrait[^}]*inset: -\.12cqh -\.08cqw !important/);
  assert.match(sheet, /hero-power-trigger > \.hero-portrait > img[^}]*transform: scale\(1\.045\) !important/);
  assert.match(sheet, /object-fit: cover !important/);
});

test("expanded hero remains compact without crushing ability rows", () => {
  assert.match(sheet, /canonical-hero-panel\.is-expanded[^}]*height: 47\.8cqh !important/);
  assert.match(sheet, /hero-ability-chip[^}]*min-height: 3\.55cqh !important/);
  assert.match(sheet, /hero-ability-chip[^}]*column-gap: \.56cqw !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*line-height: 1\.15 !important/);
});

test("short landscape has its own compact but readable balance", () => {
  const landscape = css.slice(css.indexOf("@media (orientation: landscape)"));
  assert.match(landscape, /height: 46\.4cqh !important/);
  assert.match(landscape, /min-height: 3\.35cqh !important/);
  assert.match(landscape, /line-height: 1\.13 !important/);
});

test("visual balance stylesheet is the terminal hero CSS authority", () => {
  const geometry = layout.indexOf('import "./presentation/styles/hero-panel-layout-final.css"');
  const balance = layout.indexOf('import "./presentation/styles/hero-panel-visual-balance-final.css"');
  assert.ok(geometry >= 0 && balance > geometry);
});
