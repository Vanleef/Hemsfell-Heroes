"use client";

import { useEffect } from "react";

type Owner = 0 | 1;
type RectLike = { left: number; top: number; width: number; height: number; right: number; bottom: number };
type PresentationDetail = {
  before: any;
  after: any;
  command: Record<string, any>;
  commandId?: string;
  revision?: number;
};
type Cue =
  | { kind: "combat"; attacker: RectLike; defender?: RectLike; hero?: RectLike }
  | { kind: "effect"; source: RectLike; targets: RectLike[] };
type PresentationWindow = Window & { __hemsfellPresentationCueBusy?: boolean };

const ACTION_EVENT = "hemsfell:presentation-action";
const CUE_BUSY_EVENT = "hemsfell:presentation-cue-busy";
const CUE_IDLE_EVENT = "hemsfell:presentation-cue-idle";
const MAX_TARGETS = 6;
const EASING = "cubic-bezier(.18,.8,.28,1)";

const rectOf = (element: Element): RectLike => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
};
const center = (rect: RectLike) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const midpoint = (a: RectLike, b: RectLike): RectLike => {
  const ca = center(a), cb = center(b), x = (ca.x + cb.x) / 2, y = (ca.y + cb.y) / 2;
  return { left: x - 1, top: y - 1, width: 2, height: 2, right: x + 1, bottom: y + 1 };
};
const rectKey = (rect: RectLike) => `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
const uniqueRects = (rects: RectLike[]) => {
  const seen = new Set<string>();
  return rects.filter((rect) => {
    const key = rectKey(rect);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const fields = (player: any) => [...(player?.board || []), ...(player?.support || []), ...(player?.terrain ? [player.terrain] : [])];
const cardId = (card: any) => String(card?.uid || card?.id || "");
const unitState = (card: any) => JSON.stringify({
  damage: card?.damage, bonusAtk: card?.bonusAtk, bonusHp: card?.bonusHp, temporaryAtk: card?.temporaryAtk, temporaryHp: card?.temporaryHp,
  markers: card?.markers, exhausted: card?.exhausted, frozen: card?.frozen, stunned: card?.stunned,
  suffocated: card?.suffocated, immobilized: card?.immobilized, tags: card?.tags, temporaryTags: card?.temporaryTags,
  modifiers: card?.modifiers, grantedKeywords: card?.grantedKeywords,
});
const sourceIdFor = (detail: PresentationDetail) => String(
  detail.command?.sourceId
  || detail.before?.pendingDecision?.sourceId
  || detail.before?.pendingDecision?.context?.sourceId
  || detail.before?.pendingDecision?.sourceUid
  || "",
);

function unitElement(id: string) {
  for (const frame of document.querySelectorAll<HTMLElement>(".game-stage .card-frame[data-unit-id]")) {
    if (frame.dataset.unitId === id) return frame.querySelector<HTMLElement>(".original-card") || frame;
  }
  return null;
}
function heroElement(owner: Owner) {
  const selector = owner === 1 ? ".game-stage .player-hero.enemy" : ".game-stage .player-hero:not(.enemy)";
  return document.querySelector<HTMLElement>(selector);
}
function heroTargetOwner(id: string, fallback: Owner): Owner | null {
  const normalized = id.toLowerCase();
  if (!normalized.includes("hero")) return null;
  if (normalized.includes("enemy") || /hero[-_:]?1$/.test(normalized)) return 1;
  if (normalized.includes("player") || /hero[-_:]?0$/.test(normalized)) return 0;
  return fallback;
}
function targetRect(id: string, fallbackOwner: Owner): RectLike | null {
  const heroOwner = heroTargetOwner(id, fallbackOwner);
  if (heroOwner != null) {
    const hero = heroElement(heroOwner);
    return hero ? rectOf(hero) : null;
  }
  const unit = unitElement(id);
  return unit ? rectOf(unit) : null;
}

function changedTargetRects(detail: PresentationDetail, excludedIds = new Set<string>()) {
  const result: RectLike[] = [];
  for (const owner of [0, 1] as const) {
    const before = new Map(fields(detail.before?.players?.[owner]).map((card: any) => [cardId(card), card]).filter(([id]) => !!id));
    const after = new Map(fields(detail.after?.players?.[owner]).map((card: any) => [cardId(card), card]).filter(([id]) => !!id));
    for (const [id, oldCard] of before) {
      if (excludedIds.has(id)) continue;
      const fresh = after.get(id);
      if (!fresh || unitState(oldCard) === unitState(fresh)) continue;
      const element = unitElement(id);
      if (element) result.push(rectOf(element));
    }
    if (Number(detail.before?.players?.[owner]?.life) !== Number(detail.after?.players?.[owner]?.life)) {
      const hero = heroElement(owner);
      if (hero) result.push(rectOf(hero));
    }
  }
  return uniqueRects(result);
}

function explicitTargetRects(detail: PresentationDetail) {
  const owner: Owner = Number(detail.command?.owner) === 1 ? 1 : 0;
  const ids = [
    ...(Array.isArray(detail.command?.targetIds) ? detail.command.targetIds : []),
    detail.command?.targetId,
    detail.command?.defenderId,
    detail.command?.elementalTargetId,
  ].filter(Boolean).map(String);
  return uniqueRects(ids.map((id) => targetRect(id, (1 - owner) as Owner)).filter((rect): rect is RectLike => !!rect));
}

function sourceRect(detail: PresentationDetail): RectLike | null {
  const owner: Owner = Number(detail.command?.owner) === 1 ? 1 : 0;
  const sourceId = sourceIdFor(detail);
  const source = sourceId ? unitElement(sourceId) : null;
  if (source) return rectOf(source);
  const hero = heroElement(owner);
  return hero ? rectOf(hero) : null;
}

function playedCard(detail: PresentationDetail) {
  const owner: Owner = Number(detail.command?.owner) === 1 ? 1 : 0;
  const wanted = String(detail.command?.cardId || "");
  return (detail.before?.players?.[owner]?.hand || []).find((card: any) => String(card?.id || card?.uid || "") === wanted);
}

function captureCue(detail: PresentationDetail): Cue | null {
  const command = detail.command || {};
  const owner: Owner = Number(command.owner) === 1 ? 1 : 0;
  if (command.type === "attack") {
    const attacker = unitElement(String(command.attackerId || ""));
    if (!attacker) return null;
    if (!command.targetHero && command.defenderId) {
      const defender = unitElement(String(command.defenderId));
      if (defender) return { kind: "combat", attacker: rectOf(attacker), defender: rectOf(defender) };
    }
    const hero = heroElement((1 - owner) as Owner);
    return hero ? { kind: "combat", attacker: rectOf(attacker), hero: rectOf(hero) } : null;
  }
  if (["declareAttack", "selectDefender", "reposition", "confirmReposition", "surrender"].includes(String(command.type))) return null;
  if (command.type === "onlineSnapshot") return null;
  if (command.type === "playCard" && playedCard(detail)?.type === "Feitiço") return null;

  const source = sourceRect(detail);
  if (!source) return null;
  const explicit = explicitTargetRects(detail);
  const sourceIds = new Set([sourceIdFor(detail)].filter(Boolean));
  const inferred = explicit.length ? [] : changedTargetRects(detail, sourceIds);
  const selected = explicit.length ? explicit : inferred.length === 1 ? inferred : [];
  const sourceKey = rectKey(source);
  const targets = uniqueRects(selected).filter((rect) => rectKey(rect) !== sourceKey).slice(0, MAX_TARGETS);
  return targets.length ? { kind: "effect", source, targets } : null;
}

function installLayer() {
  document.querySelectorAll(".hh-action-cue-layer").forEach((node) => node.remove());
  const layer = document.createElement("div");
  layer.className = "hh-action-cue-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  return layer;
}

async function animateSword(layer: HTMLElement, from: RectLike, to: RectLike, delay = 0) {
  const a = center(from), b = center(to), dx = b.x - a.x, dy = b.y - a.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const sword = document.createElement("span");
  sword.className = "hh-combat-sword";
  sword.textContent = "🗡";
  sword.style.left = `${a.x}px`;
  sword.style.top = `${a.y}px`;
  layer.append(sword);
  const duration = prefersReducedMotion() ? 120 : 430;
  await sword.animate([
    { opacity: 0, transform: `translate(-50%,-50%) translate3d(0,0,0) rotate(${angle}deg) scale(.65)` },
    { offset: .18, opacity: 1 },
    { offset: .84, opacity: 1, transform: `translate(-50%,-50%) translate3d(${dx * .9}px,${dy * .9}px,0) rotate(${angle}deg) scale(1.08)` },
    { opacity: 0, transform: `translate(-50%,-50%) translate3d(${dx}px,${dy}px,0) rotate(${angle}deg) scale(.8)` },
  ], { duration, delay: prefersReducedMotion() ? 0 : delay, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
  sword.remove();
}

async function impact(layer: HTMLElement, rect: RectLike, kind: "combat" | "magic") {
  const point = center(rect);
  const node = document.createElement("i");
  node.className = `hh-cue-impact is-${kind}`;
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  layer.append(node);
  const duration = prefersReducedMotion() ? 110 : 280;
  await node.animate([
    { opacity: 0, transform: "translate(-50%,-50%) scale(.25)" },
    { offset: .25, opacity: 1, transform: "translate(-50%,-50%) scale(.85)" },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.45)" },
  ], { duration, easing: EASING }).finished.catch(() => undefined);
  node.remove();
}

async function animateCombat(layer: HTMLElement, cue: Extract<Cue, { kind: "combat" }>) {
  if (cue.defender) {
    const clash = midpoint(cue.attacker, cue.defender);
    await Promise.all([
      animateSword(layer, cue.attacker, clash),
      animateSword(layer, cue.defender, clash, 35),
    ]);
    await impact(layer, clash, "combat");
    return;
  }
  if (cue.hero) {
    await animateSword(layer, cue.attacker, cue.hero);
    await impact(layer, cue.hero, "combat");
  }
}

async function animateMagicProjectile(layer: HTMLElement, from: RectLike, to: RectLike, delay: number) {
  const a = center(from), b = center(to), dx = b.x - a.x, dy = b.y - a.y;
  const orb = document.createElement("i");
  orb.className = "hh-effect-orb";
  orb.style.left = `${a.x}px`;
  orb.style.top = `${a.y}px`;
  layer.append(orb);
  const duration = prefersReducedMotion() ? 120 : 460;
  await orb.animate([
    { opacity: 0, transform: "translate(-50%,-50%) translate3d(0,0,0) scale(.45)" },
    { offset: .18, opacity: 1, transform: "translate(-50%,-50%) translate3d(0,0,0) scale(1)" },
    { offset: .84, opacity: 1 },
    { opacity: 0, transform: `translate(-50%,-50%) translate3d(${dx}px,${dy}px,0) scale(.75)` },
  ], { duration, delay: prefersReducedMotion() ? 0 : delay, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
  orb.remove();
  await impact(layer, to, "magic");
}

async function animateEffect(layer: HTMLElement, cue: Extract<Cue, { kind: "effect" }>) {
  await Promise.all(cue.targets.map((target, index) => animateMagicProjectile(layer, cue.source, target, index * 45)));
}

const afterReactPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export default function GameActionCuesRuntime() {
  useEffect(() => {
    const layer = installLayer();
    const presentationWindow = window as PresentationWindow;
    const seen = new Set<string>();
    const seenOrder: string[] = [];
    let queued = 0;
    let sequence: Promise<void> = Promise.resolve();

    const setBusy = (busy: boolean) => {
      if (!!presentationWindow.__hemsfellPresentationCueBusy === busy) return;
      presentationWindow.__hemsfellPresentationCueBusy = busy;
      window.dispatchEvent(new CustomEvent(busy ? CUE_BUSY_EVENT : CUE_IDLE_EVENT));
    };
    presentationWindow.__hemsfellPresentationCueBusy = false;

    const remember = (detail: PresentationDetail) => {
      const key = `${detail.revision ?? "local"}:${detail.commandId || detail.command?.type || "action"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      seenOrder.push(key);
      while (seenOrder.length > 256) {
        const expired = seenOrder.shift();
        if (expired) seen.delete(expired);
      }
      return true;
    };

    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<PresentationDetail>).detail;
      if (!detail?.before || !detail?.after || !detail?.command || !remember(detail)) return;
      const cue = captureCue(detail);
      if (!cue) return;
      queued += 1;
      setBusy(true);
      sequence = sequence.catch(() => undefined).then(async () => {
        await afterReactPaint();
        if (cue.kind === "effect" && document.querySelector(".visual-effect.fx-ability,.visual-effect.fx-damage")) return;
        if (cue.kind === "combat") await animateCombat(layer, cue);
        else await animateEffect(layer, cue);
      }).finally(() => {
        queued = Math.max(0, queued - 1);
        if (!queued) setBusy(false);
      });
    };

    window.addEventListener(ACTION_EVENT, onAction as EventListener);
    return () => {
      window.removeEventListener(ACTION_EVENT, onAction as EventListener);
      presentationWindow.__hemsfellPresentationCueBusy = false;
      layer.remove();
    };
  }, []);

  return null;
}
