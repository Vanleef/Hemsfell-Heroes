"use client";

import { useEffect } from "react";
import { animateActionCue, captureActionCue, type ActionCue } from "../cues/presentation-action-cues";
import { renderRemoteCardArtToCanvas } from "../cards/remote-card-art";

type Owner = 0 | 1;
type RectLike = { left: number; top: number; width: number; height: number; right: number; bottom: number };
type MotionKind = "draw" | "summon" | "cast" | "destroy" | "banish" | "return" | "move";
type PresentationDetail = {
  before: any;
  after: any;
  command: Record<string, any>;
  trace?: any[];
  commandId?: string;
  presentationId?: string;
  revision?: number;
};
type DomCard = {
  element: HTMLElement;
  rect: RectLike;
  clone: HTMLElement;
  owner: Owner;
  name: string;
  page: number;
  uid?: string;
  hp?: number;
  atk?: number;
  countElement?: HTMLElement | null;
  countRect?: RectLike | null;
  count?: number;
};
type HeroDom = { element: HTMLElement; rect: RectLike; clone: HTMLElement; life: number; lifeElement: HTMLElement | null; lifeRect: RectLike | null };
type DomSnapshot = {
  units: Map<string, DomCard>;
  hands: [DomCard[], DomCard[]];
  heroes: Map<Owner, HeroDom>;
  piles: Map<string, DomCard>;
};
type Flight = {
  kind: MotionKind;
  from: RectLike;
  to?: RectLike;
  face: HTMLElement;
  destination?: HTMLElement | null;
  delay?: number;
  targets?: RectLike[];
  uid?: string;
  sourcePlay?: boolean;
};
type PresentationReservation = {
  arrivalGate: HTMLStyleElement | null;
  stateGate: HTMLStyleElement | null;
  heldUnits: HeldStateVisual[];
};
type PresentationWindow = Window & { __hemsfellPresentationBusy?: boolean };

const ACTION_EVENT = "hemsfell:presentation-action";
const BUSY_EVENT = "hemsfell:presentation-busy";
const IDLE_EVENT = "hemsfell:presentation-idle";
const CATCH_UP_EVENT = "hemsfell:presentation-catch-up";
const EASING = "cubic-bezier(.18,.8,.28,1)";
const MAX_SEEN_COMMANDS = 256;
const MAX_FLIGHTS = 8;
const MAX_FLOATS = 8;

const rectOf = (element: Element): RectLike => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
};
const center = (rect: RectLike) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const numberText = (value: string | null | undefined) => {
  const match = String(value || "").match(/-?\d+/);
  return match ? Number(match[0]) : 0;
};
const semantic = (card: any) => `${Number(card?.page || 0)}:${String(card?.name || "")}`;
const stateId = (card: any) => String(card?.uid || card?.id || "");
const stateFields = (player: any) => [
  ...(player?.board || []),
  ...(player?.support || []),
  ...(player?.terrain ? [player.terrain] : []),
];
const unitPresentationFingerprint = (card: any) => JSON.stringify({
  damage: card?.damage,
  bonusAtk: card?.bonusAtk,
  bonusHp: card?.bonusHp,
  temporaryAtk: card?.temporaryAtk,
  temporaryHp: card?.temporaryHp,
  markers: card?.markers,
  modifiers: card?.modifiers,
  tags: card?.tags,
  temporaryTags: card?.temporaryTags,
  temporarySubtypes: card?.temporarySubtypes,
  grantedKeywords: card?.grantedKeywords,
  staticModifiers: card?.staticModifiers,
  exhausted: card?.exhausted,
  summoning: card?.summoning,
  frozen: card?.frozen,
  stunned: card?.stunned,
  suffocated: card?.suffocated,
  immobilized: card?.immobilized,
  activatedThisTurn: card?.activatedThisTurn,
  attachedTo: card?.attachedTo,
});
const sameSemanticCount = (cards: any[] = []) => {
  const counts = new Map<string, number>();
  cards.forEach((card) => counts.set(semantic(card), (counts.get(semantic(card)) || 0) + 1));
  return counts;
};
const countDelta = (before: any[] = [], after: any[] = [], key: string) => (sameSemanticCount(after).get(key) || 0) - (sameSemanticCount(before).get(key) || 0);
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
// The first animation frame runs after React's commit but before that frame is
// painted. Waiting for a second frame would let result cards flash once in
// their destination before the presentation runtime can hide them.
const afterReactCommit = nextFrame;
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function escapedSelectorValue(value: string) {
  return typeof globalThis.CSS === "undefined" ? value.replace(/["\\]/g, "\\$&") : globalThis.CSS.escape(value);
}

function addedStateIds(before: any[] = [], after: any[] = []) {
  const existing = new Set(before.map(stateId));
  return after.map(stateId).filter((id) => id && !existing.has(id));
}

function installArrivalGate(detail: PresentationDetail) {
  const selectors: string[] = [];
  for (const owner of [0, 1] as const) {
    const beforePlayer = detail.before?.players?.[owner], afterPlayer = detail.after?.players?.[owner];
    for (const uid of addedStateIds(stateFields(beforePlayer), stateFields(afterPlayer))) {
      selectors.push(`.game-stage .card-frame[data-unit-id="${escapedSelectorValue(uid)}"] > .original-card`);
    }
    for (const id of addedStateIds(beforePlayer?.hand, afterPlayer?.hand)) {
      const hand = owner === 0 ? ".player-hand" : ".opponent-hand";
      selectors.push(`.game-stage ${hand} [data-card-id="${escapedSelectorValue(id)}"]`);
    }
  }
  if (!selectors.length) return null;
  const gate = document.createElement("style");
  gate.className = "hh-prepaint-arrival-gate";
  gate.textContent = `${selectors.join(",")} { opacity: 0 !important; visibility: hidden !important; }`;
  document.head.append(gate);
  return gate;
}

function changedStateUnitIds(detail: PresentationDetail) {
  const ids = new Set<string>();
  for (const owner of [0, 1] as const) {
    const before = new Map(stateFields(detail.before?.players?.[owner]).map((card: any) => [stateId(card), card]));
    const after = new Map(stateFields(detail.after?.players?.[owner]).map((card: any) => [stateId(card), card]));
    for (const [uid, old] of before) {
      if (!uid) continue;
      const fresh = after.get(uid);
      if (!fresh || unitPresentationFingerprint(old) !== unitPresentationFingerprint(fresh)) ids.add(uid);
    }
  }
  return ids;
}

function installStateGate(detail: PresentationDetail) {
  const selectors = [...changedStateUnitIds(detail)].map((uid) =>
    `.game-stage .card-frame[data-unit-id="${escapedSelectorValue(uid)}"] > .original-card`,
  );
  if (!selectors.length) return null;
  const gate = document.createElement("style");
  gate.className = "hh-prepaint-state-gate";
  gate.textContent = `${selectors.join(",")} { opacity: 0 !important; visibility: hidden !important; }`;
  document.head.append(gate);
  return gate;
}

function freezePresentationCardMetrics(source: HTMLElement, clone: HTMLElement) {
  const sourceCard = source.matches(".original-card") ? source : source.querySelector<HTMLElement>(".original-card");
  const cloneCard = clone.matches(".original-card") ? clone : clone.querySelector<HTMLElement>(".original-card");
  if (!sourceCard || !cloneCard) return;
  const cardRect = sourceCard.getBoundingClientRect();
  if (cardRect.width <= 0 || cardRect.height <= 0) return;
  for (const selector of [".live-atk", ".live-hp"] as const) {
    const sourceNode = sourceCard.querySelector<HTMLElement>(selector);
    const cloneNode = cloneCard.querySelector<HTMLElement>(selector);
    if (!sourceNode || !cloneNode) continue;
    const rect = sourceNode.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = window.getComputedStyle(sourceNode);
    cloneNode.style.boxSizing = "border-box";
    cloneNode.style.left = `${rect.left - cardRect.left}px`;
    cloneNode.style.top = `${rect.top - cardRect.top}px`;
    cloneNode.style.right = "auto";
    cloneNode.style.bottom = "auto";
    cloneNode.style.width = `${rect.width}px`;
    cloneNode.style.height = `${rect.height}px`;
    cloneNode.style.fontSize = style.fontSize;
    cloneNode.style.lineHeight = style.lineHeight === "normal" ? "1" : style.lineHeight;
    cloneNode.style.transform = "none";
    cloneNode.style.animation = "none";
    cloneNode.style.transition = "none";
  }
}

function cloneRendered(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  const transientClasses = ["hh-presentation-hidden", "damage-hit", "is-selected", "is-impacting", "combat-attack-ready", "target-ally", "target-enemy"];
  clone.classList.remove(...transientClasses);
  clone.querySelectorAll<HTMLElement>(".damage-hit,.is-selected,.is-impacting,.combat-attack-ready,.target-ally,.target-enemy").forEach((node) => node.classList.remove(...transientClasses));
  clone.querySelectorAll<HTMLElement>(".status").forEach((node) => {
    if (node.textContent?.trim().toUpperCase() === "VIRADA") node.remove();
  });
  clone.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));
  clone.querySelectorAll<HTMLElement>("[title]").forEach((node) => node.removeAttribute("title"));
  clone.querySelectorAll<HTMLElement>("button,input,select,textarea,a").forEach((node) => {
    node.tabIndex = -1;
    node.removeAttribute("name");
  });
  const sourceCanvases = element.querySelectorAll<HTMLCanvasElement>("canvas");
  const cloneCanvases = clone.querySelectorAll<HTMLCanvasElement>("canvas");
  sourceCanvases.forEach((source, index) => {
    const target = cloneCanvases[index];
    if (!target) return;
    try {
      target.width = source.width;
      target.height = source.height;
      target.getContext("2d")?.drawImage(source, 0, 0);
    } catch {
      // A presentation clone must never affect the game if a browser refuses a canvas copy.
    }
  });
  const sourceCard = element.matches(".original-card") ? element : element.querySelector<HTMLElement>(".original-card");
  const cloneCard = clone.matches(".original-card") ? clone : clone.querySelector<HTMLElement>(".original-card");
  const turned = sourceCard?.dataset.hhPresentationOrientation === "turned" || sourceCard?.classList.contains("is-exhausted");
  if (sourceCard && cloneCard && turned) {
    const capturedWidth = Number(sourceCard.dataset.hhPresentationWidth) || sourceCard.offsetWidth;
    const capturedHeight = Number(sourceCard.dataset.hhPresentationHeight) || sourceCard.offsetHeight;
    cloneCard.dataset.hhPresentationOrientation = "turned";
    if (capturedWidth > 0 && capturedHeight > 0) {
      cloneCard.dataset.hhPresentationWidth = String(capturedWidth);
      cloneCard.dataset.hhPresentationHeight = String(capturedHeight);
      cloneCard.style.setProperty("--hh-presentation-card-width", `${capturedWidth}px`);
      cloneCard.style.setProperty("--hh-presentation-card-height", `${capturedHeight}px`);
    }
  }
  // A turned clone keeps its native badge geometry and rotates as one card.
  // Freezing screen-space badge coordinates would rotate those coordinates twice.
  if (!turned) freezePresentationCardMetrics(element, clone);
  return clone;
}

