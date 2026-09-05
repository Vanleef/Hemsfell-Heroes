import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync("app/layout.tsx", "utf8");
const outsideCss = readFileSync("app/presentation/styles/requested-outside-match-fixes-terminal.css", "utf8");
const tutorial = readFileSync("app/presentation/tutorial/tutorial-screen.tsx", "utf8");
const boardCss = readFileSync("app/presentation/styles/tutorial-current-board-terminal.css", "utf8");
const collectionPriority = readFileSync("app/presentation/cards/collection-selected-deck-priority-runtime.tsx", "utf8");

test("landing hero fan keeps rotated clean portrait borders inside an unclipped responsive area", () => {
  assert.match(outsideCss, /\.screen-menu \.landing[\s\S]*?overflow:\s*visible !important/);
  assert.match(outsideCss, /\.screen-menu \.hero-fan[\s\S]*?min-height:\s*clamp\(29rem, 68dvh, 39rem\)/);
  assert.match(outsideCss, /\.screen-menu \.hero-fan[\s\S]*?overflow:\s*visible !important/);
  assert.match(outsideCss, /\.hero-fan \.remote-card-art[\s\S]*?transform-origin:\s*50% 112%/);
  assert.match(outsideCss, /pointer:\s*coarse[\s\S]*?\.screen-menu \.hero-fan/);
});

test("collection result count is contained by the filter panel on desktop and mobile", () => {
  assert.match(outsideCss, /collection-lists > \.collection-toolbar[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(7rem, 10rem\)/);
  assert.match(outsideCss, /collection-toolbar > output[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(outsideCss, /collection-toolbar > output[\s\S]*?justify-self:\s*end/);
  assert.match(outsideCss, /collection-toolbar > output[\s\S]*?max-width:\s*100%/);
});

test("current tutorial board is rendered by the chapter and retains responsive styling", () => {
  assert.match(tutorial, /<TutorialCurrentBoard \/>/);
  assert.doesNotMatch(layout, /TutorialCurrentBoardRuntime/);
  assert.match(boardCss, /aspect-ratio:\s*16 \/ 9/);
  assert.match(boardCss, /orientation:\s*landscape[\s\S]*?pointer:\s*coarse/);
});

test("selected collection deck outranks unrelated idle work and reprioritizes on selection changes", () => {
  assert.match(layout, /CollectionSelectedDeckPriorityRuntime/);
  assert.match(collectionPriority, /SELECTED_HERO_SELECTOR/);
  assert.match(collectionPriority, /SELECTED_DECK_CARD_SELECTOR/);
  assert.match(collectionPriority, /visiblePages\.forEach\(\(page\) => promoteRemoteCardArtPage\(page, 0, false\)\)/);
  assert.match(collectionPriority, /priority:\s*0,[\s\S]*?concurrency:\s*constrained\(\) \? 1 : 2/);
  assert.match(collectionPriority, /const eagerCount = constrained\(\) \? 8 : 14/);
  assert.match(collectionPriority, /priority:\s*1,[\s\S]*?signal:\s*deckController\.signal/);
  assert.match(collectionPriority, /priority:\s*2,[\s\S]*?concurrency:\s*1/);
  assert.match(collectionPriority, /deckController\.abort\(\)/);
  assert.match(collectionPriority, /requestIdleCallback/);
});
