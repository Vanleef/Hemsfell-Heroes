import type { AIGameState, AIObservation, BeliefDiagnostics, Particle } from "./types";

const idOf = (card: any) => String(card?.id ?? card?.uid ?? "");
const keyOf = (card: any) => String(card?.page ?? card?.name ?? card?.id ?? card?.uid ?? "unknown");
const cloneCards = (cards: any[]) => cards.map((card) => ({ ...card }));
const visibleTo = (card: any, viewer: number) => !!card?.revealed || (Array.isArray(card?.revealedTo) && card.revealedTo.includes(viewer));
const normalized = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const cardText = (card: any) => normalized(`${card?.name || ""} ${card?.text || ""} ${(card?.tags || []).join(" ")} ${(card?.subtypes || []).join(" ")}`);
const shuffle = <T,>(input: T[], random: () => number): T[] => {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const HERO_PRIORS: Record<string, RegExp[]> = {
  goblin: [/goblin/, /fura-fila/, /dano/],
  tessalia: [/recruta/, /comandante/, /ataque/],
  gimble: [/dragao/, /voar/, /barreira/],
  uruk: [/feitico/, /element/, /fogo|terra|agua|ar/],
  tifon: [/ultimo suspiro/, /sacrif/, /cemiterio/],
  saymon: [/vampiro/, /roubo de vida/, /pague .*vida|perca .*vida/],
  quarion: [/primeiro ato/, /recruta/, /copi/],
  rasmus: [/gato/, /cachorro/, /cafe/],
  ngoro: [/investig/, /pista/, /triture|furtivo/],
  zayan: [/criatura/, /marcador/, /sem efeito/],
  natureza: [/marcador/, /natureza/, /cres/],
};

const synergyValue = (heroId: string, card: any): number => {
  const text = cardText(card);
  return (HERO_PRIORS[heroId] || []).reduce((sum, rule) => sum + (rule.test(text) ? 1 : 0), 0);
};

const curvePrior = (heroId: string, hand: any[]): number => {
  if (!hand.length) return 1;
  const costs = hand.map((card) => Number(card?.cost || 0));
  const early = costs.filter((cost) => cost <= 3).length;
  const expensive = costs.filter((cost) => cost >= 6).length;
  const aggressive = ["goblin", "tessalia", "saymon"].includes(heroId);
  const desiredEarly = aggressive ? Math.ceil(hand.length * 0.55) : Math.ceil(hand.length * 0.4);
  const curveFit = 1 - Math.min(0.55, Math.abs(early - desiredEarly) * 0.08 + expensive * 0.025);
  return Math.max(0.35, curveFit);
};

const synergyPrior = (heroId: string, hand: any[]): number => {
  const score = hand.reduce((sum, card) => sum + synergyValue(heroId, card), 0);
  return 1 + Math.min(0.7, score * 0.055);
};

const matchesObservation = (card: any, observation: AIObservation): boolean => {
  if (observation.card && keyOf(card) === keyOf(observation.card)) return true;
  const wanted = observation.cardId;
  return !!wanted && idOf(card) === wanted;
};

/**
 * Particle-based hidden-information model.
 *
 * The public deck archetype supplies a prior, while observations continuously
 * condition the hidden hand/deck split. The model never reads the exact hidden
 * hand when determinizing: it only sees the known deck composition and public
 * observations.
 */
export class BeliefModel {
  private particles: Particle[] = [];
  private readonly random: () => number;
  private remainingPool = new Map<string, number>();
  private heroId = "";
  private drawsObserved = 0;
  private observations = 0;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  initialize(state: AIGameState, viewer: number, particleCount: number): void {
    const opponent = state.players[1 - viewer];
    this.heroId = String(opponent.heroId || "");
    this.drawsObserved = 0;
    this.observations = 0;
    const publicKnownHand = (opponent.hand || []).filter((card: any) => visibleTo(card, viewer));
    const hiddenHandCount = Math.max(0, (opponent.hand || []).length - publicKnownHand.length);

    // Hemsfell uses known decklists. Knowing the composition is fair public
    // information; knowing the hidden hand/deck split or order is not.
    const pool = [...(opponent.deck || []), ...(opponent.hand || []).filter((card: any) => !visibleTo(card, viewer))];
    this.remainingPool = new Map<string, number>();
    for (const card of pool) this.remainingPool.set(keyOf(card), (this.remainingPool.get(keyOf(card)) || 0) + 1);

    this.particles = Array.from({ length: Math.max(1, particleCount) }, () => {
      const permuted = shuffle(cloneCards(pool), this.random);
      const hiddenHand = permuted.slice(0, hiddenHandCount);
      return {
        hiddenHand,
        hiddenDeck: permuted.slice(hiddenHandCount),
        weight: curvePrior(this.heroId, hiddenHand) * synergyPrior(this.heroId, hiddenHand),
        synergyLikelihood: synergyPrior(this.heroId, hiddenHand),
        drawLikelihood: 1,
      };
    });
    this.normalize();
  }

  observe(observation: AIObservation): void {
    if (!this.particles.length) return;
    const count = Math.max(1, observation.count || 1);
    this.observations += 1;

    for (const particle of this.particles) {
      if (observation.type === "play" || observation.type === "discard" || observation.type === "reveal") {
        const index = particle.hiddenHand.findIndex((card) => matchesObservation(card, observation));
        if (index < 0) {
          // Keep a tiny probability so one imperfect observation does not
          // collapse the entire filter, but make impossible hands very unlikely.
          particle.weight *= 0.004;
          continue;
        }
        const observedCard = particle.hiddenHand[index];
        particle.hiddenHand.splice(index, 1);

        if (observation.type === "play") {
          const observedSynergy = synergyValue(this.heroId, observation.card || observedCard);
          if (observedSynergy > 0) {
            const related = particle.hiddenHand.reduce((sum, card) => sum + Math.min(1, synergyValue(this.heroId, card)), 0);
            particle.weight *= 1 + Math.min(0.55, observedSynergy * related * 0.025);
          }
        }
      } else if (observation.type === "draw") {
        this.drawsObserved += count;
        for (let i = 0; i < count && particle.hiddenDeck.length; i += 1) {
          const next = particle.hiddenDeck.shift();
          if (next) particle.hiddenHand.push(next);
        }
        this.applyDrawLikelihood(particle);
      } else if (observation.type === "shuffle") {
        particle.hiddenDeck = shuffle(particle.hiddenDeck, this.random);
      } else if (observation.type === "mulligan") {
        const handSize = particle.hiddenHand.length;
        const merged = [...particle.hiddenHand, ...particle.hiddenDeck];
        const next = shuffle(merged, this.random);
        particle.hiddenHand = next.slice(0, handSize);
        particle.hiddenDeck = next.slice(handSize);
        particle.weight *= curvePrior(this.heroId, particle.hiddenHand) * synergyPrior(this.heroId, particle.hiddenHand);
      }
    }

    if (["play", "discard"].includes(observation.type) && observation.card) {
      const key = keyOf(observation.card);
      const remaining = Math.max(0, (this.remainingPool.get(key) || 0) - 1);
      this.remainingPool.set(key, remaining);
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
    const publicKnownHand = (opponent.hand || []).filter((card: any) => visibleTo(card, viewer));
    opponent.hand = [...publicKnownHand, ...cloneCards(particle.hiddenHand)];
    opponent.deck = cloneCards(particle.hiddenDeck);
    return result;
  }

  entropy(): number {
    return -this.particles.reduce((sum, particle) => sum + (particle.weight > 0 ? particle.weight * Math.log2(particle.weight) : 0), 0);
  }

  diagnostics(): BeliefDiagnostics {
    const denominator = this.particles.reduce((sum, particle) => sum + particle.weight * particle.weight, 0);
    const topWeight = this.particles.reduce((best, particle) => Math.max(best, particle.weight), 0);
    return {
      entropy: this.entropy(),
      effectiveParticles: denominator > 0 ? 1 / denominator : 0,
      particleCount: this.particles.length,
      topWeight,
      remainingPool: Object.fromEntries(this.remainingPool.entries()),
    };
  }

  snapshot(): readonly Particle[] {
    return this.particles;
  }

  private applyDrawLikelihood(particle: Particle): void {
    // As more cards are drawn, hands that still contain a plausible share of
    // the archetype's early/synergy cards become more likely than hypotheses
    // where all of those cards sit implausibly deep in the remaining deck.
    const handSynergy = particle.hiddenHand.reduce((sum, card) => sum + synergyValue(this.heroId, card), 0);
    const deckEarly = particle.hiddenDeck.filter((card) => Number(card?.cost || 0) <= 2).length;
    const deckSize = Math.max(1, particle.hiddenDeck.length);
    const lateEarlyDensity = deckEarly / deckSize;
    const drawProgress = Math.min(1, this.drawsObserved / Math.max(8, this.drawsObserved + deckSize));
    const likelihood = Math.max(0.35, 1 + handSynergy * 0.025 - lateEarlyDensity * drawProgress * 0.22);
    particle.drawLikelihood = likelihood;
    particle.weight *= likelihood;
  }

  private normalize(): void {
    const total = this.particles.reduce((sum, particle) => sum + Math.max(0, particle.weight), 0) || 1;
    for (const particle of this.particles) particle.weight = Math.max(0, particle.weight) / total;
  }

  private resampleIfDegenerate(): void {
    const denominator = this.particles.reduce((sum, particle) => sum + particle.weight * particle.weight, 0);
    if (!denominator) return;
    const effective = 1 / denominator;
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
      next.push({
        hiddenHand: cloneCards(selected.hiddenHand),
        hiddenDeck: cloneCards(selected.hiddenDeck),
        weight: 1 / old.length,
        synergyLikelihood: selected.synergyLikelihood,
        drawLikelihood: selected.drawLikelihood,
      });
    }
    this.particles = next;
  }
}

export { BeliefModel as ParticleFilter };