function domCard(element: HTMLElement, owner: Owner, uid?: string): DomCard {
  const rect = rectOf(element);
  return {
    element,
    rect,
    clone: cloneRendered(element),
    owner,
    uid,
    page: numberText(element.dataset.cardPage),
    name: element.dataset.cardName || element.getAttribute("aria-label") || "Carta",
    atk: element.querySelector<HTMLElement>(".live-atk") ? numberText(element.querySelector<HTMLElement>(".live-atk")?.textContent) : undefined,
    hp: element.querySelector<HTMLElement>(".live-hp") ? numberText(element.querySelector<HTMLElement>(".live-hp")?.textContent) : undefined,
  };
}

function handSnapshot(owner: Owner): DomCard[] {
  const root = document.querySelector<HTMLElement>(owner === 0 ? ".game-stage .player-hand" : ".game-stage .opponent-hand");
  if (!root) return [];
  const cards: DomCard[] = [];
  Array.from(root.children).forEach((child) => {
    const element = child.matches?.(".original-card,.opponent-card-back")
      ? child as HTMLElement
      : child.querySelector<HTMLElement>(".original-card,.opponent-card-back");
    if (!element) return;
    cards.push(element.classList.contains("original-card") ? domCard(element, owner) : {
      element,
      rect: rectOf(element),
      clone: cloneRendered(element),
      owner,
      page: 0,
      name: "Carta oculta",
    });
  });
  return cards;
}

function pileSnapshot(owner: Owner, kind: "deck" | "extra" | "grave" | "obscuro") {
  const root = owner === 0 ? ".player-piles" : ".enemy-piles";
  const className = kind === "deck" ? ".main-deck" : kind === "extra" ? ".extra-deck" : kind === "grave" ? ".grave" : ".obscuro";
  const zone = document.querySelector<HTMLElement>(`.game-stage ${root} .pile-zone${className}`);
  if (!zone) return null;
  const visual = zone.querySelector<HTMLElement>(".pile-card,.official-card-back") || zone;
  const countElement = zone.querySelector<HTMLElement>("strong");
  return {
    element: visual,
    rect: rectOf(visual),
    clone: cloneRendered(visual),
    owner,
    page: 0,
    name: kind,
    countElement,
    countRect: countElement ? rectOf(countElement) : null,
    count: numberText(countElement?.textContent),
  } as DomCard;
}

function snapshotDom(): DomSnapshot {
  const units = new Map<string, DomCard>();
  document.querySelectorAll<HTMLElement>(".game-stage .card-frame[data-unit-id]").forEach((frame) => {
    const uid = frame.dataset.unitId;
    const element = frame.querySelector<HTMLElement>(".original-card");
    if (!uid || !element) return;
    const owner: Owner = frame.closest(".enemy-field,.enemy-terrain") ? 1 : 0;
    units.set(uid, domCard(element, owner, uid));
  });
  const heroes = new Map<Owner, HeroDom>();
  document.querySelectorAll<HTMLElement>(".game-stage .player-hero").forEach((hero) => {
    const owner: Owner = hero.classList.contains("enemy") ? 1 : 0;
    const lifeElement = hero.querySelector<HTMLElement>(".hero-life");
    heroes.set(owner, {
      element: hero,
      rect: rectOf(hero),
      clone: cloneRendered(hero),
      life: numberText(lifeElement?.textContent),
      lifeElement,
      lifeRect: lifeElement ? rectOf(lifeElement) : null,
    });
  });
  const piles = new Map<string, DomCard>();
  for (const owner of [0, 1] as const) for (const kind of ["deck", "extra", "grave", "obscuro"] as const) {
    const pile = pileSnapshot(owner, kind);
    if (pile) piles.set(`${owner}:${kind}`, pile);
  }
  return { units, hands: [handSnapshot(0), handSnapshot(1)], heroes, piles };
}

function expectedUnitScore(game: any, snapshot: DomSnapshot) {
  let score = 0;
  for (const owner of [0, 1] as const) for (const card of stateFields(game?.players?.[owner])) if (card?.uid && snapshot.units.has(String(card.uid))) score += 1;
  return score;
}

function expectedUnitCount(game: any) {
  let count = 0;
  for (const owner of [0, 1] as const) for (const card of stateFields(game?.players?.[owner])) if (card?.uid) count += 1;
  return count;
}

async function committedDom(game: any) {
  await afterReactCommit();
  let snapshot = snapshotDom();
  const expected = expectedUnitCount(game);
  for (let frame = 1; frame < 6 && expectedUnitScore(game, snapshot) < expected; frame += 1) {
    await afterReactCommit();
    snapshot = snapshotDom();
  }
  return snapshot;
}

function installLayers() {
  document.querySelectorAll(".hh-motion-layer,.hh-effect-layer").forEach((node) => node.remove());
  const motion = document.createElement("div");
  motion.className = "hh-motion-layer";
  motion.setAttribute("aria-hidden", "true");
  const effect = document.createElement("div");
  effect.className = "hh-effect-layer";
  effect.setAttribute("aria-hidden", "true");
  document.body.append(motion, effect);
  return { motion, effect };
}

function createFlightFace(face: HTMLElement) {
  const wrapper = document.createElement("div");
  wrapper.className = "hh-flight-face";
  wrapper.append(face);
  return wrapper;
}

