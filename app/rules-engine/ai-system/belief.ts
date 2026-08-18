import type { AIGameState, AIObservation, Particle } from "./types";

const idOf = (card: any) => String(card?.id ?? card?.uid ?? "");
const cloneCards = (cards: any[]) => cards.map((card) => ({ ...card }));
const shuffle = <T,>(input: T[], random: () => number): T[] => {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Particle-based hidden-information model.
 * Each particle is one legal hypothesis for the opponent's hand/deck split.
 * Publicly observed cards are conditioned out of inconsistent particles.
 */
export class BeliefModel {
  private particles: Particle[] = [];
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  initialize(state: AIGameState, viewer: number, particleCount: number): void {
    const opponent = state.players[1 - viewer];
    const publicKnownHand = (opponent.hand || []).filter((card: any) => card?.revealed);
    const hiddenHandCount = Math.max(0, (opponent.hand || []).length - publicKnownHand.length);
    const pool = [...(opponent.deck || []), ...(opponent.hand || []).filter((card: any) => !card?.revealed)];

    this.particles = Array.from({ length: Math.max(1, particleCount) }, () => {
      const permuted = shuffle(cloneCards(pool), this.random);
      return {
        hiddenHand: permuted.slice(0, hiddenHandCount),
        hiddenDeck: permuted.slice(hiddenHandCount),
        weight: 1,
      };
    });
    this.normalize();
  }

  observe(observation: AIObservation): void {
    if (!this.particles.length) return;
    const count = Math.max(1, observation.count || 1);

    for (const particle of this.particles) {
      if (observation.type === "play" || observation.type === "discard" || observation.type === "reveal") {
        const wanted = observation.cardId || idOf(observation.card);
        const index = wanted ? particle.hiddenHand.findIndex((card) => idOf(card) === wanted) : -1;
        if (wanted && index < 0) {
          particle.weight *= 0.02;
          continue;
        }
        if (index >= 0) particle.hiddenHand.splice(index, 1);
      } else if (observation.type === "draw") {
        for (let i = 0; i < count && particle.hiddenDeck.length; i += 1) particle.hiddenHand.push(particle.hiddenDeck.shift());
      } else if (observation.type === "shuffle") {
        particle.hiddenDeck = shuffle(particle.hiddenDeck, this.random);
      } else if (observation.type === "mulligan") {
        const merged = [...particle.hiddenHand, ...particle.hiddenDeck];
        const next = shuffle(merged, this.random);
        particle.hiddenHand = next.slice(0, particle.hiddenHand.length);
        particle.hiddenDeck = next.slice(particle.hiddenHand.length);
      }
    }

    this.normalize();
    this.resampleIfDegenerate();
  }

  sample(): Particle | null {
    if (!this.particles.length) return null;
    let roll = this.random();
    for (const particle of this.particles) {
      roll -= particle.weight;
      if (roll <= 0) return particle;
    }
    return this.particles[this.particles.length - 1];
  }

  determinize(state: AIGameState, viewer: number): AIGameState {
    const particle = this.sample();
    if (!particle) return structuredClone(state);
    const result = structuredClone(state);
    const opponent = result.players[1 - viewer];
    const publicKnownHand = (opponent.hand || []).filter((card: any) => card?.revealed);
    opponent.hand = [...publicKnownHand, ...cloneCards(particle.hiddenHand)];
    opponent.deck = cloneCards(particle.hiddenDeck);
    return result;
  }

  entropy(): number {
    return -this.particles.reduce((sum, particle) => sum + (particle.weight > 0 ? particle.weight * Math.log2(particle.weight) : 0), 0);
  }

  snapshot(): readonly Particle[] {
    return this.particles;
  }

  private normalize(): void {
    const total = this.particles.reduce((sum, particle) => sum + Math.max(0, particle.weight), 0) || 1;
    for (const particle of this.particles) particle.weight = Math.max(0, particle.weight) / total;
  }

  private resampleIfDegenerate(): void {
    const effective = 1 / this.particles.reduce((sum, particle) => sum + particle.weight * particle.weight, 0);
    if (effective >= this.particles.length * 0.45) return;
    const old = [...this.particles];
    const next: Particle[] = [];
    for (let i = 0; i < old.length; i += 1) {
      let roll = this.random();
      let selected = old[old.length - 1];
      for (const particle of old) {
        roll -= particle.weight;
        if (roll <= 0) { selected = particle; break; }
      }
      next.push({ hiddenHand: cloneCards(selected.hiddenHand), hiddenDeck: cloneCards(selected.hiddenDeck), weight: 1 / old.length });
    }
    this.particles = next;
  }
}

export { BeliefModel as ParticleFilter };
