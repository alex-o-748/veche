// Rules engine tests: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ActionTypes,
  applyAction,
  createInitialGameState,
  calculateVictoryPoints,
  getGameResult,
  getOrderAttackTargets,
  resolveEvent,
  eventDeck,
  drawEvent,
  nextPhase,
  setRandomSource,
  createSeededRandom,
  getRules,
} from '../src/game/index.js';

const attackCard = eventDeck.find((e) => e.id === 'order_attack_100');

// A state in the events phase with the given Order attack card up
const withAttack = (state, card = attackCard) => ({ ...state, phase: 'events', currentEvent: drawEventCard(card) });
const drawEventCard = (card) => JSON.parse(JSON.stringify(card));

const giveMoney = (state, amounts) => ({
  ...state,
  players: state.players.map((p, i) => ({ ...p, money: amounts[i] })),
});

const orderHolds = (state, ...regions) => ({
  ...state,
  regions: Object.fromEntries(
    Object.entries(state.regions).map(([name, r]) => [name, regions.includes(name) ? { ...r, controller: 'order' } : r])
  ),
});

test('a won defence gives each payer 1 Glory', () => {
  const state = withAttack(giveMoney(createInitialGameState(), [3, 3, 3]));
  const after = resolveEvent(state.currentEvent, state, [true, false, true], { targetIndex: 0, battleRoll: 0 });
  assert.equal(after.battleResult.type, 'defense_victory');
  assert.deepEqual(after.players.map((p) => p.glory), [1, 0, 1]);
  assert.deepEqual(after.players.map((p) => p.money), [2, 3, 2]);
  assert.equal(after.battleResult.glory, 1);
  assert.deepEqual(after.battleResult.participants, [0, 2]);
});

test('a lost defence gives no Glory and the coins are gone', () => {
  const state = withAttack(giveMoney(createInitialGameState(), [3, 3, 3]));
  const after = resolveEvent(state.currentEvent, state, [true, true, true], { targetIndex: 0, battleRoll: 0.999 });
  assert.equal(after.battleResult.type, 'defense_defeat');
  assert.deepEqual(after.players.map((p) => p.glory), [0, 0, 0]);
  assert.deepEqual(after.players.map((p) => p.money), [2, 2, 2]);
});

test('a fortress split 3 ways gives 2 Glory each', () => {
  let state = { ...giveMoney(createInitialGameState(), [3, 3, 3]), phase: 'veche' };
  state = applyAction(state, { type: ActionTypes.INITIATE_FORTRESS, targetRegion: 'ostrov' }).newState;
  for (let p = 0; p < 3; p++) state = applyAction(state, { type: ActionTypes.VOTE_FORTRESS, vote: true }, p).newState;
  const { newState, result } = applyAction(state, { type: ActionTypes.EXECUTE_FORTRESS });
  assert.equal(result.type, 'fortress_built');
  assert.equal(newState.regions.ostrov.fortress, true);
  assert.deepEqual(newState.players.map((p) => p.glory), [2, 2, 2]);
  assert.deepEqual(newState.players.map((p) => p.money), [1, 1, 1]);
});

test('a won campaign gives each attacker 2 Glory; a lost one none', () => {
  let state = orderHolds({ ...giveMoney(createInitialGameState(), [5, 5, 5]), phase: 'veche' });
  state = applyAction(state, { type: ActionTypes.INITIATE_ATTACK, targetRegion: 'bearhill' }).newState;
  // Online votes arrive as strings
  state = applyAction(state, { type: ActionTypes.VOTE_ATTACK, vote: 'true' }, 0).newState;
  state = applyAction(state, { type: ActionTypes.VOTE_ATTACK, vote: true }, 1).newState;
  state = applyAction(state, { type: ActionTypes.VOTE_ATTACK, vote: false }, 2).newState;

  const won = applyAction(state, { type: ActionTypes.EXECUTE_ATTACK }, null, { battleRoll: 0 }).newState;
  assert.equal(won.regions.bearhill.controller, 'republic');
  assert.deepEqual(won.players.map((p) => p.glory), [2, 2, 0]);

  const lost = applyAction(state, { type: ActionTypes.EXECUTE_ATTACK }, null, { battleRoll: 0.999 }).newState;
  assert.deepEqual(lost.players.map((p) => p.glory), [0, 0, 0]);
  assert.deepEqual(lost.players.map((p) => p.money), [3, 3, 5]);
});

test('Glory is never halved for Merchants', () => {
  const merchant = { faction: 'Merchants', improvements: 4, religiousBuildings: 2, bonusPoints: 1, glory: 5 };
  // 6 building VP × 0.6 + 1 bonus + 5 Glory
  assert.equal(calculateVictoryPoints(merchant, getRules(createInitialGameState())), 6 * 0.6 + 1 + 5);
  // Classic rules: × 0.5
  assert.equal(calculateVictoryPoints(merchant, getRules(createInitialGameState({ ruleset: 'classic' }))), 3 + 1 + 5);
});

test('classic rules earn no Glory', () => {
  const state = withAttack(giveMoney(createInitialGameState({ ruleset: 'classic' }), [3, 3, 3]));
  const after = resolveEvent(state.currentEvent, state, [true, true, true], { targetIndex: 0, battleRoll: 0 });
  assert.equal(after.battleResult.type, 'defense_victory');
  assert.deepEqual(after.players.map((p) => p.glory), [0, 0, 0]);
});

test('with the Order in Izborsk, Pskov is a possible target', () => {
  const state = orderHolds(createInitialGameState(), 'bearhill', 'pechory', 'izborsk');
  assert.ok(getOrderAttackTargets(state.regions, getRules(state)).includes('pskov'));
});