type HeldStateVisual = {
  destination: HTMLElement | null;
  overlay: HTMLElement;
  uid?: string;
  deferredDeath: boolean;
  levelUp: boolean;
  zoneTransfer: boolean;
  released: boolean;
};

function holdStateVisual(layer: HTMLElement, destination: HTMLElement | null, face: HTMLElement, rect: RectLike, uid?: string, deferredDeath = false, levelUp = false, zoneTransfer = false): HeldStateVisual {
  destination?.classList.add("hh-presentation-hidden");
  const overlay = document.createElement("div");
  overlay.className = `hh-flight-card hh-state-hold${deferredDeath ? " is-deferred-death" : ""}${levelUp ? " is-level-up-hold" : ""}`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${Math.max(1, rect.width)}px`;
  overlay.style.height = `${Math.max(1, rect.height)}px`;
  overlay.append(createFlightFace(cloneRendered(face)));
  layer.append(overlay);
  return { destination, overlay, uid, deferredDeath, levelUp, zoneTransfer, released: false };
}

function reserveChangedUnits(layer: HTMLElement, captured: DomSnapshot, detail: PresentationDetail) {
  const changed = changedStateUnitIds(detail);
  const afterIds = new Set(stateFields(detail.after?.players?.[0]).concat(stateFields(detail.after?.players?.[1])).map(stateId));
  const held: HeldStateVisual[] = [];
  for (const uid of changed) {
    const old = captured.units.get(uid);
    if (!old) continue;
    held.push(holdStateVisual(layer, old.element, old.clone, old.rect, uid, !afterIds.has(uid)));
  }
  return held;
}

function bindReservedDestinations(held: HeldStateVisual[], after: DomSnapshot) {
  for (const visual of held) {
    if (!visual.uid || visual.deferredDeath) continue;
    visual.destination = after.units.get(visual.uid)?.element || null;
    visual.destination?.classList.add("hh-presentation-hidden");
  }
}

function holdHeroLifeVisual(layer: HTMLElement, destination: HTMLElement, life: number, rect: RectLike): HeldStateVisual {
  // Damage feedback must never replace the Hero portrait with a detached clone.
  // Only the life badge is held at its exact viewport coordinates until the red
  // delta becomes readable, leaving the portrait completely stationary.
  destination.classList.add("hh-presentation-hidden");
  const overlay = document.createElement("b");
  overlay.className = "hh-hero-life-hold";
  overlay.textContent = String(life);
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${Math.max(1, rect.width)}px`;
  overlay.style.height = `${Math.max(1, rect.height)}px`;
  const style = window.getComputedStyle(destination);
  overlay.style.fontFamily = style.fontFamily;
  overlay.style.fontSize = style.fontSize;
  overlay.style.fontWeight = style.fontWeight;
  overlay.style.lineHeight = style.lineHeight;
  overlay.style.letterSpacing = style.letterSpacing;
  overlay.style.color = style.color;
  overlay.style.background = style.background;
  overlay.style.border = style.border;
  overlay.style.borderRadius = style.borderRadius;
  overlay.style.boxShadow = style.boxShadow;
  overlay.style.textShadow = style.textShadow;
  layer.append(overlay);
  return { destination, overlay, deferredDeath: false, levelUp: false, zoneTransfer: false, released: false };
}

function holdPileCountVisual(layer: HTMLElement, before: DomCard, after: DomCard): HeldStateVisual | null {
  if (!after.countElement || !before.countRect || before.count == null) return null;
  const held = holdHeroLifeVisual(layer, after.countElement, before.count, before.countRect);
  held.overlay.classList.remove("hh-hero-life-hold");
  held.overlay.classList.add("hh-pile-count-hold");
  held.zoneTransfer = true;
  return held;
}

function pileStateChanged(detail: PresentationDetail, owner: Owner, kind: "grave" | "extra") {
  const stateKey = kind === "extra" ? "extraDeck" : "grave";
  const before = detail.before?.players?.[owner]?.[stateKey] || [];
  const after = detail.after?.players?.[owner]?.[stateKey] || [];
  return JSON.stringify(before.map(stateId)) !== JSON.stringify(after.map(stateId));
}

function holdChangedState(layer: HTMLElement, before: DomSnapshot, after: DomSnapshot, detail: PresentationDetail, reserved: HeldStateVisual[] = []) {
  const held: HeldStateVisual[] = [...reserved];
  const reservedUids = new Set(reserved.map((visual) => visual.uid).filter((uid): uid is string => !!uid));
  for (const [uid, fresh] of after.units) {
    if (reservedUids.has(uid)) continue;
    const old = before.units.get(uid);
    const oldState = stateUnitById(detail.before, uid);
    const freshState = stateUnitById(detail.after, uid);
    // Statuses, markers, exhaustion, granted keywords and stat changes are all
    // player-visible effects. Keep the old rendering until the matching cue
    // has reached its readable checkpoint.
    if (!old || !oldState || !freshState || unitPresentationFingerprint(oldState) === unitPresentationFingerprint(freshState)) continue;
    held.push(holdStateVisual(layer, fresh.element, old.clone, old.rect, uid));
  }
  for (const owner of [0, 1] as const) {
    const old = before.heroes.get(owner), fresh = after.heroes.get(owner);
    const levelUp = Number(detail.after?.players?.[owner]?.level || 0) > Number(detail.before?.players?.[owner]?.level || 0);
    if (!old || !fresh) continue;
    if (levelUp) held.push(holdStateVisual(layer, fresh.element, old.clone, old.rect, undefined, false, true));
    if (old.life !== fresh.life && old.lifeRect && fresh.lifeElement) {
      held.push(holdHeroLifeVisual(layer, fresh.lifeElement, old.life, old.lifeRect));
    }
    for (const kind of ["grave", "extra"] as const) {
      if (!pileStateChanged(detail, owner, kind)) continue;
      const oldPile = before.piles.get(`${owner}:${kind}`), freshPile = after.piles.get(`${owner}:${kind}`);
      if (!oldPile || !freshPile) continue;
      held.push(holdStateVisual(layer, freshPile.element, oldPile.clone, oldPile.rect, undefined, false, false, true));
      const countHold = holdPileCountVisual(layer, oldPile, freshPile);
      if (countHold) held.push(countHold);
    }
  }
  /* A lethal target has already disappeared from React's post-command DOM.
     Keep its pre-command rendering pinned in place until the ordered death
     stage begins, so damage never looks like an unexplained teleport. */
  for (const [uid, old] of before.units) {
    if (after.units.has(uid) || reservedUids.has(uid)) continue;
    held.push(holdStateVisual(layer, null, old.clone, old.rect, uid, true));
  }
  return held;
}

function releaseHeldVisual(visual: HeldStateVisual) {
  if (visual.released) return;
  visual.released = true;
  visual.overlay.remove();
  visual.destination?.classList.remove("hh-presentation-hidden");
}

function releaseReadableState(held: HeldStateVisual[]) {
  held.filter((visual) => !visual.deferredDeath && !visual.levelUp && !visual.zoneTransfer).forEach(releaseHeldVisual);
}

function releaseLevelState(held: HeldStateVisual[], destination?: HTMLElement | null) {
  held.filter((visual) => visual.levelUp && (!destination || visual.destination === destination)).forEach(releaseHeldVisual);
}

function releaseDepartureHold(held: HeldStateVisual[], uid?: string) {
  if (!uid) return null;
  const visual = held.find((candidate) => candidate.deferredDeath && candidate.uid === uid && !candidate.released);
  if (!visual) return null;
  visual.released = true;
  visual.destination?.classList.remove("hh-presentation-hidden");
  return visual.overlay;
}

function releaseChangedState(held: HeldStateVisual[]) {
  held.forEach(releaseHeldVisual);
}

async function arrivalRing(layer: HTMLElement, rect: RectLike) {
  if (prefersReducedMotion()) return;
  const point = center(rect);
  const ring = document.createElement("i");
  ring.className = "hh-arrival-ring";
  ring.style.left = `${point.x}px`;
  ring.style.top = `${point.y}px`;
  layer.append(ring);
  await ring.animate([
    { opacity: 0, transform: "translate(-50%,-50%) scale(.25)" },
    { offset: .22, opacity: 1 },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.65)" },
  ], { duration: 360, easing: EASING }).finished.catch(() => undefined);
  ring.remove();
}

