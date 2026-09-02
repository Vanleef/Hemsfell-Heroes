import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/terrain-drag-stability.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("Cruel Terrain geometry survives React can-drop className rerenders", () => {
  assert.match(runtime, /const pinTerrainGeometry =/);
  assert.match(runtime, /style\.setProperty\("position", "absolute", "important"\)/);
  assert.match(runtime, /style\.setProperty\("left", px\(x\), "important"\)/);
  assert.match(runtime, /style\.setProperty\("top", px\(y\), "important"\)/);
  assert.match(runtime, /style\.setProperty\("width", `\$\{slotWidth\}px`, "important"\)/);
  assert.match(runtime, /style\.setProperty\("height", `\$\{slotHeight\}px`, "important"\)/);
  assert.match(runtime, /style\.setProperty\("animation", "none", "important"\)/);
  assert.match(runtime, /style\.setProperty\("visibility", "visible", "important"\)/);
  assert.match(runtime, /style\.setProperty\("opacity", "1", "important"\)/);
});

test("can-drop visibility no longer depends on imperative is-field-anchored class", () => {
  assert.match(sheet, /terrain-slot\.player-terrain\.can-drop[^}]*display: grid !important/);
  assert.match(sheet, /terrain-slot\.player-terrain\.can-drop[^}]*visibility: visible !important/);
  assert.match(sheet, /terrain-slot\.player-terrain\.can-drop[^}]*opacity: 1 !important/);
  assert.match(sheet, /terrain-slot\.player-terrain\.can-drop[^}]*animation: none !important/);
  assert.match(sheet, /terrain-slot\.player-terrain\.can-drop > svg[^}]*display: block !important/);
  assert.doesNotMatch(sheet, /is-field-anchored\.can-drop/);
});

test("terrain drag stability is loaded after all hero and terrain polish", () => {
  const polish = layout.indexOf('import "./presentation/styles/hero-panel-polish-terminal.css"');
  const stable = layout.indexOf('import "./presentation/styles/terrain-drag-stability.css"');
  assert.ok(polish >= 0 && stable > polish);
});
