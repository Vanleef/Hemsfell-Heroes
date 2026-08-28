type Owner = 0 | 1;

type CardLike = {
  uid?: unknown;
  id?: unknown;
  type?: unknown;
  damage?: unknown;
  bonusAtk?: unknown;
  bonusHp?: unknown;
  temporaryAtk?: unknown;
  temporaryHp?: unknown;
  markers?: unknown;
  exhausted?: unknown;
  frozen?: unknown;
  stunned?: unknown;
  suffocated?: unknown;
  immobilized?: unknown;
  tags?: unknown;
  temporaryTags?: unknown;
  modifiers?: unknown;
  grantedKeywords?: unknown;
};

type PlayerLike = {
  board?: CardLike[];
  support?: CardLike[];
  terrain?: CardLike | null;
  hand?: CardLike[];
  life?: unknown;
};

type GameLike = {
  players?: PlayerLike[];
  pendingDecision?: {
    sourceId?: unknown;
    sourceUid?: unknown;
    context?: { sourceId?: unknown };
  };
};

type CommandLike = Record<string, unknown> & {
  type?: unknown;
  owner?: unknown;
  sourceId?: unknown;
  cardId?: unknown;
  targetIds?: unknown[];
  targetId?: unknown;
  defenderId?: unknown;
  elementalTargetId?: unknown;
  attackerId?: unknown;
  targetHero?: unknown;
};

export type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type PresentationActionDetail = {
  before: GameLike;
  after: GameLike;
  command: CommandLike;
  commandId?: string;
  presentationId?: string;
  revision?: number;
};

export type ActionCue =
  | { kind: "combat"; attacker: RectLike; defender?: RectLike; hero?: RectLike }
  | { kind: "effect"; source: RectLike; targets: RectLike[] };

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
const fields = (player?: PlayerLike) => [...(player?.board || []), ...(player?.support || []), ...(player?.terrain ? [player.terrain] : [])];
const cardId = (card: CardLike) => String(card?.uid || card?.id || "");
const unitState = (card: CardLike) => JSON.stringify({
  damage: card?.damage,
  bonusAtk: card?.bonusAtk,
  bonusHp: card?.bonusHp,
  temporaryAtk: card?.temporaryAtk,
  temporaryHp: card?.temporaryHp,
  markers: card?.markers,
  exhausted: card?.exhausted,
  frozen: card?.frozen,
  stunned: card?.stunned,
  suffocated: card?.suffocated,
  immobilized: card?.immobilized,
  tags: card?.tags,
  temporaryTags: card?.temporaryTags,
  modifiers: card?.modifiers,
  grantedKeywords: card?.grantedKeywords,
});
const sourceIdFor = (detail: PresentationActionDetail) => String(
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
  if (normalized.includes("player") || normalized.includes("ally") || /hero[-_:]?0$/.test(normalized)) return 0;
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

function changedTargetRects(detail: PresentationActionDetail, excludedIds = new Set<string>()) {
  const result: RectLike[] = [];
  for (const owner of [0, 1] as const) {
    const before = new Map<string, CardLike>();
    const after = new Map<string, CardLike>();
    for (const card of fields(detail.before?.players?.[owner])) {
      const id = cardId(card);
      if (id) before.set(id, card);
    }
    for (const card of fields(detail.after?.players?.[owner])) {
      const id = cardId(card);
      if (id) after.set(id, card);
    }
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

function explicitTargetRects(detail: PresentationActionDetail) {
  const owner: Owner = Number(detail.command?.owner) === 1 ? 1 : 0;
  const ids = [
    ...(Array.isArray(detail.command?.targetIds) ? detail.command.targetIds : []),
    detail.command?.targetId,
    detail.command?.defenderId,
    detail.command?.elementalTargetId,
  ].filter(Boolean).map(String);
  return uniqueRects(ids.map((id) => targetRect(id, (1 - owner) as Owner)).filter((rect): rect is RectLike => !!rect));
}

function sourceRect(detail: PresentationActionDetail): RectLike | null {
  const owner: Owner = Number(detail.command?.owner) === 1 ? 1 : 0;
  const sourceId = sourceIdFor(detail);
  const source = sourceId ? unitElement(sourceId) : null;
  if (source) return rectOf(source);
  const hero = heroElement(owner);
  return hero ? rectOf(hero) : null;
}

function playedCard(detail: PresentationActionDetail) {
  const owner: Owner = Number(detail.command?.owner) === 1 ? 1 : 0;
  const wanted = String(detail.command?.cardId || "");
  return (detail.before?.players?.[owner]?.hand || []).find((card) => String(card?.id || card?.uid || "") === wanted);
}

export function captureActionCue(detail: PresentationActionDetail): ActionCue | null {
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
  if (["declareAttack", "selectDefender", "reposition", "confirmReposition", "surrender", "onlineSnapshot"].includes(String(command.type))) return null;
  if (command.type === "playCard" && playedCard(detail)?.type === "Feitiço") return null;

  const source = sourceRect(detail);
  if (!source) return null;
  const explicit = explicitTargetRects(detail);
  const sourceIds = new Set([sourceIdFor(detail)].filter(Boolean));
  const canInferTargets = ["playCard", "activate", "activateHero", "resolveDecision"].includes(String(command.type));
  const inferred = explicit.length || !canInferTargets ? [] : changedTargetRects(detail, sourceIds);
  const selected = explicit.length ? explicit : inferred.length <= MAX_TARGETS ? inferred : [];
  const sourceKey = rectKey(source);
  const targets = uniqueRects(selected).filter((rect) => rectKey(rect) !== sourceKey).slice(0, MAX_TARGETS);
  return targets.length ? { kind: "effect", source, targets } : null;
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

export async function animateActionCue(layer: HTMLElement, cue: ActionCue) {
  if (cue.kind === "effect") {
    await Promise.all(cue.targets.map((target, index) => animateMagicProjectile(layer, cue.source, target, index * 45)));
    return;
  }
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
    // Direct Hero attacks intentionally stop at the sword contact. The Hero
    // never moves; the red life delta is owned by GamePresentationRuntime.
    await animateSword(layer, cue.attacker, cue.hero);
  }
}