async function destructionPrelude(layer: HTMLElement, rect: RectLike) {
  if (prefersReducedMotion()) return;
  const point = center(rect);
  const ring = document.createElement("i");
  ring.className = "hh-destruction-ring";
  ring.style.left = `${point.x}px`;
  ring.style.top = `${point.y}px`;
  layer.append(ring);
  await ring.animate([
    { opacity: 0, transform: "translate(-50%,-50%) scale(.4)" },
    { offset: .28, opacity: 1, transform: "translate(-50%,-50%) scale(1)" },
    { opacity: 0, transform: "translate(-50%,-50%) scale(.1)" },
  ], { duration: 300, easing: EASING }).finished.catch(() => undefined);
  ring.remove();
}

async function banishVortex(layer: HTMLElement, rect: RectLike) {
  if (prefersReducedMotion()) return;
  const point = center(rect);
  const node = document.createElement("i");
  node.className = "hh-banish-vortex";
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  layer.append(node);
  await node.animate([
    { opacity: 0, transform: "translate(-50%,-50%) scale(.25) rotate(0deg)" },
    { offset: .2, opacity: 1 },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.25) rotate(280deg)" },
  ], { duration: 520, easing: EASING }).finished.catch(() => undefined);
  node.remove();
}

async function effectBeam(layer: HTMLElement, from: RectLike, to: RectLike) {
  if (prefersReducedMotion()) return;
  const a = center(from), b = center(to), dx = b.x - a.x, dy = b.y - a.y;
  const beam = document.createElement("i");
  beam.className = "hh-effect-beam";
  beam.style.left = `${a.x}px`;
  beam.style.top = `${a.y}px`;
  beam.style.width = `${Math.max(10, Math.hypot(dx, dy))}px`;
  beam.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  layer.append(beam);
  await beam.animate([
    { opacity: 0, clipPath: "inset(0 100% 0 0)" },
    { offset: .25, opacity: 1, clipPath: "inset(0 0 0 0)" },
    { offset: .7, opacity: 1 },
    { opacity: 0 },
  ], { duration: 420, easing: EASING }).finished.catch(() => undefined);
  beam.remove();
}


type SpellAvatar = { element: HTMLElement; from: RectLike; rect: RectLike; transform: string };

