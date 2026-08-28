"use client";

import { useEffect } from "react";
import { animateActionCue, captureActionCue, type ActionCue } from "./presentation-action-cues";

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
};
type HeroDom = { element: HTMLElement; rect: RectLike; clone: HTMLElement; life: number };
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
};
type PresentationWindow = Window & { __hemsfellPresentationBusy?: boolean };

const ACTION_EVENT = "hemsfell:presentation-action";
const BUSY_EVENT = "hemsfell:presentation-busy";
const IDLE_EVENT = "hemsfell:presentation-idle";
const EASING = "cubic-bezier(.18,.8,.28,1)";
const MAX_SEEN_COMMANDS = 256;
const MAX_FLIGHTS = 8;
const MAX_FLOATS = 12;

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
const sameSemanticCount = (cards: any[] = []) => {
  const counts = new Map<string, number>();
  cards.forEach((card) => counts.set(semantic(card), (counts.get(semantic(card)) || 0) + 1));
  return counts;
};
const countDelta = (before: any[] = [], after: any[] = [], key: string) => (sameSemanticCount(after).get(key) || 0) - (sameSemanticCount(before).get(key) || 0);
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const afterReactPaint = async () => { await nextFrame(); await nextFrame(); };
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function cloneRendered(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.classList.remove("hh-presentation-hidden", "damage-hit", "is-selected");
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
  return clone;
}

