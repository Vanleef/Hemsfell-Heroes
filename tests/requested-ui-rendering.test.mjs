import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadPresentationModule } from './helpers/load-presentation-module.mjs';

const imports = { react: React, 'react/jsx-runtime': jsxRuntime };
const Marker = loadPresentationModule('app/presentation/runtime/card-marker-counter-runtime.tsx', {}, imports).default;
const Board = loadPresentationModule('app/presentation/tutorial/tutorial-current-board-runtime.tsx', {}, imports).default;

test('marker output is numeric on the first render, including subsequent count changes', () => {
  for (const count of [1, 12, 2]) {
    const html = renderToStaticMarkup(React.createElement(Marker, { count }));
    assert.match(html, new RegExp(`>${count}</i>`));
    assert.match(html, new RegExp(`aria-label="${count} ${count === 1 ? 'marcador' : 'marcadores'}"`));
    assert.doesNotMatch(html, /\+/);
  }
  for (const count of [0, -1, NaN, Infinity]) {
    assert.equal(renderToStaticMarkup(React.createElement(Marker, { count })), '');
  }
});

test('current tutorial composition exists before effects and survives repeated renders', () => {
  const html = renderToStaticMarkup(React.createElement(Board));
  assert.equal((html.match(/class="hh-tutorial-board-slot"/g) || []).length, 20);
  assert.equal((html.match(/class="hh-tutorial-board-row /g) || []).length, 4);
  for (const owner of ['opponent', 'player']) {
    for (const part of ['hero', 'hand', 'energy', 'piles', 'terrain']) {
      assert.ok(html.includes(`hh-tutorial-live-${part} is-${owner}`));
    }
  }
  assert.match(html, /hh-tutorial-live-topbar/);
  assert.match(html, /hh-tutorial-live-phase/);
  for (const badge of [1, 2, 3, 4, 5, 6]) assert.ok(html.includes(`class="hh-tutorial-zone-badge">${badge}</b>`));
  assert.doesNotMatch(html, /tutorial-board-playfield/);
  assert.equal(renderToStaticMarkup(React.createElement(Board)), html);
});

test('collection warms visible compact cards first and cancels the old selection', () => {
  let effect, nextFrame, heroPage = 2, page = 3;
  const calls = [], promotions = [];
  const hero = { dataset: { get page() { return String(heroPage); } } };
  const canvas = { dataset: { get page() { return String(page); } }, getBoundingClientRect: () => ({ width: 100, height: 140, left: 10, top: 10, right: 110, bottom: 150 }) };
  const document = {
    body: {},
    querySelector: (selector) => selector === '.screen-decks' ? {} : hero,
    querySelectorAll: () => [canvas], addEventListener() {}, removeEventListener() {},
  };
  const Runtime = loadPresentationModule('app/presentation/cards/collection-selected-deck-priority-runtime.tsx', {
    document, matchMedia: () => ({ matches: true }),
    window: { innerHeight: 600, innerWidth: 400, requestAnimationFrame: (fn) => { nextFrame = fn; return 1; }, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} },
  }, {
    react: { useEffect: (fn) => { effect = fn; } },
    './remote-card-art': {
      prewarmRemoteCardArtPages: (pages, width, options) => { calls.push({ pages: [...pages], width, ...options }); return Promise.resolve(); },
      promoteRemoteCardArtPage: (...args) => promotions.push(args),
    },
  }).default;
  Runtime();
  const cleanup = effect();
  nextFrame();
  assert.equal(calls[0].width, 144);
  assert.equal(calls[0].priority, 0);
  assert.equal(calls[0].concurrency, 1);
  assert.deepEqual(promotions[0], [3, 0, false], 'visible cards do not displace the selected hero from the hot set');
  heroPage = 26; page = 27;
  nextFrame();
  assert.equal(calls[0].signal.aborted, true);
  assert.deepEqual(calls[1].pages, [27]);
  assert.equal(calls[1].signal.aborted, false);
  cleanup();
  assert.equal(calls[1].signal.aborted, true);
});
