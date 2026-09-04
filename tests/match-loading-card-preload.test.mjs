import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const gate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8");
const loading = fs.readFileSync("app/presentation/runtime/match-loading-runtime.tsx", "utf8");
const loadingCss = fs.readFileSync("app/presentation/runtime/match-loading-runtime.module.css", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const art = fs.readFileSync("app/presentation/cards/remote-card-art.tsx", "utf8");

test("every mounted match gets a loading gate before the other match runtimes", () => {
  assert.match(gate, /import MatchLoadingRuntime from "\.\/match-loading-runtime"/);
  const loadingIndex = gate.indexOf("<MatchLoadingRuntime />");
  const uiIndex = gate.indexOf("<MatchUiRuntime />");
  const presentationIndex = gate.indexOf("<PresentationEventBridge />");
  assert.ok(loadingIndex >= 0);
  assert.ok(loadingIndex < uiIndex);
  assert.ok(loadingIndex < presentationIndex);
});

test("loading gate cannot end until both opening hands have usable visuals", () => {
  assert.match(loading, /MIN_MATCH_LOADING_MS = 1300/);
  assert.match(loading, /PLAYER_HAND_SELECTOR = "\.screen-game \.player-hand"/);
  assert.match(loading, /OPPONENT_HAND_SELECTOR = "\.screen-game \.opponent-hand"/);
  assert.match(loading, /const bothOpeningHandsReady = \(\) => handReady\(PLAYER_HAND_SELECTOR\) && handReady\(OPPONENT_HAND_SELECTOR, true\)/);
  assert.match(loading, /art\.dataset\.loaded === "true"/);
  assert.match(loading, /MATCH_CARD_BACK_URL = "\/cards\/card-back-hemsfell\.webp"/);
  assert.match(loading, /cardBackReady/);
  assert.match(loading, /elapsed >= MIN_MATCH_LOADING_MS && bothOpeningHandsReady\(\)/);
  assert.doesNotMatch(loading, /MAX_MATCH_LOADING_MS|setTimeout\(finish/);
  assert.match(loading, /MutationObserver\(scheduleCheck\)/);
  assert.match(loading, /attributeFilter: \["data-loaded", "data-page"\]/);
  assert.match(loading, /data-hemsfell-match-loading="true"/);
  assert.match(loading, /Carregando partida\.\.\./);
  assert.match(loading, /Preparando as mãos dos dois jogadores/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
});

test("match loading overlaps the existing two-player full-deck art preload", () => {
  assert.match(page, /matchArtPreloadPlan=\(state:Game\)/);
  assert.match(page, /\.\.\.player\.hand,[\s\S]*?\.\.\.player\.deck,[\s\S]*?\.\.\.player\.extraDeck/);
  assert.match(page, /backgroundPages:allMatchCards\.map/);
  assert.match(page, /preloadMatchCardArt/);
  assert.match(art, /prewarmRemoteCardArtPages\(critical, COMPACT_RASTER_CSS_WIDTH/);
  assert.match(art, /prewarmRemoteCardArtPages\(background, COMPACT_RASTER_CSS_WIDTH/);
  assert.match(art, /requestIdleCallback\(runBackground, \{ timeout: 500 \}\)/);
  assert.ok(1300 > 500, "loading gate must remain visible after background deck prewarm is scheduled");
});

test("match loading UI is responsive and keeps a reduced-motion fallback", () => {
  assert.match(loadingCss, /position: fixed/);
  assert.match(loadingCss, /min-height: 100dvh/);
  assert.match(loadingCss, /env\(safe-area-inset-top\)/);
  assert.match(loadingCss, /@media \(max-width: 48rem\), \(pointer: coarse\)/);
  assert.match(loadingCss, /@media \(max-height: 34rem\) and \(orientation: landscape\)/);
  assert.match(loadingCss, /@media \(prefers-reduced-motion: reduce\)/);
});
