import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import cards from '../app/cards.generated.json' with { type: 'json' };
import { compileCard } from '../app/rules-engine/compiler.mjs';
import { executeCommand } from '../app/rules-engine/engine.mjs';

const catalog = cards.map(compileCard);
const printed = (page, overrides = {}) => ({ ...compileCard(cards.find((card) => card.page === page)), ...overrides });
const state = () => ({
  active: 0, phase: 'principal', round: 1, cardCatalog: catalog,
  players: [0, 1].map((owner) => ({
    heroId: owner ? 'gimble' : 'rasmus', level: 1, heroXP: 0, markers: {}, abilityUses: {},
    life: 30, maxLife: 30, energy: 10, maxEnergy: 10, reserve: 0,
    deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [],
    turnCardsPlayed: 0, turnSpellsPlayed: 0,
  })),
});

test('Gato do Barista searches only Café cards and confirms one into hand', () => {
  const game = state();
  const cat = printed(215, { id: 'barista-cat', cost: 0 });
  const cafe = printed(230, { id: 'espresso-copy' });
  const invalid = printed(214, { id: 'not-coffee' });
  game.players[0].hand.push(cat);
  game.players[0].deck.push(invalid, cafe);

  const choosing = executeCommand(game, { type: 'playCard', owner: 0, cardId: 'barista-cat', slot: 0, skipPriority: true }).state;
  assert.equal(choosing.pendingDecision?.kind, 'search');
  assert.equal(choosing.pendingDecision?.effect?.nameIncludes, 'Café');

  const resolved = executeCommand(choosing, { type: 'resolveDecision', owner: 0, selectedCardIds: ['espresso-copy'] }).state;
  assert.equal(resolved.pendingDecision, null);
  assert.ok(resolved.players[0].hand.some((card) => card.id === 'espresso-copy'));
  assert.ok(resolved.players[0].deck.some((card) => card.id === 'not-coffee'));
});

test('search decision UI applies nameIncludes before enabling card confirmation', () => {
  const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /nameIncludes\?:string/);
  assert.match(page, /engineDecision\.effect\.nameIncludes/);
});