test('with no Order region next to Pskov, Pskov is not a target', () => {
  const state = createInitialGameState();
  assert.ok(!getOrderAttackTargets(state.regions, getRules(state)).includes('pskov'));
});

test('classic rules attack Pskov only when nothing else is in reach', () => {
  const state = orderHolds(createInitialGameState({ ruleset: 'classic' }), 'bearhill', 'pechory', 'izborsk');
  assert.ok(!getOrderAttackTargets(state.regions, getRules(state)).includes('pskov'));
});

test('a failed defence of Pskov ends the game', () => {
  const state = withAttack(giveMoney(orderHolds(createInitialGameState(), 'bearhill', 'pechory', 'izborsk'), [3, 3, 3]));
  const targets = getOrderAttackTargets(state.regions, getRules(state));
  const after = resolveEvent(state.currentEvent, state, [true, true, true], {
    targetIndex: targets.indexOf('pskov'),
    battleRoll: 0.999,
  });
  assert.equal(after.gameOver, true);
  assert.equal(getGameResult(after).gameOver, true);
});

test('a burned church costs its owner 2 VP and no income', () => {
  setRandomSource(() => 0); // the fire picks the first building
  try {
    let state = createInitialGameState();
    state = {
      ...state,
      players: state.players.map((p) => (p.faction === 'Commoners' ? { ...p, improvements: 2, religiousBuildings: 1 } : p)),
      regions: {
        ...state.regions,
        pskov: { ...state.regions.pskov, buildings: { ...state.regions.pskov.buildings, commoner_church: 1 } },
      },
    };
    const before = JSON.stringify(state);
    const cityFire = eventDeck.find((e) => e.id === 'city_fire');
    const after = resolveEvent(cityFire, state, [null, null, null]);
    const commoners = after.players.find((p) => p.faction === 'Commoners');
    assert.equal(commoners.improvements, 1);
    assert.equal(commoners.religiousBuildings, 0);
    assert.equal(calculateVictoryPoints(commoners), 1);
    assert.equal(after.regions.pskov.buildings.commoner_church, 0);
    assert.deepEqual(after.lastOutcome, { key: 'battle.cityFireDestroysBuilding', params: { building: 'commoner_church' } });
    // The previous state is untouched
    assert.equal(JSON.stringify(state), before);
  } finally {
    setRandomSource(null);
  }
});

test('stored event cards survive JSON and still resolve', () => {
  const { event } = drawEvent([], 0);
  assert.equal(typeof event.effect, 'undefined');
  assert.equal(typeof event.effects, 'undefined');
  const squirrels = JSON.parse(JSON.stringify(eventDeck.find((e) => e.id === 'giant_squirrels')));
  const after = resolveEvent(squirrels, createInitialGameState(), ['befriend', 'befriend', 'skin_them']);
  assert.equal(after.lastOutcome.key, 'battle.squirrelsBefriended');
});

test('Fur Auction and Giant Squirrels are in the deck', () => {
  const ids = eventDeck.map((e) => e.id);
  assert.ok(ids.includes('fur_auction'));
  assert.ok(ids.includes('giant_squirrels'));
});

test('saves without glory load with glory 0', () => {
  const state = createInitialGameState();
  const old = { ...state, players: state.players.map(({ glory, ...p }) => ({ ...p, improvements: 1 })) };
  delete old.rules;
  const result = getGameResult({ ...old, turn: 21 });
  assert.deepEqual(result.rankings.map((r) => r.breakdown.glory), [0, 0, 0]);
});

test('online: players build at the same time, each in their own region', () => {
  let state = createInitialGameState({ simultaneousConstruction: true });
  state = nextPhase(giveMoney(state, [5, 5, 5])); // resources → construction
  state = applyAction(state, { type: ActionTypes.BUILD_BUILDING, buildingType: 'commoner_huts', regionName: 'ostrov' }, 2).newState;
  state = applyAction(state, { type: ActionTypes.BUILD_BUILDING, buildingType: 'noble_manor', regionName: 'gdov' }, 0).newState;
  assert.equal(state.regions.ostrov.buildings.commoner_huts, 1);
  assert.equal(state.regions.gdov.buildings.noble_manor, 1);
  // Building another faction's building is refused
  const refused = applyAction(state, { type: ActionTypes.BUILD_BUILDING, buildingType: 'noble_manor', regionName: 'pechory' }, 1).newState;
  assert.equal(refused.regions.pechory.buildings.noble_manor, 0);
  // When everyone is ready the phase moves on
  for (let p = 0; p < 3; p++) state = applyAction(state, { type: ActionTypes.SET_CONSTRUCTION_READY }, p).newState;
  assert.equal(state.phase, 'events');
  assert.ok(state.currentEvent);
});

test('online: the end of the Veche pays income and goes straight to construction', () => {
  let state = { ...createInitialGameState({ simultaneousConstruction: true }), phase: 'veche' };
  state = nextPhase(state);
  assert.equal(state.phase, 'construction');
  assert.equal(state.turn, 2);
  assert.ok(state.players.every((p) => p.money > 0));
});

test('seeded games replay identically', () => {
  const play = () => {
    setRandomSource(createSeededRandom(42));
    try {
      let state = createInitialGameState();
      for (let i = 0; i < 12; i++) state = nextPhase(state);
      return JSON.stringify(state);
    } finally {
      setRandomSource(null);
    }
  };
  assert.equal(play(), play());
});
