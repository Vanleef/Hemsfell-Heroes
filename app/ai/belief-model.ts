import type { AICard, AIGameState, BeliefObservation, BeliefParticle, PlayerId } from "./types";

const cloneCard = (card: AICard): AICard => structuredClone(card);
const identityKey = (card: AICard): string => `${card.page ?? ""}:${card.name}:${card.type}:${card.cost}`;

function shuffle<T>(source: readonly T[], random: () => number): T[] {
  const out = [...source];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

function removeOne(cards: AICard[], target: AICard): boolean {
  const exact = cards.findIndex(card => card.id === target.id || (!!target.uid && card.uid === target.uid));
  const index = exact >= 0 ? exact : cards.findIndex(card => identityKey(card) === identityKey(target));
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

export class ParticleFilter {
  private particles: BeliefParticle[] = [];
  private readonly observer: PlayerId;
  private readonly opponent: PlayerId;
  private particleCount: number;
  private random: () => number;
  private handSize = 0;
  private deckSize = 0;

  constructor(observer: PlayerId, particleCount = 24, random: () => number = Math.random) {
    this.observer = observer;
    this.opponent = observer === 0 ? 1 : 0;
    this.particleCount = Math.max(1, particleCount);
    this.random = random;
  }

  setParticleCount(count: number): void {
    this.particleCount = Math.max(1, Math.floor(count));
    if (this.particles.length > this.particleCount) this.particles.length = this.particleCount;
  }

  initialize(state: AIGameState): void {
    const hidden = state.players[this.opponent];
    this.handSize = hidden.hand.length;
    this.deckSize = hidden.deck.length;
    const unknownPool = [...hidden.hand, ...hidden.deck].map(cloneCard);
    const revealedHand = hidden.hand.filter(card => card.revealed || card.revealedTo?.includes(this.observer)).map(cloneCard);

    this.particles = Array.from({ length: this.particleCount }, () => {
      const pool = [...unknownPool];
      for (const known of revealedHand) removeOne(pool, known);
      const randomPool = shuffle(pool, this.random);
      const hiddenSlots = Math.max(0, this.handSize - revealedHand.length);
      return {
        hand: [...revealedHand.map(cloneCard), ...randomPool.slice(0, hiddenSlots)],
        deck: randomPool.slice(hiddenSlots, hiddenSlots + this.deckSize),
        weight: 1 / this.particleCount,
      };
    });
  }

  observe(observation: BeliefObservation): void {
    if (observation.type === "public-snapshot") {
      const entry = observation.state.players[this.opponent];
      this.handSize = entry.hand.length;
      this.deckSize = entry.deck.length;
      if (!this.particles.length) this.initialize(observation.state);
      this.enforceCounts(entry.hand.filter(card => card.revealed || card.revealedTo?.includes(this.observer)));
      return;
    }
    if (observation.player !== this.opponent || !this.particles.length) return;

    switch (observation.type) {
      case "played":
        this.handSize = Math.max(0, this.handSize - 1);
        for (const particle of this.particles) if (!removeOne(particle.hand, observation.card)) particle.weight *= 0.02;
        break;
      case "discarded":
        this.handSize = Math.max(0, this.handSize - 1);
        for (const particle of this.particles) {
          if (observation.card) {
            if (!removeOne(particle.hand, observation.card)) particle.weight *= 0.04;
          } else if (particle.hand.length) particle.hand.splice(Math.floor(this.random() * particle.hand.length), 1);
        }
        break;
      case "drawn": {
        const amount = Math.max(1, observation.count ?? 1);
        this.handSize += amount;
        this.deckSize = Math.max(0, this.deckSize - amount);
        for (const particle of this.particles) for (let draw = 0; draw < amount && particle.deck.length; draw += 1) particle.hand.push(particle.deck.shift()!);
        break;
      }
      case "revealed":
        for (const particle of this.particles) {
          const source = observation.zone === "deck" ? particle.deck : particle.hand;
          if (!source.some(card => identityKey(card) === identityKey(observation.card))) particle.weight *= 0.08;
        }
        break;
      case "shuffled":
        for (const particle of this.particles) particle.deck = shuffle(particle.deck, this.random);
        break;
      case "mulligan":
        this.handSize = observation.handSize;
        for (const particle of this.particles) {
          const pool = shuffle([...particle.hand, ...particle.deck], this.random);
          particle.hand = pool.slice(0, this.handSize);
          particle.deck = pool.slice(this.handSize);
        }
        break;
      default:
        break;
    }
    this.normalizeAndResample();
  }

  sample(): BeliefParticle | null {
    if (!this.particles.length) return null;
    let roll = this.random();
    for (const particle of this.particles) {
      roll -= particle.weight;
      if (roll <= 0) return { hand: particle.hand.map(cloneCard), deck: particle.deck.map(cloneCard), weight: particle.weight };
    }
    const fallback = this.particles[this.particles.length - 1];
    return { hand: fallback.hand.map(cloneCard), deck: fallback.deck.map(cloneCard), weight: fallback.weight };
  }

  determinize(state: AIGameState): AIGameState {
    const next = structuredClone(state);
    const particle = this.sample();
    if (!particle) return next;
    next.players[this.opponent].hand = particle.hand.map(cloneCard);
    next.players[this.opponent].deck = particle.deck.map(cloneCard);
    return next;
  }

  snapshot(): readonly BeliefParticle[] {
    return this.particles;
  }

  private enforceCounts(revealed: AICard[]): void {
    for (const particle of this.particles) {
      const pool = [...particle.hand, ...particle.deck];
      for (const known of revealed) {
        const inHand = particle.hand.some(card => identityKey(card) === identityKey(known));
        if (!inHand && removeOne(pool, known)) particle.hand.push(cloneCard(known));
      }
      const all = shuffle([...particle.hand, ...particle.deck], this.random);
      const knownKeys = new Set(revealed.map(identityKey));
      const known = all.filter(card => knownKeys.has(identityKey(card))).slice(0, revealed.length);
      const unknown = all.filter(card => !knownKeys.has(identityKey(card)));
      particle.hand = [...known, ...unknown.slice(0, Math.max(0, this.handSize - known.length))];
      particle.deck = unknown.slice(Math.max(0, this.handSize - known.length), Math.max(0, this.handSize - known.length) + this.deckSize);
    }
    this.normalizeAndResample();
  }

  private normalizeAndResample(): void {
    let total = this.particles.reduce((sum, particle) => sum + Math.max(0, particle.weight), 0);
    if (total <= 1e-9) {
      for (const particle of this.particles) particle.weight = 1 / this.particles.length;
      total = 1;
    } else for (const particle of this.particles) particle.weight /= total;

    const effective = 1 / this.particles.reduce((sum, particle) => sum + particle.weight * particle.weight, 0);
    if (effective >= this.particles.length * 0.52) return;

    const cumulative: number[] = [];
    this.particles.reduce((sum, particle, index) => (cumulative[index] = sum + particle.weight), 0);
    const step = 1 / this.particleCount;
    let cursor = this.random() * step;
    const resampled: BeliefParticle[] = [];
    let source = 0;
    for (let index = 0; index < this.particleCount; index += 1, cursor += step) {
      while (source < cumulative.length - 1 && cursor > cumulative[source]) source += 1;
      const particle = this.particles[source];
      resampled.push({ hand: particle.hand.map(cloneCard), deck: shuffle(particle.deck, this.random), weight: step });
    }
    this.particles = resampled;
  }
}

export class BeliefModel extends ParticleFilter {}
