import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPresentationModule } from './helpers/load-presentation-module.mjs';

const Hero = loadPresentationModule('app/match/hero-details-trigger.tsx').HeroDetailsTrigger;
for (const targeting of [true, false]) {
  test(`hero click and keyboard ${targeting ? 'select the valid target' : 'open full details'}`, () => {
    let selected = 0, inspected = 0, stopped = 0, prevented = 0;
    const node = Hero({ name: 'Gimble', enemy: false, onTarget: targeting ? () => selected++ : undefined, onInspect: () => inspected++ });
    const event = { stopPropagation: () => stopped++, preventDefault: () => prevented++ };
    node.props.onClick(event);
    for (const key of ['Enter', ' ', 'Escape']) node.props.onKeyDown({ ...event, key });
    assert.equal(selected, targeting ? 3 : 0);
    assert.equal(inspected, targeting ? 0 : 3);
    assert.equal(stopped, 3, 'hero activation never bubbles to select a second time');
    assert.equal(prevented, 2, 'Space does not scroll during keyboard activation');
    assert.equal(node.props['aria-label'], targeting ? 'Selecionar Gimble como alvo' : 'Ver detalhes de Gimble');
  });
}

test('response waits for entry presentation, invalidates on busy and cancels pending frames on unmount', () => {
  let effect, state = null, id = 0;
  const frames = new Map(), listeners = new Map();
  const window = { __hemsfellPresentationBusy: false,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const hook = loadPresentationModule('app/match/use-response-presentation-ready.ts', {
    window,
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
  }, { react: { useState: () => [state, value => { state = value; }], useEffect: fn => { effect = fn; } } }).useResponsePresentationReady;
  const tick = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  assert.equal(hook('card-1', false), false);
  const cleanup = effect();
  tick();
  window.__hemsfellPresentationBusy = true;
  listeners.get('hemsfell:presentation-busy')();
  tick();
  assert.equal(state, null);
  window.__hemsfellPresentationBusy = false;
  listeners.get('hemsfell:presentation-idle')();
  tick();
  assert.equal(state, null);
  tick();
  assert.equal(hook('card-1', false), true);
  assert.equal(hook('card-2', false), false, 'previous settled action cannot open a new response');
  assert.equal(hook('card-1', true), false);
  listeners.get('hemsfell:presentation-idle')();
  cleanup();
  assert.equal(frames.size + listeners.size, 0);
});