function rectWithSize(left: number, top: number, width: number, height: number): RectLike {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function spellResolutionRect(from: RectLike) {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board") || document.querySelector<HTMLElement>(".game-stage");
  const bounds = board ? rectOf(board) : rectWithSize(0, 0, window.innerWidth, window.innerHeight);
  const width = Math.max(70, Math.min(from.width * 1.08, Math.max(94, bounds.width * .115)));
  const height = width * Math.max(.8, from.height / Math.max(1, from.width));
  return rectWithSize(bounds.left + bounds.width * .5 - width / 2, bounds.top + bounds.height * .5 - height / 2, width, height);
}

function playedCardForDetail(detail: PresentationDetail) {
  const owner: Owner = Number(detail.command?.owner || 0) === 1 ? 1 : 0;
  const id = String(detail.command?.cardId || "");
  const fromHand = (detail.before?.players?.[owner]?.hand || []).find((card: any) => String(card?.id || card?.uid || "") === id);
  if (fromHand) return fromHand;
  if (detail.command?.presentationCard) return detail.command.presentationCard;
  const afterPlayer = detail.after?.players?.[owner];
  return [...stateFields(afterPlayer), ...(afterPlayer?.grave || [])].find((card: any) => stateId(card) === id);
}

async function createRevealedOpponentCardFace(card: any, width: number) {
  const face = document.createElement("button");
  face.type = "button";
  face.tabIndex = -1;
  face.className = "original-card hh-opponent-play-reveal";
  face.setAttribute("aria-label", String(card?.name || "Carta jogada pelo oponente"));
  face.dataset.cardPage = String(Number(card?.page || 0));
  face.dataset.cardName = String(card?.name || "Carta jogada pelo oponente");
  const canvas = document.createElement("canvas");
  canvas.className = "remote-card-art";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", String(card?.name || "Carta jogada pelo oponente"));
  canvas.dataset.page = String(Number(card?.page || 0));
  face.append(canvas);
  try {
    await renderRemoteCardArtToCanvas(canvas, Number(card?.page || 0), Math.max(120, width));
  } catch {
    face.classList.add("hh-opponent-play-reveal-failed");
  }
  return face;
}

async function revealOpponentPlayedCard(detail: PresentationDetail, flights: Flight[]) {
  const owner: Owner = Number(detail.command?.owner || 0) === 1 ? 1 : 0;
  if (detail.command?.type !== "playCard" || owner !== 1) return;
  const card = playedCardForDetail(detail);
  if (!card) return;
  for (const flight of flights.filter((candidate) => candidate.sourcePlay)) {
    flight.face = flight.destination
      ? cloneRendered(flight.destination)
      : await createRevealedOpponentCardFace(card, flight.from.width);
  }
}

function stateUnitById(game: any, uid: string) {
  for (const player of game?.players || []) {
    const unit = stateFields(player).find((card: any) => String(card?.uid || "") === uid);
    if (unit) return unit;
  }
  return null;
}

function robustReduction(unit: any) {
  if (!unit || unit.suffocated) return 0;
  const rules = [...(unit.tags || []), ...(unit.temporaryTags || []), ...(unit.grantedKeywords || []), unit.text || ""].join(" ");
  return /robusto/i.test(rules) ? 1 : 0;
}

function removedUnitDamage(detail: PresentationDetail, uid: string, beforeDom: DomSnapshot) {
  const target = stateUnitById(detail.before, uid);
  const reduction = robustReduction(target);
  if (detail.command?.type === "attack" && String(detail.command?.defenderId || "") === uid) {
    const attacker = beforeDom.units.get(String(detail.command?.attackerId || ""));
    return attacker?.atk != null ? Math.max(0, attacker.atk - reduction) : null;
  }
  if (detail.command?.type === "playCard" && (detail.command?.targetIds || []).map(String).includes(uid)) {
    const card = playedCardForDetail(detail);
    const match = String(card?.text || "").match(/caus(?:e|a|ar)\s+(\d+)\s+de dano/i);
    return match ? Math.max(0, Number(match[1]) - reduction) : null;
  }
  return null;
}

function uniqueRects(rects: RectLike[]) {
  const seen = new Set<string>();
  return rects.filter((rect) => {
    const point = center(rect), key = `${Math.round(point.x)}:${Math.round(point.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function changedTargetRects(detail: PresentationDetail, before: DomSnapshot, after: DomSnapshot) {
  const rects: RectLike[] = [];
  for (const [uid, old] of before.units) {
    const fresh = after.units.get(uid);
    const oldState = stateUnitById(detail.before, uid);
    const freshState = stateUnitById(detail.after, uid);
    if (!fresh || !oldState || !freshState || unitPresentationFingerprint(oldState) !== unitPresentationFingerprint(freshState)) rects.push(fresh?.rect || old.rect);
  }
  for (const owner of [0, 1] as const) {
    const old = before.heroes.get(owner), fresh = after.heroes.get(owner);
    if (old && fresh && old.life !== fresh.life) rects.push(fresh.rect);
  }
  return uniqueRects(rects);
}

async function spellChargePulse(layer: HTMLElement, rect: RectLike) {
  if (prefersReducedMotion()) return;
  const point = center(rect), node = document.createElement("i");
  node.className = "hh-spell-impact is-charge";
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  layer.append(node);
  await node.animate([
    { opacity: 0, transform: "translate(-50%,-50%) scale(.35)" },
    { offset: .35, opacity: 1, transform: "translate(-50%,-50%) scale(.9)" },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.2)" },
  ], { duration: 190, easing: EASING }).finished.catch(() => undefined);
  node.remove();
}

async function animateSpellEntry(layer: HTMLElement, effectLayer: HTMLElement, flight: Flight): Promise<SpellAvatar> {
  const to = spellResolutionRect(flight.from);
  const wrapper = document.createElement("div");
  wrapper.className = "hh-flight-card is-cast hh-spell-resolver";
  wrapper.style.left = `${flight.from.left}px`;
  wrapper.style.top = `${flight.from.top}px`;
  wrapper.style.width = `${Math.max(1, flight.from.width)}px`;
  wrapper.style.height = `${Math.max(1, flight.from.height)}px`;
  wrapper.append(createFlightFace(cloneRendered(flight.face)));
  layer.append(wrapper);
  const dx = to.left - flight.from.left + (to.width - flight.from.width) / 2;
  const dy = to.top - flight.from.top + (to.height - flight.from.height) / 2;
  const scale = Math.max(.55, Math.min(1.3, to.width / Math.max(1, flight.from.width)));
  const transform = `translate3d(${dx}px,${dy}px,0) scale(${scale})`;
  await wrapper.animate([
    { transform: "translate3d(0,0,0) scale(.92)", opacity: .2, filter: "brightness(.85)" },
    { offset: .22, transform: `translate3d(${dx * .35}px,${dy * .22 - 18}px,0) scale(1.05)`, opacity: 1, filter: "brightness(1.18)" },
    { offset: .82, transform, opacity: 1, filter: "brightness(1.45)" },
    { transform, opacity: 1, filter: "brightness(1.18)" },
  ], { duration: prefersReducedMotion() ? 120 : 540, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
  await spellChargePulse(effectLayer, to);
  return { element: wrapper, from: flight.from, rect: to, transform };
}

async function animateSpellTargeting(layer: HTMLElement, targets: RectLike[]) {
  if (!targets.length || prefersReducedMotion()) return [] as HTMLElement[];
  const nodes = targets.map((rect) => {
    const node = document.createElement("i");
    node.className = "hh-target-reticle";
    node.style.left = `${rect.left - 5}px`;
    node.style.top = `${rect.top - 5}px`;
    node.style.width = `${rect.width + 10}px`;
    node.style.height = `${rect.height + 10}px`;
    layer.append(node);
    return node;
  });
  await Promise.all(nodes.map((node) => node.animate([
    { opacity: 0, transform: "scale(1.24)" },
    { offset: .45, opacity: 1, transform: "scale(.96)" },
    { opacity: .9, transform: "scale(1)" },
  ], { duration: 330, easing: EASING, fill: "forwards" }).finished.catch(() => undefined)));
  return nodes;
}

async function spellImpactPulse(layer: HTMLElement, rect: RectLike) {
  if (prefersReducedMotion()) return;
  const point = center(rect), node = document.createElement("i");
  node.className = "hh-spell-impact";
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  layer.append(node);
  await node.animate([
    { opacity: 0, transform: "translate(-50%,-50%) scale(.18)" },
    { offset: .22, opacity: 1, transform: "translate(-50%,-50%) scale(.7)" },
    { offset: .55, opacity: .95, transform: "translate(-50%,-50%) scale(1.04)" },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.38)" },
  ], { duration: 390, easing: EASING }).finished.catch(() => undefined);
  node.remove();
}

async function animateSpellImpact(layer: HTMLElement, origin: RectLike, targets: RectLike[], reticles: HTMLElement[]) {
  if (!targets.length) {
    await spellImpactPulse(layer, origin);
  } else {
    await Promise.all(targets.map((target) => Promise.all([effectBeam(layer, origin, target), spellImpactPulse(layer, target)]).then(() => undefined)));
  }
  await Promise.all(reticles.map((node) => node.animate([{ opacity: .9 }, { opacity: 0, transform: "scale(1.08)" }], { duration: prefersReducedMotion() ? 60 : 130, easing: EASING }).finished.catch(() => undefined).then(() => node.remove())));
}

async function animateSpellExit(layer: HTMLElement, avatar: SpellAvatar, to?: RectLike) {
  const destination = to || avatar.rect;
  const dx = destination.left - avatar.from.left + (destination.width - avatar.from.width) / 2;
  const dy = destination.top - avatar.from.top + (destination.height - avatar.from.height) / 2;
  const scale = Math.max(.16, Math.min(.8, destination.width / Math.max(1, avatar.from.width)));
  await avatar.element.animate([
    { transform: avatar.transform, opacity: 1, filter: "brightness(1.18)" },
    { offset: .18, transform: avatar.transform, opacity: 1, filter: "brightness(1.45)" },
    { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale}) rotate(4deg)`, opacity: 0, filter: "brightness(.7)" },
  ], { duration: prefersReducedMotion() ? 110 : 430, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
  avatar.element.remove();
}

async function animateHeroShake(held: HeldStateVisual[], before: DomSnapshot, after: DomSnapshot) {
  const jobs: Promise<unknown>[] = [];
  for (const owner of [0, 1] as const) {
    const old = before.heroes.get(owner), fresh = after.heroes.get(owner);
    if (!old || !fresh || fresh.life >= old.life) continue;
    const visual = held.find((candidate) => candidate.destination === fresh.element && !candidate.deferredDeath);
    const node = visual?.overlay.querySelector<HTMLElement>(".hero-power-trigger")
      || fresh.element.querySelector<HTMLElement>(".hero-power-trigger")
      || visual?.overlay
      || fresh.element;
    node.classList.add("hh-hero-impact");
    const animation = node.animate([
      { transform: "translateX(0)" },
      { offset: .2, transform: "translateX(-2.5px)" },
      { offset: .4, transform: "translateX(2.5px)" },
      { offset: .62, transform: "translateX(-1.25px)" },
      { offset: .82, transform: "translateX(1.25px)" },
      { transform: "translateX(0)" },
    ], { duration: prefersReducedMotion() ? 80 : 165, easing: "ease-out" });
    jobs.push(animation.finished.catch(() => undefined).finally(() => node.classList.remove("hh-hero-impact")));
  }
  await Promise.all(jobs);
}

async function animateHeroLevelUp(layer: HTMLElement, detail: PresentationDetail, afterDom: DomSnapshot, held: HeldStateVisual[]) {
  for (const owner of [0, 1] as const) {
    const previousLevel = Number(detail.before?.players?.[owner]?.level || 0);
    const nextLevel = Number(detail.after?.players?.[owner]?.level || 0);
    if (nextLevel <= previousLevel) continue;

    const hero = afterDom.heroes.get(owner);
    const overlay = document.createElement("section");
    overlay.className = `hh-hero-level-up owner-${owner}`;
    overlay.setAttribute("aria-live", "polite");

    const panel = document.createElement("div");
    const crest = document.createElement("i");
    crest.textContent = "✦";
    const eyebrow = document.createElement("b");
    eyebrow.textContent = owner === 0 ? "ASCENSÃO DO HERÓI" : "ASCENSÃO DO HERÓI ADVERSÁRIO";
    const level = document.createElement("strong");
    level.textContent = `NÍVEL ${nextLevel}`;
    const name = document.createElement("span");
    name.textContent = hero?.element.querySelector<HTMLElement>(".hero-short-name")?.textContent?.trim()
      || String(detail.after?.players?.[owner]?.heroId || "Herói");
    panel.append(crest, eyebrow, level, name);
    overlay.append(panel);
    layer.append(overlay);

    const reduced = prefersReducedMotion();
    await overlay.animate([
      { opacity: 0, transform: "scale(.74)" },
      { offset: .72, opacity: 1, transform: "scale(1.04)" },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: reduced ? 90 : 280, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);

    // The new level becomes visible only once the central ascension cue has
    // actually appeared. Until this point the old Hero rendering stays pinned.
    releaseLevelState(held, hero?.element);
    await overlay.animate([
      { offset: 0, opacity: 1, transform: "scale(1)" },
      { offset: .7, opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.08)" },
    ], { duration: reduced ? 160 : 620, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
    overlay.remove();
  }
}

type FloatingLabelLifecycle = { readable: Promise<void>; finished: Promise<void> };

function floatingLabel(layer: HTMLElement, rect: RectLike, text: string, tone: "positive" | "negative" | "neutral"): FloatingLabelLifecycle | null {
  if (!text || layer.querySelectorAll(".hh-float").length >= MAX_FLOATS) return null;
  const point = center(rect);
  const node = document.createElement("b");
  node.className = `hh-float is-${tone}`;
  node.textContent = text;
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  layer.append(node);
  const reduced = prefersReducedMotion();
  const intro = node.animate([
    { opacity: 0, transform: "translate(-50%,4px) scale(.78)" },
    { opacity: 1, transform: "translate(-50%,-6px) scale(1.08)" },
  ], { duration: reduced ? 45 : 115, easing: EASING, fill: "forwards" });
  const readable = intro.finished.catch(() => undefined).then(() => undefined);
  const finished = readable.then(async () => {
    await node.animate([
      { opacity: 1, transform: "translate(-50%,-6px) scale(1.08)" },
      { offset: .55, opacity: 1, transform: "translate(-50%,-14px) scale(1)" },
      { opacity: 0, transform: "translate(-50%,-28px) scale(.94)" },
    ], { duration: reduced ? 90 : 285, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
    node.remove();
  });
  return { readable, finished };
}

async function animateCardMove(layer: HTMLElement, effectLayer: HTMLElement, flight: Flight, reservedWrapper: HTMLElement | null = null) {
  const reduced = prefersReducedMotion();
  const to = flight.to || flight.from;
  flight.destination?.classList.add("hh-presentation-hidden");
  const ambient: Promise<void>[] = [];
  if (flight.kind === "destroy") ambient.push(destructionPrelude(effectLayer, flight.from));
  if (flight.kind === "banish") ambient.push(banishVortex(effectLayer, to));
  const wrapper = reservedWrapper || document.createElement("div");
  wrapper.className = `hh-flight-card is-${flight.kind}`;
  wrapper.style.left = `${flight.from.left}px`;
  wrapper.style.top = `${flight.from.top}px`;
  wrapper.style.width = `${Math.max(1, flight.from.width)}px`;
  wrapper.style.height = `${Math.max(1, flight.from.height)}px`;
  if (!reservedWrapper) wrapper.append(createFlightFace(cloneRendered(flight.face)));
  if (!wrapper.isConnected) layer.append(wrapper);
  const dx = to.left - flight.from.left + (to.width - flight.from.width) / 2;
  const dy = to.top - flight.from.top + (to.height - flight.from.height) / 2;
  const scale = Math.max(.18, Math.min(1.3, to.width / Math.max(1, flight.from.width)));
  const side = dx >= 0 ? 1 : -1;
  const duration = reduced ? 120 : flight.kind === "cast" ? 760 : flight.kind === "summon" ? 560 : flight.kind === "draw" ? 420 : 430;
  const delay = reduced ? 0 : Math.max(0, flight.delay || 0);
  let keyframes: Keyframe[];
  let effectOrigin = flight.from;
  if (flight.kind === "cast") {
    const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
    const boardRect = board ? rectOf(board) : { left: 0, top: 0, width: innerWidth, height: innerHeight, right: innerWidth, bottom: innerHeight };
    effectOrigin = {
      left: boardRect.left + boardRect.width * .5 - 1,
      top: boardRect.top + boardRect.height * .5 - 1,
      width: 2,
      height: 2,
      right: boardRect.left + boardRect.width * .5 + 1,
      bottom: boardRect.top + boardRect.height * .5 + 1,
    };
    const cx = boardRect.left + boardRect.width * .5 - flight.from.left - flight.from.width / 2;
    const cy = boardRect.top + boardRect.height * .5 - flight.from.top - flight.from.height / 2;
    keyframes = [
      { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      { offset: .3, transform: `translate3d(${cx}px,${cy}px,0) scale(1.12)`, opacity: 1, filter: "brightness(1.28)" },
      { offset: .58, transform: `translate3d(${cx}px,${cy}px,0) scale(1.14)`, opacity: 1, filter: "brightness(1.5)" },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})`, opacity: .08, filter: "brightness(.8)" },
    ];
  } else if (flight.kind === "destroy" || flight.kind === "banish") {
    keyframes = [
      { transform: "translate3d(0,0,0) scale(1) rotate(0deg)", opacity: 1 },
      { offset: .28, transform: `translate3d(${dx * .16}px,${dy * .12 - 12}px,0) scale(1.04) rotate(${side * -2}deg)`, opacity: 1 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale * .7}) rotate(${side * 7}deg)`, opacity: 0 },
    ];
  } else {
    keyframes = [
      { transform: "translate3d(0,0,0) scale(1) rotate(0deg)", opacity: 1 },
      { offset: .28, transform: `translate3d(${dx * .25}px,${dy * .18 - 22}px,0) scale(1.08) rotate(${side * -2.5}deg)`, opacity: 1 },
      { offset: .86, transform: `translate3d(${dx}px,${dy}px,0) scale(${scale * .96}) rotate(${side * .8}deg)`, opacity: 1 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(${scale}) rotate(0deg)`, opacity: 1 },
    ];
  }
  const movement = wrapper.animate(keyframes, { duration, delay, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
  await Promise.all([movement, ...ambient]);
  wrapper.remove();
  flight.destination?.classList.remove("hh-presentation-hidden");
  const completion: Promise<void>[] = [];
  if (flight.destination?.isConnected && !["destroy", "banish", "cast"].includes(flight.kind)) completion.push(arrivalRing(effectLayer, rectOf(flight.destination)));
  for (const target of flight.targets || []) completion.push(effectBeam(effectLayer, effectOrigin, target));
  await Promise.all(completion);
}

function stateHandIndex(game: any, owner: Owner, id: string) {
  return (game?.players?.[owner]?.hand || []).findIndex((card: any) => String(card?.id || "") === id);
}
function fieldByUid(game: any, owner: Owner) {
  return new Map(stateFields(game?.players?.[owner]).filter((card: any) => card?.uid).map((card: any) => [String(card.uid), card]));
}
function targetRects(detail: PresentationDetail, beforeDom: DomSnapshot, afterDom: DomSnapshot) {
  const ids = [
    ...(Array.isArray(detail.command?.targetIds) ? detail.command.targetIds : []),
    detail.command?.targetId,
    detail.command?.defenderId,
  ].filter(Boolean).map(String);
  return ids.map((id) => id.endsWith("-hero")
    ? afterDom.heroes.get(id.startsWith("enemy") ? 1 : 0)?.rect || beforeDom.heroes.get(id.startsWith("enemy") ? 1 : 0)?.rect
    : afterDom.units.get(id)?.rect || beforeDom.units.get(id)?.rect).filter((rect): rect is RectLike => !!rect);
}

function buildFlights(detail: PresentationDetail, beforeDom: DomSnapshot, afterDom: DomSnapshot) {
  const flights: Flight[] = [];
  const usedDestinationUids = new Set<string>();
  const commandOwner: Owner = Number(detail.command?.owner || 0) === 1 ? 1 : 0;
  const playedId = String(detail.command?.cardId || "");
  const playedIndex = playedId ? stateHandIndex(detail.before, commandOwner, playedId) : -1;
  const playedCard = playedCardForDetail(detail);
  const opponentHandShrank = commandOwner === 1
    && (detail.before?.players?.[1]?.hand?.length || 0) > (detail.after?.players?.[1]?.hand?.length || 0);
  const fallbackOpponentSource = opponentHandShrank ? beforeDom.hands[1].at(-1) || null : null;
  const playedSource = playedIndex >= 0 ? beforeDom.hands[commandOwner][playedIndex] : fallbackOpponentSource;
  const targets = targetRects(detail, beforeDom, afterDom);

  for (const owner of [0, 1] as const) {
    const beforeFields = fieldByUid(detail.before, owner);
    const afterFields = fieldByUid(detail.after, owner);
    for (const [uid, fresh] of afterFields) {
      if (beforeFields.has(uid)) continue;
      const destination = afterDom.units.get(uid);
      if (!destination) continue;
      let source: DomCard | null = null;
      const kind: MotionKind = "summon";
      if (playedSource && owner === commandOwner && semantic(fresh) === semantic(playedCard)) source = playedSource;
      if (!source) {
        const pBefore = detail.before?.players?.[owner];
        const pAfter = detail.after?.players?.[owner];
        const key = semantic(fresh);
        if (countDelta(pBefore?.extraDeck, pAfter?.extraDeck, key) < 0 || fresh?.generatedImage || fresh?.imageCard) source = beforeDom.piles.get(`${owner}:extra`) || null;
        else if (countDelta(pBefore?.grave, pAfter?.grave, key) < 0) source = beforeDom.piles.get(`${owner}:grave`) || null;
        else if (countDelta(pBefore?.deck, pAfter?.deck, key) < 0) source = beforeDom.piles.get(`${owner}:deck`) || null;
      }
      if (source) flights.push({ kind, from: source.rect, to: destination.rect, face: source === playedSource ? source.clone : destination.clone, destination: destination.element, delay: flights.length * 55, sourcePlay: source === playedSource });
      else flights.push({ kind, from: destination.rect, to: destination.rect, face: destination.clone, destination: destination.element, delay: flights.length * 55 });
      usedDestinationUids.add(uid);
    }

    const beforePlayer = detail.before?.players?.[owner];
    const afterPlayer = detail.after?.players?.[owner];
    const beforeHandIds = new Set((beforePlayer?.hand || []).map((card: any) => String(card?.id || "")));
    (afterPlayer?.hand || []).forEach((card: any, index: number) => {
      const id = String(card?.id || "");
      if (!id || beforeHandIds.has(id)) return;
      const destination = afterDom.hands[owner][index];
      if (!destination) return;
      const key = semantic(card);
      const source = countDelta(beforePlayer?.deck, afterPlayer?.deck, key) < 0
        ? beforeDom.piles.get(`${owner}:deck`)
        : countDelta(beforePlayer?.grave, afterPlayer?.grave, key) < 0
          ? beforeDom.piles.get(`${owner}:grave`)
          : countDelta(beforePlayer?.extraDeck, afterPlayer?.extraDeck, key) < 0
            ? beforeDom.piles.get(`${owner}:extra`)
            : null;
      if (source) flights.push({ kind: "draw", from: source.rect, to: destination.rect, face: destination.clone, destination: destination.element, delay: flights.length * 55 });
    });

    for (const [uid, oldCard] of beforeFields) {
      if (afterFields.has(uid)) continue;
      const source = beforeDom.units.get(uid);
      if (!source) continue;
      const key = semantic(oldCard);
      let target = null as DomCard | null;
      let kind: MotionKind = "destroy";
      if (countDelta(beforePlayer?.obscuro, afterPlayer?.obscuro, key) > 0) { target = afterDom.piles.get(`${owner}:obscuro`) || beforeDom.piles.get(`${owner}:obscuro`) || null; kind = "banish"; }
      else if (countDelta(beforePlayer?.grave, afterPlayer?.grave, key) > 0) { target = afterDom.piles.get(`${owner}:grave`) || beforeDom.piles.get(`${owner}:grave`) || null; kind = "destroy"; }
      else if (countDelta(beforePlayer?.hand, afterPlayer?.hand, key) > 0) {
        const handIndex = (afterPlayer?.hand || []).findIndex((card: any) => semantic(card) === key);
        target = handIndex >= 0 ? afterDom.hands[owner][handIndex] : null; kind = "return";
      } else if (countDelta(beforePlayer?.extraDeck, afterPlayer?.extraDeck, key) > 0) { target = afterDom.piles.get(`${owner}:extra`) || null; kind = "return"; }
      flights.push({ kind, from: source.rect, to: target?.rect || source.rect, face: source.clone, destination: target?.element || null, delay: flights.length * 55, uid });
    }
  }

  if (detail.command?.type === "playCard" && playedCard?.type === "Feitiço" && playedSource) {
    const grave = afterDom.piles.get(`${commandOwner}:grave`) || beforeDom.piles.get(`${commandOwner}:grave`);
    if (grave) flights.unshift({ kind: "cast", from: playedSource.rect, to: grave.rect, face: playedSource.clone, targets, sourcePlay: true });
  }
  const seenFlights = new Set<string>();
  return flights.filter((flight, index) => {
    if (index >= MAX_FLIGHTS) return false;
    const to = flight.to || flight.from;
    const key = [flight.kind, flight.uid || "", Math.round(flight.from.left), Math.round(flight.from.top), Math.round(to.left), Math.round(to.top)].join(":");
    if (seenFlights.has(key)) return false;
    seenFlights.add(key);
    return true;
  });
}

async function presentDeltas(detail: PresentationDetail, beforeDom: DomSnapshot, afterDom: DomSnapshot, layer: HTMLElement, onReadable: () => void): Promise<{ completion: Promise<void> }> {
  const labels: FloatingLabelLifecycle[] = [];
  const addLabel = (label: FloatingLabelLifecycle | null) => { if (label) labels.push(label); };
  for (const [uid, fresh] of afterDom.units) {
    const old = beforeDom.units.get(uid);
    if (!old) continue;
    if (old.hp != null && fresh.hp != null && old.hp !== fresh.hp) {
      const delta = fresh.hp - old.hp;
      addLabel(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
    } else if (old.atk != null && fresh.atk != null && old.atk !== fresh.atk) {
      const delta = fresh.atk - old.atk;
      addLabel(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
    }
  }
  for (const [uid, old] of beforeDom.units) {
    if (afterDom.units.has(uid)) continue;
    const damage = removedUnitDamage(detail, uid, beforeDom);
    if (damage != null && damage > 0) addLabel(floatingLabel(layer, old.rect, `-${damage}`, "negative"));
  }
  for (const owner of [0, 1] as const) {
    const old = beforeDom.heroes.get(owner), fresh = afterDom.heroes.get(owner);
    if (!old || !fresh || old.life === fresh.life) continue;
    const delta = fresh.life - old.life;
    addLabel(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
  }
  if (!labels.length) {
    onReadable();
    return { completion: Promise.resolve() };
  }
  await Promise.all(labels.map((label) => label.readable));
  /* Release the old stat/life rendering exactly when every number has reached
     its readable keyframe. No wall-clock timeout can drift from the browser's
     actual animation timeline. */
  onReadable();
  return { completion: Promise.all(labels.map((label) => label.finished)).then(() => undefined) };
}

export default function GamePresentationRuntime() {
  useEffect(() => {
    const layers = installLayers();
    const presentationWindow = window as PresentationWindow;
    let stableDom = snapshotDom();
    let sequence: Promise<void> = Promise.resolve();
    let queued = 0;
    let refreshFrame = 0;
    const seenPresentationIds = new Set<string>();
    const seenOrder: string[] = [];
    const activeReservations = new Set<PresentationReservation>();
    let disposed = false;
    let presentationGeneration = 0;

    const setBusy = (busy: boolean) => {
      if (!!presentationWindow.__hemsfellPresentationBusy === busy) return;
      presentationWindow.__hemsfellPresentationBusy = busy;
      window.dispatchEvent(new CustomEvent(busy ? BUSY_EVENT : IDLE_EVENT));
    };
    presentationWindow.__hemsfellPresentationBusy = false;

    const rememberPresentation = (detail: PresentationDetail) => {
      const key = detail.presentationId || `${detail.revision ?? "local"}:${detail.commandId || "unknown"}`;
      if (seenPresentationIds.has(key)) return false;
      seenPresentationIds.add(key);
      seenOrder.push(key);
      while (seenOrder.length > MAX_SEEN_COMMANDS) {
        const expired = seenOrder.shift();
        if (expired) seenPresentationIds.delete(expired);
      }
      return true;
    };

    const present = async (detail: PresentationDetail, capturedDom: DomSnapshot, cue: ActionCue | null, reservation: PresentationReservation, generation: number) => {
    const { arrivalGate, stateGate, heldUnits } = reservation;
    const aborted = () => disposed || generation !== presentationGeneration || document.visibilityState === "hidden";
    const afterDom = await committedDom(detail.after);
    if (aborted()) { arrivalGate?.remove(); stateGate?.remove(); releaseChangedState(heldUnits); return; }
    const beforeDom = expectedUnitScore(detail.before, stableDom) > expectedUnitScore(detail.before, capturedDom) ? stableDom : capturedDom;
    const flights = buildFlights(detail, beforeDom, afterDom);
    await revealOpponentPlayedCard(detail, flights);
    if (aborted()) return;
    const spellFlight = flights.find((flight) => flight.kind === "cast") || null;
    const arrivals = flights.filter((flight) => flight.kind !== "destroy" && flight.kind !== "banish" && flight.kind !== "cast");
    const departures = flights.filter((flight) => flight.kind === "destroy" || flight.kind === "banish");
    // Only the card explicitly played from hand is a source arrival. Cards
    // created, drawn or recovered by an effect are results and must remain
    // hidden until the effect cue has completed.
    const sourceArrivals = detail.command?.type === "playCard" ? arrivals.filter((flight) => flight.sourcePlay) : [];
    const resultArrivals = detail.command?.type === "playCard" ? arrivals.filter((flight) => !flight.sourcePlay) : arrivals;
    bindReservedDestinations(heldUnits, afterDom);
    const heldState = holdChangedState(layers.motion, beforeDom, afterDom, detail, heldUnits);
    arrivals.forEach((flight) => flight.destination?.classList.add("hh-presentation-hidden"));
    // Destination nodes now own a persistent hidden class, so the synchronous
    // pre-paint stylesheet can be removed without exposing the resolved state.
    arrivalGate?.remove();
    let readableReleased = false;
    const releaseReadable = () => {
      if (readableReleased) return;
      readableReleased = true;
      stateGate?.remove();
      releaseReadableState(heldState);
    };

    /* A single action owns a single visual transaction. Spells use the
       strict card -> target -> impact -> number/state -> grave -> death
       pipeline. Combat resolves impact -> number/state -> death. Newly
       created/drawn result cards enter only after their cause is legible. */
    try {
      if (spellFlight) {
        const avatar = await animateSpellEntry(layers.motion, layers.effect, spellFlight);
        if (aborted()) return;
        const explicitTargets = spellFlight.targets || [];
        const reticles = await animateSpellTargeting(layers.effect, explicitTargets);
        if (aborted()) return;
        const impacts = explicitTargets.length ? explicitTargets : changedTargetRects(detail, beforeDom, afterDom);
        await animateSpellImpact(layers.effect, avatar.rect, impacts, reticles);
        if (aborted()) return;
        const heroShake = animateHeroShake(heldState, beforeDom, afterDom);
        const { completion: deltaCompletion } = await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable);
        if (aborted()) return;
        await heroShake;
        if (aborted()) return;
        await animateSpellExit(layers.motion, avatar, spellFlight.to);
        if (aborted()) return;
        for (const flight of departures) {
          const reservedWrapper = releaseDepartureHold(heldState, flight.uid);
          await animateCardMove(layers.motion, layers.effect, flight, reservedWrapper);
          if (aborted()) return;
        }
        for (const flight of resultArrivals) {
          await animateCardMove(layers.motion, layers.effect, flight);
          if (aborted()) return;
        }
        await deltaCompletion;
      } else if (cue?.kind === "combat") {
        await animateActionCue(layers.effect, cue);
        if (aborted()) return;
        const directHeroAttack = !!cue.hero && !cue.defender;
        const heroShake = directHeroAttack ? Promise.resolve() : animateHeroShake(heldState, beforeDom, afterDom);
        const { completion: deltaCompletion } = await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable);
        if (aborted()) return;
        await heroShake;
        if (aborted()) return;
        for (const flight of departures) {
          const reservedWrapper = releaseDepartureHold(heldState, flight.uid);
          await animateCardMove(layers.motion, layers.effect, flight, reservedWrapper);
          if (aborted()) return;
        }
        for (const flight of arrivals) {
          await animateCardMove(layers.motion, layers.effect, flight);
          if (aborted()) return;
        }
        await deltaCompletion;
      } else {
        for (const flight of sourceArrivals) {
          await animateCardMove(layers.motion, layers.effect, flight);
          if (aborted()) return;
        }
        if (cue?.kind === "effect") {
          await animateActionCue(layers.effect, cue);
          if (aborted()) return;
        }
        const heroShake = animateHeroShake(heldState, beforeDom, afterDom);
        const { completion: deltaCompletion } = await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable);
        if (aborted()) return;
        await heroShake;
        if (aborted()) return;
        for (const flight of departures) {
          const reservedWrapper = releaseDepartureHold(heldState, flight.uid);
          await animateCardMove(layers.motion, layers.effect, flight, reservedWrapper);
          if (aborted()) return;
        }
        for (const flight of resultArrivals) {
          await animateCardMove(layers.motion, layers.effect, flight);
          if (aborted()) return;
        }
        await deltaCompletion;
      }
      if (aborted()) return;
      await animateHeroLevelUp(layers.effect, detail, afterDom, heldState);
    } finally {
      arrivalGate?.remove();
      stateGate?.remove();
      releaseChangedState(heldState);
      arrivals.forEach((flight) => flight.destination?.classList.remove("hh-presentation-hidden"));
    }
    if (!aborted()) stableDom = afterDom;
  };

  const cancelAndSnap = () => {
      presentationGeneration += 1;
      layers.motion.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      layers.effect.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      activeReservations.forEach((reservation) => {
        reservation.arrivalGate?.remove();
        reservation.stateGate?.remove();
        releaseChangedState(reservation.heldUnits);
      });
      activeReservations.clear();
      layers.motion.replaceChildren();
      layers.effect.replaceChildren();
      document.querySelectorAll<HTMLElement>(".hh-presentation-hidden").forEach((element) => element.classList.remove("hh-presentation-hidden"));
      queued = 0;
      sequence = Promise.resolve();
      setBusy(false);
      if (refreshFrame) cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        if (!disposed) stableDom = snapshotDom();
      });
    };

  const onAction = (event: Event) => {
      const detail = (event as CustomEvent<PresentationDetail>).detail;
      if (!detail?.before || !detail?.after || !detail?.command || !rememberPresentation(detail)) return;
      if (document.visibilityState === "hidden") {
        cancelAndSnap();
        return;
      }
      const capturedDom = snapshotDom();
      const cue = captureActionCue(detail);
      // Install this synchronously, before React commits `detail.after`. A card
      // recovered from a hidden zone therefore cannot paint at its destination
      // even once before its flight begins.
      const arrivalGate = installArrivalGate(detail);
      const stateGate = installStateGate(detail);
      const heldUnits = reserveChangedUnits(layers.motion, capturedDom, detail);
      const reservation = { arrivalGate, stateGate, heldUnits };
      activeReservations.add(reservation);
      queued += 1;
      setBusy(true);
      const generation = presentationGeneration;
      sequence = sequence.catch(() => undefined).then(() => present(detail, capturedDom, cue, reservation, generation)).finally(() => {
        reservation.arrivalGate?.remove();
        reservation.stateGate?.remove();
        releaseChangedState(reservation.heldUnits);
        activeReservations.delete(reservation);
        queued = Math.max(0, queued - 1);
        if (!queued && !disposed) setBusy(false);
      });
    };
    window.addEventListener(ACTION_EVENT, onAction as EventListener);
    window.addEventListener(CATCH_UP_EVENT, cancelAndSnap);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelAndSnap();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const mutationTouchesPresentationState = (record: MutationRecord) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target || target.closest(".hh-motion-layer,.hh-effect-layer")) return false;
      const relevantSelector = ".card-frame,.player-hand,.opponent-hand,.player-hero,.player-piles,.enemy-piles,.player-field,.enemy-field,.player-terrain,.enemy-terrain";
      if (target.closest(relevantSelector)) return true;
      if (record.type !== "childList") return false;
      return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(relevantSelector) || !!node.querySelector(relevantSelector)));
    };

    const observer = new MutationObserver((records) => {
      if (queued) return;
      // Ignore clocks, logs and unrelated UI churn. Previously every text tick
      // could clone the entire board, which caused avoidable jank in long games.
      if (!records.some(mutationTouchesPresentationState) || refreshFrame) return;
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        if (!queued) stableDom = snapshotDom();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "data-unit-id"] });

    return () => {
      disposed = true;
      if (refreshFrame) cancelAnimationFrame(refreshFrame);
      observer.disconnect();
      window.removeEventListener(ACTION_EVENT, onAction as EventListener);
      window.removeEventListener(CATCH_UP_EVENT, cancelAndSnap);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      presentationWindow.__hemsfellPresentationBusy = false;
      activeReservations.forEach((reservation) => {
        reservation.arrivalGate?.remove();
        reservation.stateGate?.remove();
        releaseChangedState(reservation.heldUnits);
      });
      activeReservations.clear();
      layers.motion.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      layers.effect.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      layers.motion.remove();
      layers.effect.remove();
    };
  }, []);
  return null;
}
