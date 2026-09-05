import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPresentationModule, deferred, flush } from './helpers/load-presentation-module.mjs';

function harness({ mobile = true, match, draw, render } = {}) {
  const reads = [], renders = [], idle = [], encodes = [], writes = [];
  let bitmapsClosed = 0;
  const canvas = () => ({
    width: 0, height: 0, clientWidth: 120, style: {}, dataset: {},
    getContext: () => ({ drawImage: draw ?? (() => {}), clearRect() {} }),
    toBlob(callback) { encodes.push(() => callback(new Blob(['art']))); },
  });
  const api = loadPresentationModule('app/presentation/cards/remote-card-art.tsx', {
    navigator: { deviceMemory: mobile ? 4 : 8 },
    matchMedia: () => ({ matches: mobile }),
    location: { origin: 'https://game.test' },
    document: { createElement: canvas },
    window: { requestIdleCallback: (fn) => { idle.push(fn); return idle.length; }, cancelIdleCallback() {}, dispatchEvent() {} },
    CustomEvent: class {},
    caches: { open: async () => ({
      async match(key) { reads.push(key); return match ? match(key) : null; },
      async put(key) { writes.push(key); },
    }) },
    createImageBitmap: async () => ({ width: 144, height: 202, close() { bitmapsClosed++; } }),
  }, {
    'pdfjs-dist': {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({
        numPages: 400, cleanup() {},
        async getPage(page) { return {
          getViewport: ({ scale }) => ({ width: 100 * scale, height: 140 * scale }),
          render() { renders.push(page); return { promise: render ? render(page) : Promise.resolve() }; },
          cleanup() {},
        }; },
      }) }),
    },
  });
  return { api, canvas, reads, renders, idle, encodes, writes, get bitmapsClosed() { return bitmapsClosed; } };
}

for (const [mobile, limit] of [[true, 1], [false, 2]]) {
  test(`cache restoration respects ${mobile ? 'mobile' : 'desktop'} concurrency and selected priority`, async () => {
    const gate = deferred();
    const h = harness({ mobile, match: async () => { await gate.promise; return new Response("cached"); } });
    const background = h.api.prewarmRemoteCardArtPages([10, 11, 12, 13], 64, { priority: 3, concurrency: 4 });
    await flush();
    assert.equal(h.reads.length, limit, 'cache decoding must enter the same queue as PDF rendering');
    const selected = h.api.prewarmRemoteCardArtPages([20], 64, { priority: 0 });
    gate.resolve(new Response('cached'));
    await Promise.all([background, selected]);
    assert.match(h.reads[limit], /\/20-/, 'selected card precedes queued background cards');
    assert.equal(h.renders.length, 0, 'warm cache never loads PDF pages');
    assert.equal(h.bitmapsClosed, 5);
  });
}

test('concurrent copies and subsequent screens reuse a raster', async () => {
  const h = harness();
  await Promise.all(Array.from({ length: 6 }, () => h.api.prewarmRemoteCardArtPages([10])));
  h.api.setRemoteCardArtContext('collection', [10]);
  const target = h.canvas();
  await h.api.renderRemoteCardArtToCanvas(target, 10);
  assert.deepEqual(h.renders, [10]);
  assert.equal(target.dataset.loaded, 'true');
});

test('context changes discard obsolete queued work and permit immediate rerequest', async () => {
  const gate = deferred();
  const h = harness({ render: () => gate.promise });
  const old = h.api.prewarmRemoteCardArtPages([10, 11, 12], 64, { concurrency: 3 });
  await flush();
  h.api.setRemoteCardArtContext('collection', [20]);
  const current = h.api.prewarmRemoteCardArtPages([11, 20], 64, { priority: 0, concurrency: 2 });
  gate.resolve();
  await Promise.all([old, current]);
  await h.api.prewarmRemoteCardArtPages([11]);
  assert.deepEqual(h.renders, [10, 11, 20]);
});

test('a failed PDF render can be retried without a poisoned promise', async () => {
  let attempts = 0;
  const h = harness({ render: () => ++attempts === 1 ? Promise.reject(new Error('network')) : Promise.resolve() });
  await h.api.prewarmRemoteCardArtPages([10]);
  const target = h.canvas();
  await h.api.renderRemoteCardArtToCanvas(target, 10);
  assert.equal(attempts, 2);
  assert.equal(target.dataset.loaded, 'true');
});

test('bitmap resources close even when drawing the cached image fails', async () => {
  const h = harness({ match: () => new Response('cached'), draw: () => { throw new Error('context lost'); } });
  await h.api.prewarmRemoteCardArtPages([10]);
  assert.equal(h.bitmapsClosed, 1);
  assert.deepEqual(h.renders, [10], 'failed cache restore falls back to PDF');
});

test('persistent encoding stays serial while new cards finish rendering', async () => {
  const h = harness();
  await h.api.prewarmRemoteCardArtPages([10]);
  h.idle.shift()();
  assert.equal(h.encodes.length, 1);
  await h.api.prewarmRemoteCardArtPages([11]);
  assert.equal(h.idle.length, 0, 'no second encoder scheduled while the first is in flight');
  h.encodes.shift()();
  await flush();
  assert.equal(h.writes.length, 1);
  assert.equal(h.idle.length, 1);
});

test('a settled burst is trimmed without requiring another insertion', async () => {
  const h = harness();
  await h.api.prewarmRemoteCardArtPages(Array.from({ length: 24 }, (_, i) => i + 1), 64, { concurrency: 24 });
  await flush();
  const before = h.renders.length;
  await h.api.prewarmRemoteCardArtPages([1]);
  assert.equal(h.renders.length, before + 1, 'old raster has been evicted from the 12-entry mobile cache');
});

test('match retention protects compact art while allowing detail tiers to expire', async () => {
  const h = harness();
  h.api.setRemoteCardArtContext('match');
  const pages = Array.from({ length: 40 }, (_, i) => i + 1);
  const release = h.api.preloadMatchCardArt({ criticalPages: pages, backgroundPages: [] });
  await h.api.prewarmRemoteCardArtPages(pages);
  await h.api.prewarmRemoteCardArtPages(pages, 360);
  await flush();
  const before = h.renders.length;
  await h.api.prewarmRemoteCardArtPages([1]);
  assert.equal(h.renders.length, before, 'compact match art remains available');
  await h.api.prewarmRemoteCardArtPages([1], 360);
  assert.equal(h.renders.length, before + 1, 'old detail art does not become pinned with its compact variant');
  release();
});
