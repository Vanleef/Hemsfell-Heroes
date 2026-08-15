import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Magic Barrier uses a responsive blue battlefield shield shell", async () => {
  const css = await readFile(new URL("../app/magic-barrier.css", import.meta.url), "utf8");
  assert.match(css, /has-magic-barrier/);
  assert.match(css, /card-frame:has/);
  assert.match(css, /rgb\(100 205 255/);
  assert.match(css, /rgb\(34 142 255/);
  assert.match(css, /clamp\(/);
  assert.match(css, /hh-magic-barrier-pulse/);
  assert.doesNotMatch(css, /width:\s*\d+px|height:\s*\d+px/);
});

test("Magic Barrier stylesheet loads after canonical UI overrides", async () => {
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const overrides = globals.indexOf('@import "./ui-overrides.css";');
  const barrier = globals.indexOf('@import "./magic-barrier.css";');
  assert.ok(overrides >= 0 && barrier > overrides);
});
