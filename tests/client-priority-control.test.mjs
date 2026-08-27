import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  flushQueuedPriorityControl,
  requestPriorityControlChange,
  shouldAutoPassPriorityWindow,
  shouldShowPriorityWindow,
} from "../app/match/priority-control-policy.mjs";

const pending = { responder: 0, actor: 1, action: "feitiço adversário", deadline: 1234, passes: 0 };

test("assistido para manual durante uma interação só vale depois da prioridade atual", () => {
  const queued = requestPriorityControlChange({ mode: "assisted", queuedMode: null, interactionActive: true });
  assert.deepEqual(queued, { mode: "assisted", queuedMode: "full-control" });
  assert.equal(shouldShowPriorityWindow({ pending, mode: queued.mode, hasUsableResponse: false }), false);
  assert.equal(shouldAutoPassPriorityWindow({ pending, mode: queued.mode, hasUsableResponse: false }), true);
  assert.deepEqual(flushQueuedPriorityControl({ ...queued, interactionActive: true }), queued);
  assert.deepEqual(flushQueuedPriorityControl({ ...queued, interactionActive: false }), { mode: "full-control", queuedMode: null });
});

test("manual para assistido não fecha nem auto-passa uma janela que já começou manual", () => {
  const queued = requestPriorityControlChange({ mode: "full-control", queuedMode: null, interactionActive: true });
  assert.deepEqual(queued, { mode: "full-control", queuedMode: "assisted" });
  assert.equal(shouldShowPriorityWindow({ pending, mode: queued.mode, hasUsableResponse: false }), true);
  assert.equal(shouldAutoPassPriorityWindow({ pending, mode: queued.mode, hasUsableResponse: false }), false);
});

test("fora de uma interação a troca de modo é imediata", () => {
  assert.deepEqual(requestPriorityControlChange({ mode: "assisted", queuedMode: null, interactionActive: false }), { mode: "full-control", queuedMode: null });
});

test("duplo toggle durante a mesma interação cancela a mudança agendada", () => {
  const once = requestPriorityControlChange({ mode: "assisted", queuedMode: null, interactionActive: true });
  assert.deepEqual(requestPriorityControlChange({ ...once, interactionActive: true }), { mode: "assisted", queuedMode: null });
});

test("page delegates priority and combat presentation to client modules", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /from "\.\/match\/use-priority-control"/);
  assert.match(page, /from "\.\/match\/priority-ui"/);
  assert.match(page, /from "\.\/match\/combat-animation"/);
  assert.doesNotMatch(page, /function ResponseModal\(/);
  assert.doesNotMatch(page, /function CombatAnimation\(/);
  assert.doesNotMatch(page, /setPriorityControl/);
  assert.match(page, /priorityControl\.showWindow/);
});
