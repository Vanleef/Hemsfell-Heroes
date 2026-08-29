import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, css] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/match-ui.css", import.meta.url), "utf8"),
]);

test("an obsolete automatic priority pass is reconciled without exposing an engine error", () => {
  assert.match(page, /obsoleteAutomaticPriorityPass/);
  assert.match(page, /\["no-priority-window","not-your-priority"\]/);
  assert.match(page, /if\(!res\.ok&&obsoleteAutomaticPriorityPass\)\{applyRoomSnapshot\(data\);setRoomError\(""\);return data\}/);
  assert.match(page, /if\(current\?\.pendingResponse\?\.responder!==owner\)return true/);
});

test("top bar copy remains legible and a short opponent hand cannot stretch its cards", () => {
  assert.match(css, /game-content\.hs-board > \.game-bar[\s\S]*?font-size: clamp\(\.5rem/);
  const topBarButtonSize = css.match(/game-bar > button[\s\S]*?font-size: clamp\(\.(\d+)rem/);
  assert.ok(topBarButtonSize, "expected responsive font sizing for top bar buttons");
  assert.ok(Number(`0.${topBarButtonSize[1]}`) >= 0.36, "top bar button font floor must remain readable");
  assert.match(css, /opponent-hand > :is\([\s\S]*?flex: 0 1 clamp\(1\.45rem/);
  assert.match(css, /max-width: 3rem !important/);
});