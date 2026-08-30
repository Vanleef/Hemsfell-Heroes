import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { canExecuteCard } from "../app/rules-engine/engine.mjs";
import { defaultAIAdapter } from "../app/rules-engine/ai-system/controller";
import { runSelfPlayBatch } from "../app/rules-engine/ai-system/selfplay";
import type { AIDifficulty, AIGameState, EngineAdapter } from "../app/rules-engine/ai-system/types";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const allowed: AIDifficulty[] = ["Easy", "Normal", "Hard", "Expert", "Master"];
const difficulty = (name: string, fallback: AIDifficulty): AIDifficulty => {
  const value = arg(name) as AIDifficulty | undefined;
  return value && allowed.includes(value) ? value : fallback;
};

async function main() {
  const games = Math.max(1, Number(arg("games") || 20));
  const maxPlies = Math.max(20, Number(arg("plies") || 220));
  const seed = Number(arg("seed") || 20260818);
  const hero0 = arg("hero0") || "goblin";
  const hero1 = arg("hero1") || "tifon";
  const difficulty0 = difficulty("difficulty0", "Hard");
  const difficulty1 = difficulty("difficulty1", "Hard");
  const outDir = resolve(arg("out") || "reports/ai");

  const rawCards = JSON.parse(await readFile(resolve(process.cwd(), "app/data/catalog/cards.generated.json"), "utf8"));
  const catalog = rawCards.map(compileCard);
  const pool = catalog.filter((card: any) => !card.hero && !card.imageCard && canExecuteCard(card));
  const imagePool = catalog.filter((card: any) => card.imageCard);

  const makeDeck = (random: () => number, gameIndex: number, owner: number) => Array.from({ length: 49 }, (_, index) => {
    const base = structuredClone(pool[Math.floor(random() * pool.length)]);
    return { ...base, id: `${base.id}-sp-${gameIndex}-${owner}-${index}`, simulationBaseId: base.id };
  });

  const createState = (gameIndex: number, random: () => number): AIGameState => ({
    active: 0,
    phase: "principal",
    round: 1,
    winner: null,
    cardCatalog: catalog,
    players: [hero0, hero1].map((heroId, owner) => {
      const deck = makeDeck(random, gameIndex, owner);
      return {
        heroId,
        level: 1,
        heroXP: 0,
        markers: {},
        life: 30,
        maxLife: 30,
        energy: 1,
        maxEnergy: 1,
        reserve: 0,
        deck: deck.slice(7),
        hand: deck.slice(0, 7),
        extraDeck: structuredClone(imagePool),
        board: [],
        support: [],
        terrain: null,
        grave: [],
        obscuro: [],
        abilityUses: {},
        turnCardsPlayed: 0,
        turnSpellsPlayed: 0,
        spellsPlayed: 0,
      };
    }),
  });

  const adapter: EngineAdapter = {
    ...defaultAIAdapter,
    applyAction(state, action) {
      const next = defaultAIAdapter.applyAction(state, action);
      if (action.type === "advancePhase" && next.phase === "manutencao") {
        const entry = next.players[next.active];
        entry.maxEnergy = Math.min(10, Number(entry.maxEnergy || 0) + 1);
        entry.energy = entry.maxEnergy;
        const drawn = entry.deck.shift();
        if (drawn && entry.hand.length < 10) entry.hand.push(drawn);
        else if (!drawn) entry.deckOut = true;
      }
      return next;
    },
  };

  let lastProgress = 0;
  const started = Date.now();
  const result = await runSelfPlayBatch({
    games,
    maxPlies,
    seed,
    players: [{ difficulty: difficulty0, label: hero0 }, { difficulty: difficulty1, label: hero1 }],
    adapter,
    createState: (gameIndex, random) => createState(gameIndex, random),
    onProgress: (completed, total) => {
      const percent = Math.floor(completed * 100 / total);
      if (percent >= lastProgress + 10 || completed === total) {
        process.stdout.write(`[ai-selfplay] ${completed}/${total} (${percent}%)\n`);
        lastProgress = percent;
      }
    },
  });

  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    seed,
    games,
    maxPlies,
    players: [{ difficulty: difficulty0, hero: hero0 }, { difficulty: difficulty1, hero: hero1 }],
    wins: result.wins,
    draws: result.draws,
    winRates: result.wins.map((wins) => wins / games),
    averagePlies: result.averagePlies,
    telemetry: result.telemetry.summary(),
  };
  await writeFile(resolve(outDir, `selfplay-${stamp}.json`), JSON.stringify(summary, null, 2));
  await writeFile(resolve(outDir, `selfplay-${stamp}.csv`), result.telemetry.toCSV());
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
