import React, { useState } from 'react';

const PskovGame = () => {
  const DEBUG_MODE = true;

  const [gameState, setGameState] = useState({
    turn: 1, phase: 'resources', currentPlayer: 0, selectedRegion: 'pskov',
    currentEvent: null, eventVotes: [null, null, null], eventResolved: false,
    debugEventIndex: 0, lastEventResult: null, activeEffects: [],
    attackPlanning: null, attackTarget: null, attackVotes: [null, null, null],
    fortressPlanning: null, fortressTarget: null, fortressVotes: [null, null, null],
    regions: {
      pskov: { controller: 'republic', fortress: true, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0, merchant_mansion: 0, merchant_church: 0 } },
      ostrov: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      izborsk: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      gdov: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      pechory: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      bearhill: { controller: 'order', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } }
    },
    constructionActions: [{ improvement: false, equipment: false }, { improvement: false, equipment: false }, { improvement: false, equipment: false }],
    players: [
      { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 }
    ]
  });

  const phases = ['resources', 'construction', 'events', 'veche'];
  const phaseNames = { resources: 'Resources', construction: 'Construction', events: 'Events', veche: 'City Assembly' };

  const updateEffects = () => setGameState(prev => ({ ...prev, activeEffects: prev.activeEffects.map(e => ({ ...e, turnsRemaining: e.turnsRemaining - 1 })).filter(e => e.turnsRemaining > 0) }));

  const getStrengthModifier = (faction) => gameState.activeEffects.reduce((t, e) => ((e.type === 'strength_bonus' || e.type === 'strength_penalty') && (e.target === 'all' || e.target === faction)) ? t + e.value : t, 0);
  const getIncomeModifier = (faction) => { let m = 1.0; gameState.activeEffects.forEach(e => { if (e.type === 'income_penalty' && (e.target === 'all' || e.target === faction)) m *= (1 + e.value); }); return m; };

  const calculatePlayerStrength = (playerIndex, isDefending = false, regionName = null) => {
    const player = gameState.players[playerIndex];
    let strength = player.faction === 'Nobles' ? 40 : player.faction === 'Merchants' ? 15 : 25;
    strength += player.weapons * 5 + player.armor * 5;
    if (isDefending && regionName && gameState.regions[regionName]?.fortress) strength += 10;
    return Math.max(0, strength + getStrengthModifier(player.faction));
  };

  const calculateTotalPskovStrength = (participants, isDefending = false, regionName = null) => participants.reduce((t, i) => t + calculatePlayerStrength(i, isDefending, regionName), 0);
  const getVictoryChance = (diff) => diff >= 20 ? 95 : diff >= 15 ? 85 : diff >= 10 ? 70 : diff >= 5 ? 60 : diff >= 0 ? 50 : diff >= -5 ? 40 : diff >= -10 ? 30 : diff >= -15 ? 15 : 5;
  const rollForVictory = (diff) => Math.random() * 100 < getVictoryChance(diff);

  const surrenderRegion = (gs, regionName) => {
    if (regionName === 'pskov') return { ...gs, gameOver: true, lastEventResult: '💀 GAME OVER: Pskov has fallen!' };
    const newRegions = { ...gs.regions, [regionName]: { ...gs.regions[regionName], controller: 'order' } };
    Object.keys(newRegions[regionName].buildings).forEach(k => { newRegions[regionName].buildings[k] = 0; });
    return { ...gs, regions: newRegions, lastEventResult: `${regionName} surrendered!` };
  };

  const executeBattle = (gs, orderStr, targetRegion, defenders) => {
    const pskovStr = calculateTotalPskovStrength(defenders, true, targetRegion) + (gs.regions[targetRegion]?.fortress ? 10 : 0);
    const diff = pskovStr - orderStr;
    const win = rollForVictory(diff);
    const name = targetRegion.charAt(0).toUpperCase() + targetRegion.slice(1);
    if (win) return { ...gs, lastEventResult: `🛡️ VICTORY! ${name} defended! (${getVictoryChance(diff)}%, ${pskovStr} vs ${orderStr})` };
    return surrenderRegion(gs, targetRegion);
  };

  const initiateAttack = (target) => setGameState(prev => ({ ...prev, attackPlanning: 'planning', attackTarget: target, attackVotes: [null, null, null] }));
  
  const executeAttack = () => {
    const { attackTarget, attackVotes } = gameState;
    const participants = attackVotes.filter(v => v === true).length;
    const cost = participants > 0 ? 6 / participants : 0;
    const newPlayers = gameState.players.map((p, i) => attackVotes[i] === true ? { ...p, money: p.money - cost } : p);
    const attackers = attackVotes.map((v, i) => v === true ? i : null).filter(i => i !== null);
    const orderStr = 100 + (gameState.regions[attackTarget]?.fortress ? 10 : 0);
    const pskovStr = calculateTotalPskovStrength(attackers, false, null);
    const win = rollForVictory(pskovStr - orderStr);
    const name = attackTarget.charAt(0).toUpperCase() + attackTarget.slice(1);
    setGameState(prev => win 
      ? { ...prev, players: newPlayers, regions: { ...prev.regions, [attackTarget]: { ...prev.regions[attackTarget], controller: 'republic' } }, attackPlanning: null, attackTarget: null, attackVotes: [null, null, null], lastEventResult: `⚔️ VICTORY! ${name} recaptured!` }
      : { ...prev, players: newPlayers, attackPlanning: null, attackTarget: null, attackVotes: [null, null, null], lastEventResult: `💀 DEFEAT! Attack on ${name} failed!` }
    );
  };

  const initiateFortressBuilding = (target) => setGameState(prev => ({ ...prev, fortressPlanning: 'planning', fortressTarget: target, fortressVotes: [null, null, null] }));
  
  const executeFortressBuilding = () => {
    const { fortressTarget, fortressVotes } = gameState;
    const participants = fortressVotes.filter(v => v === true).length;
    const cost = participants > 0 ? 6 / participants : 0;
    const newPlayers = gameState.players.map((p, i) => fortressVotes[i] === true ? { ...p, money: p.money - cost } : p);
    const name = fortressTarget.charAt(0).toUpperCase() + fortressTarget.slice(1);
    setGameState(prev => ({
      ...prev, players: newPlayers,
      regions: { ...prev.regions, [fortressTarget]: { ...prev.regions[fortressTarget], fortress: true } },
      fortressPlanning: null, fortressTarget: null, fortressVotes: [null, null, null],
      lastEventResult: `🏰 Fortress built in ${name}! (+10 defense bonus)`
    }));
  };

  const cancelFortressPlanning = () => setGameState(prev => ({ ...prev, fortressPlanning: null, fortressTarget: null, fortressVotes: [null, null, null] }));
  const voteFortress = (i, vote) => setGameState(prev => { const v = [...prev.fortressVotes]; v[i] = vote; return { ...prev, fortressVotes: v }; });
  const getFortressVotingResult = () => gameState.fortressVotes.filter(v => v !== null).length === 3;

  const eventDeck = [
    { id: 'order_attack_100', name: 'Order Attack (100)', description: 'The Teutonic Order attacks!', type: 'order_attack', orderStrength: 100, minCostPerPlayer: 1 },
    { id: 'good_harvest', name: 'Good Harvest', description: 'Abundant harvest! +1○ for all.', type: 'immediate', effect: (gs) => ({ ...gs, players: gs.players.map(p => ({ ...p, money: p.money + 1 })), lastEventResult: 'Good harvest! +1○ for all.' }) },
    { id: 'fire', name: 'Fire', description: 'A fire breaks out!', type: 'immediate', effect: (gs) => ({ ...gs, lastEventResult: 'Fire broke out but nothing burned.' }) },
  ];

  const eventTypes = {
    immediate: { resolve: (event, gs) => event.effect(gs) },
    order_attack: {
      resolve: (event, gs, votes) => {
        const republicRegions = Object.entries(gs.regions).filter(([n, r]) => r.controller === 'republic' && n !== 'pskov');
        const target = republicRegions.length === 0 ? 'pskov' : republicRegions[Math.floor(Math.random() * republicRegions.length)][0];
        const participants = votes.filter(v => v === true).length;
        if (participants === 0) return surrenderRegion(gs, target);
        const cost = 3 / participants;
        const defenders = votes.map((v, i) => v === true ? i : null).filter(i => i !== null);
        const newPlayers = gs.players.map((p, i) => votes[i] === true ? { ...p, money: p.money - cost } : p);
        return executeBattle({ ...gs, players: newPlayers }, event.orderStrength, target, defenders);
      }
    }
  };

  const drawEvent = (idx) => DEBUG_MODE ? eventDeck[idx % eventDeck.length] : eventDeck[Math.floor(Math.random() * eventDeck.length)];
  const voteOnEvent = (i, vote) => setGameState(prev => { const v = [...prev.eventVotes]; v[i] = vote; return { ...prev, eventVotes: v }; });
  const getParticipationResult = () => gameState.eventVotes.filter(v => v !== null).length === 3 ? (gameState.eventVotes.filter(v => v === true).length > 0 ? 'success' : 'failed') : null;
  const calculateVictoryPoints = (p) => p.improvements;
  const getGameResult = () => { if (gameState.turn > 20) { const s = gameState.players.map((p, i) => ({ faction: p.faction, vp: calculateVictoryPoints(p), money: p.money, i })); s.sort((a, b) => b.vp !== a.vp ? b.vp - a.vp : b.money - a.money); return { winner: s[0], rankings: s }; } return null; };

  const getAvailableBuildings = () => {
    const p = gameState.players[gameState.currentPlayer];
    const r = gameState.regions[gameState.selectedRegion];
    if (p.faction === 'Commoners') return [{ type: 'commoner_huts', name: 'Huts', cost: 2, canBuild: r.buildings.commoner_huts === 0 }];
    if (p.faction === 'Nobles') return [{ type: 'noble_manor', name: 'Manor', cost: 2, canBuild: r.buildings.noble_manor === 0 }];
    if (p.faction === 'Merchants' && gameState.selectedRegion === 'pskov') return [{ type: 'merchant_mansion', name: 'Mansion', cost: 2, canBuild: r.buildings.merchant_mansion < 7 }];
    return [];
  };

  const buildBuilding = (type) => setGameState(prev => {
    if (prev.players[prev.currentPlayer].money < 2) return prev;
    const newPlayers = [...prev.players];
    newPlayers[prev.currentPlayer] = { ...newPlayers[prev.currentPlayer], money: newPlayers[prev.currentPlayer].money - 2, improvements: newPlayers[prev.currentPlayer].improvements + 1 };
    const newRegions = { ...prev.regions };
    newRegions[prev.selectedRegion] = { ...newRegions[prev.selectedRegion], buildings: { ...newRegions[prev.selectedRegion].buildings, [type]: type.startsWith('merchant_') ? newRegions[prev.selectedRegion].buildings[type] + 1 : 1 } };
    const newCA = [...prev.constructionActions]; newCA[prev.currentPlayer] = { ...newCA[prev.currentPlayer], improvement: true };
    return { ...prev, players: newPlayers, regions: newRegions, constructionActions: newCA };
  });

  const nextPhase = () => {
    const idx = phases.indexOf(gameState.phase);
    const isLast = idx === phases.length - 1;
    setGameState(prev => {
      let s = { ...prev };
      if (prev.phase === 'resources') {
        const repCount = Object.values(prev.regions).filter(r => r.controller === 'republic').length;
        s.players = prev.players.map(p => ({ ...p, money: p.money + (0.5 + repCount * 0.25 + p.improvements * 0.25) * getIncomeModifier(p.faction) }));
      }
      const next = isLast ? phases[0] : phases[idx + 1];
      if (next === 'events') { s.currentEvent = drawEvent(prev.debugEventIndex); s.eventVotes = [null, null, null]; s.eventResolved = false; if (DEBUG_MODE) s.debugEventIndex = (prev.debugEventIndex + 1) % eventDeck.length; }
      if (prev.phase === 'construction') { s.currentPlayer = 0; s.selectedRegion = 'pskov'; s.constructionActions = [{ improvement: false, equipment: false }, { improvement: false, equipment: false }, { improvement: false, equipment: false }]; }
      if (prev.phase === 'events') { s.currentEvent = null; s.eventVotes = [null, null, null]; s.eventResolved = false; s.lastEventResult = null; }
      if (prev.phase === 'veche') { s.attackPlanning = null; s.attackTarget = null; s.attackVotes = [null, null, null]; s.fortressPlanning = null; s.fortressTarget = null; s.fortressVotes = [null, null, null]; s.lastEventResult = null; }
      return { ...s, phase: next, turn: isLast ? prev.turn + 1 : prev.turn };
    });
    if (isLast) setTimeout(updateEffects, 100);
  };

  const nextPlayer = () => setGameState(prev => ({ ...prev, currentPlayer: (prev.currentPlayer + 1) % 3 }));
  const buyItem = (i, item, cost) => setGameState(prev => {
    if (prev.players[i].money < cost) return prev;
    const newP = [...prev.players]; newP[i] = { ...newP[i], money: newP[i].money - cost, [item]: newP[i][item] + 1 };
    const newCA = [...prev.constructionActions]; newCA[i] = { ...newCA[i], equipment: true };
    return { ...prev, players: newP, constructionActions: newCA };
  });

  const resolveEvent = () => {
    const e = gameState.currentEvent;
    const et = eventTypes[e.type];
    if (!et) return;
    setGameState(prev => ({ ...et.resolve(e, prev, prev.eventVotes), eventResolved: true }));
  };

  const resetGame = () => setGameState({
    turn: 1, phase: 'resources', currentPlayer: 0, selectedRegion: 'pskov',
    currentEvent: null, eventVotes: [null, null, null], eventResolved: false,
    debugEventIndex: 0, lastEventResult: null, activeEffects: [],
    attackPlanning: null, attackTarget: null, attackVotes: [null, null, null],
    fortressPlanning: null, fortressTarget: null, fortressVotes: [null, null, null],
    regions: {
      pskov: { controller: 'republic', fortress: true, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0, merchant_mansion: 0, merchant_church: 0 } },
      ostrov: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      izborsk: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      gdov: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      pechory: { controller: 'republic', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } },
      bearhill: { controller: 'order', fortress: false, buildings: { commoner_huts: 0, commoner_church: 0, noble_manor: 0, noble_monastery: 0 } }
    },
    constructionActions: [{ improvement: false, equipment: false }, { improvement: false, equipment: false }, { improvement: false, equipment: false }],
    players: [
      { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 }
    ]
  });

  return (
    <div className="max-w-4xl mx-auto p-6 bg-amber-50 min-h-screen">
      <div className="bg-amber-900 text-amber-100 p-4 rounded-lg mb-6">
        <h1 className="text-3xl font-bold text-center">Medieval Pskov</h1>
        <p className="text-center mt-2">Defend your city from the Teutonic Order</p>
      </div>

      {DEBUG_MODE && <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4"><p className="text-yellow-700 text-sm">🐛 Debug: Next event: {eventDeck[gameState.debugEventIndex]?.name}</p></div>}

      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Turn {gameState.turn}/20</h2>
          <span className="bg-amber-200 px-3 py-1 rounded font-semibold">{phaseNames[gameState.phase]}</span>
        </div>
      </div>

      {gameState.activeEffects.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-purple-800 mb-2">Active Effects</h3>
          {gameState.activeEffects.map(e => <div key={e.id} className="text-sm text-purple-700">{e.description} ({e.turnsRemaining} turns)</div>)}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {gameState.players.map((p, i) => (
          <div key={i} className={`bg-white rounded-lg p-4 shadow ${gameState.phase === 'construction' && gameState.currentPlayer === i ? 'ring-4 ring-amber-400' : ''}`}>
            <h3 className="font-semibold">{p.faction}</h3>
            <div className="text-sm">Money: {p.money.toFixed(1)}○ | Improvements: {p.improvements}</div>
            <div className="text-sm">Weapons: {p.weapons} | Armor: {p.armor}</div>
            <div className="text-xs text-gray-600">Strength: {calculatePlayerStrength(i, false, null)}</div>
          </div>
        ))}
      </div>

      {gameState.phase === 'construction' && (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="font-semibold mb-3">{gameState.players[gameState.currentPlayer].faction} - Construction</h3>
          <div className="mb-4">
            <h4 className="font-medium mb-2">Select Region:</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(gameState.regions).filter(([_, r]) => r.controller === 'republic').map(([name]) => (
                <button key={name} onClick={() => setGameState(prev => ({ ...prev, selectedRegion: name }))}
                  className={`p-2 rounded text-sm ${gameState.selectedRegion === name ? 'bg-amber-500 text-white' : 'bg-gray-100'}`}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <h4 className="font-medium mb-2">Buildings:</h4>
            <div className="grid grid-cols-2 gap-2">
              {getAvailableBuildings().map(b => (
                <button key={b.type} onClick={() => buildBuilding(b.type)} disabled={!b.canBuild || gameState.players[gameState.currentPlayer].money < b.cost || gameState.constructionActions[gameState.currentPlayer].improvement}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white p-2 rounded text-sm">
                  {b.name} ({b.cost}○)
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button onClick={() => buyItem(gameState.currentPlayer, 'weapons', 1)} disabled={gameState.players[gameState.currentPlayer].money < 1 || gameState.constructionActions[gameState.currentPlayer].equipment || gameState.players[gameState.currentPlayer].weapons >= 2}
              className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white p-2 rounded text-sm">Weapon (1○)</button>
            <button onClick={() => buyItem(gameState.currentPlayer, 'armor', 1)} disabled={gameState.players[gameState.currentPlayer].money < 1 || gameState.constructionActions[gameState.currentPlayer].equipment || gameState.players[gameState.currentPlayer].armor >= 2}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 rounded text-sm">Armor (1○)</button>
          </div>
          <button onClick={nextPlayer} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded">Next Player</button>
        </div>
      )}

      {gameState.phase === 'events' && gameState.currentEvent && (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="font-semibold mb-3">Event: {gameState.currentEvent.name}</h3>
          <p className="text-gray-700 mb-3">{gameState.currentEvent.description}</p>
          
          {gameState.currentEvent.type === 'order_attack' && !gameState.eventResolved && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {gameState.players.map((p, i) => (
                  <div key={i} className="text-center">
                    <h5 className="font-medium">{p.faction}</h5>
                    <div className="space-y-2 mt-2">
                      <button onClick={() => voteOnEvent(i, true)} disabled={gameState.eventVotes[i] !== null || p.money < 1}
                        className={`w-full px-3 py-1 rounded text-sm ${gameState.eventVotes[i] === true ? 'bg-green-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300'}`}>
                        {gameState.eventVotes[i] === true ? 'Defending' : 'Defend'}
                      </button>
                      <button onClick={() => voteOnEvent(i, false)} disabled={gameState.eventVotes[i] !== null}
                        className={`w-full px-3 py-1 rounded text-sm ${gameState.eventVotes[i] === false ? 'bg-red-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300'}`}>
                        {gameState.eventVotes[i] === false ? 'Surrendering' : 'Surrender'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {getParticipationResult() && <div className="text-center"><button onClick={resolveEvent} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded">Resolve Attack</button></div>}
            </div>
          )}
          
          {gameState.currentEvent.type === 'immediate' && !gameState.eventResolved && (
            <div className="text-center"><button onClick={resolveEvent} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded">Apply Effect</button></div>
          )}
          
          {gameState.eventResolved && <div className="text-center text-green-600 font-medium">✓ Resolved{gameState.lastEventResult && `: ${gameState.lastEventResult}`}</div>}
        </div>
      )}

      {gameState.phase === 'veche' && (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="font-semibold mb-3">City Assembly (Veche)</h3>
          
          {!gameState.attackPlanning && !gameState.fortressPlanning && (
            <>
              <div className="mb-4">
                <h4 className="font-medium mb-2">⚔️ Attack Order Territory (6○)</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(gameState.regions).filter(([_, r]) => r.controller === 'order').map(([name, r]) => (
                    <button key={name} onClick={() => initiateAttack(name)} className="bg-red-500 hover:bg-red-600 text-white p-2 rounded text-sm">
                      Attack {name.charAt(0).toUpperCase() + name.slice(1)} {r.fortress && '🏰'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-4">
                <h4 className="font-medium mb-2">🏰 Build Fortress (6○, +10 defense)</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(gameState.regions).filter(([_, r]) => r.controller === 'republic' && !r.fortress).map(([name]) => (
                    <button key={name} onClick={() => initiateFortressBuilding(name)} className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded text-sm">
                      Fortress in {name.charAt(0).toUpperCase() + name.slice(1)}
                    </button>
                  ))}
                </div>
                {Object.entries(gameState.regions).filter(([_, r]) => r.controller === 'republic' && !r.fortress).length === 0 && 
                  <p className="text-green-600 text-center py-2">✓ All republic regions have fortresses!</p>}
              </div>
            </>
          )}

          {gameState.attackPlanning === 'planning' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-red-800 mb-3">Planning Attack: {gameState.attackTarget.charAt(0).toUpperCase() + gameState.attackTarget.slice(1)}</h4>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {gameState.players.map((p, i) => (
                  <div key={i} className="text-center">
                    <h5 className="font-medium">{p.faction} ({p.money.toFixed(1)}○)</h5>
                    <div className="space-y-2 mt-2">
                      <button onClick={() => setGameState(prev => { const v = [...prev.attackVotes]; v[i] = true; return { ...prev, attackVotes: v }; })} disabled={gameState.attackVotes[i] !== null || p.money < 2}
                        className={`w-full px-3 py-1 rounded text-sm ${gameState.attackVotes[i] === true ? 'bg-red-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300'}`}>
                        {gameState.attackVotes[i] === true ? 'Joining' : 'Join'}
                      </button>
                      <button onClick={() => setGameState(prev => { const v = [...prev.attackVotes]; v[i] = false; return { ...prev, attackVotes: v }; })} disabled={gameState.attackVotes[i] !== null}
                        className={`w-full px-3 py-1 rounded text-sm ${gameState.attackVotes[i] === false ? 'bg-gray-600 text-white' : 'bg-gray-500 hover:bg-gray-600 text-white disabled:bg-gray-300'}`}>
                        {gameState.attackVotes[i] === false ? 'Declined' : 'Decline'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {gameState.attackVotes.filter(v => v !== null).length === 3 && (() => {
                const n = gameState.attackVotes.filter(v => v === true).length;
                const cost = n > 0 ? 6 / n : 0;
                let ok = n > 0;
                gameState.players.forEach((p, i) => { if (gameState.attackVotes[i] === true && p.money < cost) ok = false; });
                return (
                  <div className="text-center">
                    <p className="text-sm mb-2">{n > 0 ? `${n} attackers, ${cost.toFixed(1)}○ each` : 'No attackers'}</p>
                    <button onClick={executeAttack} disabled={!ok} className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded mr-2">{ok ? 'Launch Attack' : 'Cannot Attack'}</button>
                    <button onClick={() => setGameState(prev => ({ ...prev, attackPlanning: null, attackTarget: null, attackVotes: [null, null, null] }))} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">Cancel</button>
                  </div>
                );
              })()}
            </div>
          )}

          {gameState.fortressPlanning === 'planning' && (
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-gray-800 mb-3">🏰 Building Fortress: {gameState.fortressTarget.charAt(0).toUpperCase() + gameState.fortressTarget.slice(1)}</h4>
              <p className="text-gray-700 text-sm mb-3">Cost: 6○ total. Provides +10 defense bonus when defending this region.</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {gameState.players.map((p, i) => (
                  <div key={i} className="text-center">
                    <h5 className="font-medium">{p.faction} ({p.money.toFixed(1)}○)</h5>
                    <div className="space-y-2 mt-2">
                      <button onClick={() => voteFortress(i, true)} disabled={gameState.fortressVotes[i] !== null || p.money < 2}
                        className={`w-full px-3 py-1 rounded text-sm ${gameState.fortressVotes[i] === true ? 'bg-gray-700 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white disabled:bg-gray-300'}`}>
                        {gameState.fortressVotes[i] === true ? 'Contributing' : 'Contribute'}
                      </button>
                      <button onClick={() => voteFortress(i, false)} disabled={gameState.fortressVotes[i] !== null}
                        className={`w-full px-3 py-1 rounded text-sm ${gameState.fortressVotes[i] === false ? 'bg-red-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300'}`}>
                        {gameState.fortressVotes[i] === false ? 'Declined' : 'Decline'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {getFortressVotingResult() && (() => {
                const n = gameState.fortressVotes.filter(v => v === true).length;
                const cost = n > 0 ? 6 / n : 0;
                let ok = n > 0;
                gameState.players.forEach((p, i) => { if (gameState.fortressVotes[i] === true && p.money < cost) ok = false; });
                return (
                  <div className="text-center">
                    <p className="text-sm mb-2">{n > 0 ? `${n} contributors, ${cost.toFixed(1)}○ each` : 'No contributors'}</p>
                    <p className={`text-sm font-medium mb-2 ${ok ? 'text-green-600' : 'text-red-600'}`}>{ok ? 'CONSTRUCTION FUNDED' : 'CANCELLED'}</p>
                    <button onClick={executeFortressBuilding} disabled={!ok} className="bg-gray-700 hover:bg-gray-800 disabled:bg-gray-400 text-white px-4 py-2 rounded mr-2">{ok ? '🏰 Build Fortress' : 'Cannot Build'}</button>
                    <button onClick={cancelFortressPlanning} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">Cancel</button>
                  </div>
                );
              })()}
            </div>
          )}

          {gameState.lastEventResult && <div className={`p-3 rounded mb-4 ${gameState.lastEventResult.includes('VICTORY') || gameState.lastEventResult.includes('Fortress') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{gameState.lastEventResult}</div>}
          
          {!gameState.attackPlanning && !gameState.fortressPlanning && <div className="text-center"><button onClick={nextPhase} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded">End Assembly</button></div>}
        </div>
      )}

      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <h3 className="font-semibold mb-3">Regions</h3>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(gameState.regions).map(([name, r]) => (
            <div key={name} className={`p-2 rounded text-sm ${r.controller === 'republic' ? 'bg-green-100' : 'bg-red-100'}`}>
              <div className="font-medium">{name.charAt(0).toUpperCase() + name.slice(1)}</div>
              <div className="text-xs">{r.controller === 'republic' ? '🏛️' : '⚔️'} {r.fortress && '🏰 +10 def'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow flex justify-between items-center">
        <button onClick={resetGame} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">Reset</button>
        <button onClick={nextPhase} disabled={gameState.turn > 20 || (gameState.phase === 'events' && !gameState.eventResolved) || (gameState.phase === 'veche' && (gameState.attackPlanning || gameState.fortressPlanning))}
          className={`px-6 py-3 rounded font-semibold ${(gameState.turn > 20 || (gameState.phase === 'events' && !gameState.eventResolved) || (gameState.phase === 'veche' && (gameState.attackPlanning || gameState.fortressPlanning))) ? 'bg-gray-300 text-gray-500' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}>
          Next Phase
        </button>
        <div className="text-sm text-gray-600">Turn {gameState.turn}/20</div>
      </div>

      {gameState.turn > 20 && (() => {
        const r = getGameResult();
        return (
          <div className="bg-green-100 border border-green-400 rounded-lg p-6 mt-4">
            <h3 className="text-xl font-bold text-green-800 mb-4">🏆 Game Complete!</h3>
            <div className="bg-yellow-100 rounded p-4 mb-4"><h4 className="font-bold">Winner: {r.winner.faction}</h4><p>{r.winner.vp} VP</p></div>
            {r.rankings.map((p, i) => <div key={p.i} className="p-2">#{i + 1} {p.faction}: {p.vp} VP</div>)}
          </div>
        );
      })()}

      {gameState.turn <= 20 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <div className="w-full bg-blue-200 rounded-full h-3 mb-2">
            <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${(gameState.turn / 20) * 100}%` }}></div>
          </div>
          <div className="text-sm text-blue-700">Turn {gameState.turn}/20 | {gameState.players.map(p => `${p.faction}: ${p.improvements}VP`).join(' | ')}</div>
        </div>
      )}
    </div>
  );
};

export default PskovGame;