function domCard(element: HTMLElement, owner: Owner, uid?: string): DomCard {
  return {
    element,
    rect: rectOf(element),
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
  return { element: visual, rect: rectOf(visual), clone: cloneRendered(visual), owner, page: 0, name: kind } as DomCard;
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
    heroes.set(owner, { element: hero, rect: rectOf(hero), clone: cloneRendered(hero), life: numberText(hero.querySelector<HTMLElement>(".hero-life")?.textContent) });
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

type HeldStateVisual = { destination: HTMLElement; overlay: HTMLElement };

function holdStateVisual(layer: HTMLElement, destination: HTMLElement, face: HTMLElement, rect: RectLike): HeldStateVisual {
  destination.classList.add("hh-presentation-hidden");
  const overlay = document.createElement("div");
  overlay.className = "hh-flight-card hh-state-hold";
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${Math.max(1, rect.width)}px`;
  overlay.style.height = `${Math.max(1, rect.height)}px`;
  overlay.append(createFlightFace(cloneRendered(face)));
  layer.append(overlay);
  return { destination, overlay };
}

function holdChangedState(layer: HTMLElement, before: DomSnapshot, after: DomSnapshot) {
  const held: HeldStateVisual[] = [];
  for (const [uid, fresh] of after.units) {
    const old = before.units.get(uid);
    if (!old || old.hp === fresh.hp && old.atk === fresh.atk) continue;
    held.push(holdStateVisual(layer, fresh.element, old.clone, old.rect));
  }
  for (const owner of [0, 1] as const) {
    const old = before.heroes.get(owner), fresh = after.heroes.get(owner);
    if (!old || !fresh || old.life === fresh.life) continue;
    held.push(holdStateVisual(layer, fresh.element, old.clone, old.rect));
  }
  return held;
}

function releaseChangedState(held: HeldStateVisual[]) {
  for (const visual of held) {
    visual.overlay.remove();
    visual.destination.classList.remove("hh-presentation-hidden");
  }
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

async function floatingLabel(layer: HTMLElement, rect: RectLike, text: string, tone: "positive" | "negative" | "neutral") {
  if (!text || layer.querySelectorAll(".hh-float").length >= MAX_FLOATS) return;
  const point = center(rect);
  const node = document.createElement("b");
  node.className = `hh-float is-${tone}`;
  node.textContent = text;
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  layer.append(node);
  const duration = prefersReducedMotion() ? 140 : 620;
  await node.animate([
    { opacity: 0, transform: "translate(-50%,4px) scale(.75)" },
    { offset: .2, opacity: 1, transform: "translate(-50%,-6px) scale(1.1)" },
    { offset: .7, opacity: 1, transform: "translate(-50%,-18px) scale(1)" },
    { opacity: 0, transform: "translate(-50%,-34px) scale(.94)" },
  ], { duration, easing: EASING }).finished.catch(() => undefined);
  node.remove();
}

async function animateCardMove(layer: HTMLElement, effectLayer: HTMLElement, flight: Flight) {
  const reduced = prefersReducedMotion();
  const to = flight.to || flight.from;
  flight.destination?.classList.add("hh-presentation-hidden");
  const ambient: Promise<void>[] = [];
  if (flight.kind === "destroy") ambient.push(destructionPrelude(effectLayer, flight.from));
  if (flight.kind === "banish") ambient.push(banishVortex(effectLayer, to));
  const wrapper = document.createElement("div");
  wrapper.className = `hh-flight-card is-${flight.kind}`;
  wrapper.style.left = `${flight.from.left}px`;
  wrapper.style.top = `${flight.from.top}px`;
  wrapper.style.width = `${Math.max(1, flight.from.width)}px`;
  wrapper.style.height = `${Math.max(1, flight.from.height)}px`;
  wrapper.append(createFlightFace(cloneRendered(flight.face)));
  layer.append(wrapper);
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
function targetRects(detail: PresentationDetail, afterDom: DomSnapshot) {
  const ids = [
    ...(Array.isArray(detail.command?.targetIds) ? detail.command.targetIds : []),
    detail.command?.targetId,
    detail.command?.defenderId,
  ].filter(Boolean).map(String);
  return ids.map((id) => id.endsWith("-hero")
    ? afterDom.heroes.get(id.startsWith("enemy") ? 1 : 0)?.rect
    : afterDom.units.get(id)?.rect).filter((rect): rect is RectLike => !!rect);
}

function buildFlights(detail: PresentationDetail, beforeDom: DomSnapshot, afterDom: DomSnapshot) {
  const flights: Flight[] = [];
  const usedDestinationUids = new Set<string>();
  const commandOwner: Owner = Number(detail.command?.owner || 0) === 1 ? 1 : 0;
  const playedId = String(detail.command?.cardId || "");
  const playedIndex = playedId ? stateHandIndex(detail.before, commandOwner, playedId) : -1;
  const playedCard = playedIndex >= 0 ? detail.before?.players?.[commandOwner]?.hand?.[playedIndex] : null;
  const playedSource = playedIndex >= 0 ? beforeDom.hands[commandOwner][playedIndex] : null;
  const targets = targetRects(detail, afterDom);

  for (const owner of [0, 1] as const) {
    const beforeFields = fieldByUid(detail.before, owner);
    const afterFields = fieldByUid(detail.after, owner);
    for (const [uid, fresh] of afterFields) {
      if (beforeFields.has(uid)) continue;
      const destination = afterDom.units.get(uid);
      if (!destination) continue;
      let source: DomCard | null = null;
      let kind: MotionKind = "summon";
      if (playedSource && owner === commandOwner && semantic(fresh) === semantic(playedCard)) source = playedSource;
      if (!source) {
        const pBefore = detail.before?.players?.[owner];
        const pAfter = detail.after?.players?.[owner];
        const key = semantic(fresh);
        if (countDelta(pBefore?.extraDeck, pAfter?.extraDeck, key) < 0 || fresh?.generatedImage || fresh?.imageCard) source = beforeDom.piles.get(`${owner}:extra`) || null;
        else if (countDelta(pBefore?.grave, pAfter?.grave, key) < 0) source = beforeDom.piles.get(`${owner}:grave`) || null;
        else if (countDelta(pBefore?.deck, pAfter?.deck, key) < 0) source = beforeDom.piles.get(`${owner}:deck`) || null;
      }
      if (source) flights.push({ kind, from: source.rect, to: destination.rect, face: source === playedSource ? source.clone : destination.clone, destination: destination.element, delay: flights.length * 55 });
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
      flights.push({ kind, from: source.rect, to: target?.rect || source.rect, face: source.clone, destination: target?.element || null, delay: flights.length * 55 });
    }
  }

  if (detail.command?.type === "playCard" && playedCard?.type === "Feitiço" && playedSource) {
    const grave = afterDom.piles.get(`${commandOwner}:grave`) || beforeDom.piles.get(`${commandOwner}:grave`);
    if (grave) flights.unshift({ kind: "cast", from: playedSource.rect, to: grave.rect, face: playedSource.clone, targets });
  }
  return flights.filter((flight, index, all) => {
    if (index >= MAX_FLIGHTS) return false;
    if (flight.kind !== "summon") return true;
    const duplicate = all.slice(0, index).some((candidate) => candidate.kind === "summon" && candidate.from.left === flight.from.left && candidate.to?.left === flight.to?.left && candidate.to?.top === flight.to?.top);
    return !duplicate;
  });
}

async function presentDeltas(beforeDom: DomSnapshot, afterDom: DomSnapshot, layer: HTMLElement) {
  const labels: Promise<void>[] = [];
  for (const [uid, fresh] of afterDom.units) {
    const old = beforeDom.units.get(uid);
    if (!old) continue;
    if (old.hp != null && fresh.hp != null && old.hp !== fresh.hp) {
      const delta = fresh.hp - old.hp;
      labels.push(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
    } else if (old.atk != null && fresh.atk != null && old.atk !== fresh.atk) {
      const delta = fresh.atk - old.atk;
      labels.push(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
    }
  }
  for (const owner of [0, 1] as const) {
    const old = beforeDom.heroes.get(owner), fresh = afterDom.heroes.get(owner);
    if (!old || !fresh || old.life === fresh.life) continue;
    const delta = fresh.life - old.life;
    labels.push(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
  }
  await Promise.all(labels);
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
    let disposed = false;

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

    const present = async (detail: PresentationDetail, capturedDom: DomSnapshot, cue: ActionCue | null) => {
      await afterReactPaint();
      if (disposed) return;
      const afterDom = snapshotDom();
      const beforeDom = expectedUnitScore(detail.before, stableDom) > expectedUnitScore(detail.before, capturedDom) ? stableDom : capturedDom;
      const flights = buildFlights(detail, beforeDom, afterDom);
      const arrivals = flights.filter((flight) => flight.kind !== "destroy" && flight.kind !== "banish");
      const departures = flights.filter((flight) => flight.kind === "destroy" || flight.kind === "banish");
      const heldState = holdChangedState(layers.motion, beforeDom, afterDom);

      /* One action owns one ordered visual transaction:
         1. combat declaration impact, or card arrival/cast;
         2. targeted ability cue;
         3. destruction/banishment caused by that cue;
         4. numeric state deltas.
         Every animation is awaited, so idle cannot be emitted while a child
         animation from the same action is still visible. */
      try {
        if (cue?.kind === "combat") await animateActionCue(layers.effect, cue);
        for (const flight of arrivals) await animateCardMove(layers.motion, layers.effect, flight);
        if (cue?.kind === "effect") await animateActionCue(layers.effect, cue);
        for (const flight of departures) await animateCardMove(layers.motion, layers.effect, flight);
      } finally {
        releaseChangedState(heldState);
      }
      await presentDeltas(beforeDom, afterDom, layers.effect);
      stableDom = snapshotDom();
    };

    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<PresentationDetail>).detail;
      if (!detail?.before || !detail?.after || !detail?.command || !rememberPresentation(detail)) return;
      const capturedDom = snapshotDom();
      const cue = captureActionCue(detail);
      queued += 1;
      setBusy(true);
      sequence = sequence.catch(() => undefined).then(() => present(detail, capturedDom, cue)).finally(() => {
        queued = Math.max(0, queued - 1);
        if (!queued && !disposed) setBusy(false);
      });
    };
    window.addEventListener(ACTION_EVENT, onAction as EventListener);

    const observer = new MutationObserver((records) => {
      if (queued) return;
      const relevant = records.some((record) => !(record.target instanceof Element && record.target.closest(".hh-motion-layer,.hh-effect-layer")));
      if (!relevant || refreshFrame) return;
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
      presentationWindow.__hemsfellPresentationBusy = false;
      layers.motion.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      layers.effect.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      layers.motion.remove();
      layers.effect.remove();
    };
  }, []);
  return null;
}
