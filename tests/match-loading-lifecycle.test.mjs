import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPresentationModule } from './helpers/load-presentation-module.mjs';

function mountGate() {
  let effect, now = 0, state = true, ready = false, frameId = 0;
  const frames = new Map(), timers = new Map(), listeners = new Set();
  const root = { dataset: {} };
  const art = { dataset: {} };
  const card = { querySelector: () => art };
  const hand = { querySelectorAll: () => ready ? [card] : [], querySelector: () => null };
  const observers = [];
  const api = loadPresentationModule('app/presentation/runtime/match-loading-runtime.tsx', {
    performance: { now: () => now },
    document: {
      documentElement: root, body: {}, querySelector: () => hand, querySelectorAll: () => [],
      addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    },
    window: {
      dispatchEvent() {}, setTimeout: (fn) => { const id = ++frameId; timers.set(id, fn); return id; },
      clearTimeout: (id) => timers.delete(id),
    },
    CustomEvent: class {},
    Image: class { complete = true; naturalWidth = 100; },
    MutationObserver: class {
      constructor(fn) { this.callback = fn; observers.push(this); }
      observe() { this.connected = true; }
      disconnect() { this.connected = false; }
    },
    requestAnimationFrame: (fn) => { const id = ++frameId; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  }, {
    react: { useRef: (value) => ({ current: value }), useState: () => [state, (value) => { state = value; }], useEffect: (fn) => { effect = fn; } },
  });
  api.default();
  return {
    setup: () => effect(), root, frames, timers, listeners, observers,
    get visible() { return state; },
    check({ hands = true, loaded = true, elapsed = 1500 } = {}) {
      ready = hands; art.dataset.loaded = String(loaded); now = elapsed;
      observers.at(-1).callback();
      const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn());
    },
  };
}

test('loading waits for usable hands and the minimum display time, then cleans up', () => {
  const h = mountGate();
  const cleanup = h.setup();
  h.check({ hands: false });
  assert.equal(h.visible, true);
  h.check({ loaded: false });
  assert.equal(h.visible, true);
  h.check({ elapsed: 500 });
  assert.equal(h.visible, true);
  h.check();
  assert.equal(h.visible, false);
  assert.equal(h.root.dataset.hemsfellMatchLoading, undefined);
  assert.equal(h.frames.size + h.timers.size + h.listeners.size, 0);
  assert.equal(h.observers.at(-1).connected, false);
  cleanup();
});

test('Strict Mode setup-cleanup-setup can still finish loading', () => {
  const h = mountGate();
  h.setup()();
  const cleanup = h.setup();
  h.check();
  assert.equal(h.visible, false, 'replayed effect must reactivate its busy reference');
  assert.equal(h.root.dataset.hemsfellMatchLoading, undefined);
  cleanup();
});

test('unmounting a loading match cancels observers, timers and keyboard interception', () => {
  const h = mountGate();
  const cleanup = h.setup();
  h.check({ loaded: false });
  cleanup();
  assert.equal(h.frames.size + h.timers.size + h.listeners.size, 0);
  assert.equal(h.observers.at(-1).connected, false);
  assert.equal(h.root.dataset.hemsfellMatchLoading, undefined);
});
