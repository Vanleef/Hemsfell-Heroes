import test from "node:test";
import assert from "node:assert/strict";
import {
  activationInsideTriggeredEffect,
  hasActivatableEffectText,
  canActivateCard,
} from "../app/card-activation.mjs";

const context = (overrides = {}) => ({ energy: 3, reserve: 0, hasSacrificeTarget: true, ...overrides });
const card = (text, overrides = {}) => ({ text, markers: 0, exhausted: false, summoning: false, activatedThisTurn: false, suffocated: false, ...overrides });

test("triggered Primeiro Ato and Último Suspiro costs are not manual activations", () => {
  assert.equal(activationInsideTriggeredEffect("Primeiro Ato: Vire esta criatura."), true);
  assert.equal(activationInsideTriggeredEffect("Último Suspiro: Remova 2 marcadores."), true);
  assert.equal(hasActivatableEffectText("Primeiro Ato: Sacrifique uma criatura."), false);
  assert.equal(hasActivatableEffectText("Último Suspiro: Vire esta carta."), false);
});

test("continuous Vire, Remova and Sacrifique costs are activatable", () => {
  assert.equal(hasActivatableEffectText("Vire: compre 1 carta."), true);
  assert.equal(hasActivatableEffectText("Remova 2 marcadores: cause 2 de dano."), true);
  assert.equal(hasActivatableEffectText("Sacrifique uma criatura: compre 2 cartas."), true);
});

test("activation availability enforces tap, markers, sacrifice, energy and once-per-turn", () => {
  assert.equal(canActivateCard(card("Vire: compre 1 carta."), context()), true);
  assert.equal(canActivateCard(card("Vire: compre 1 carta.", { exhausted: true }), context()), false);
  assert.equal(canActivateCard(card("Remova 3 marcadores: compre 1 carta.", { markers: 2 }), context()), false);
  assert.equal(canActivateCard(card("Remova 3 marcadores: compre 1 carta.", { markers: 3 }), context()), true);
  assert.equal(canActivateCard(card("Sacrifique uma criatura: compre 1 carta."), context({ hasSacrificeTarget: false })), false);
  assert.equal(canActivateCard(card("Pague 4 de energia e vire: compre 1 carta."), context({ energy: 3 })), false);
  assert.equal(canActivateCard(card("Vire: compre 1 carta.", { activatedThisTurn: true }), context()), false);
  assert.equal(canActivateCard(card("Vire: compre 1 carta.", { activationLockedOnEntry: true }), context()), false);
});
