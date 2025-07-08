import React, { useState } from 'react';

const PskovGame = () => {
  const [gameState, setGameState] = useState({
    turn: 1,
    phase: 'resources',
    currentPlayer: 0, // for construction phase
    selectedRegion: 'pskov', // for construction phase
    constructionActions: [
      { improvement: false, equipment: false },
      { improvement: false, equipment: false },
      { improvement: false, equipment: false }
    ], // track purchases for each player this turn
    regions: {
      pskov: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0,
          merchant_mansion: 0,
          merchant_church: 0
        }
      },
      ostrov: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      izborsk: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      skrynnitsy: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      gdov: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      pechory: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      }
    },
    players: [
      { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 }
    ]
  });

  const phases = ['resources', 'construction', 'events', 'veche', 'military'];
  const phaseNames = {
    resources: 'Resources',
    construction: 'Construction', 
    events: 'Events',
    veche: 'Veche (Council)',
    military: 'Military Actions'
  };

  // Calculate victory points for each player
  const calculateVictoryPoints = (player) => {
    return player.improvements; // Each improvement = 1 victory point
  };

  // Check if game is over and determine winner
  const getGameResult = () => {
    if (gameState.turn > 20) {
      const playerScores = gameState.players.map((player, index) => ({
        faction: player.faction,
        victoryPoints: calculateVictoryPoints(player),
        money: player.money,
        index
      }));

      // Sort by victory points (descending), then by money (descending)
      playerScores.sort((a, b) => {
        if (b.victoryPoints !== a.victoryPoints) {
          return b.victoryPoints - a.victoryPoints;
        }
        return b.money - a.money;
      });

      return {
        winner: playerScores[0],
        rankings: playerScores
      };
    }
    return null;
  };

  // Get available buildings for current player in selected region
  const getAvailableBuildings = () => {
    const player = gameState.players[gameState.currentPlayer];
    const region = gameState.regions[gameState.selectedRegion];
    const buildings = [];

    if (player.faction === 'Commoners') {
      buildings.push(
        { 
          type: 'commoner_huts', 
          name: 'Huts', 
          cost: 2, 
          built: region.buildings.commoner_huts > 0,
          canBuild: region.buildings.commoner_huts === 0
        },
        { 
          type: 'commoner_church', 
          name: 'Village Church', 
          cost: 2, 
          built: region.buildings.commoner_church > 0,
          canBuild: region.buildings.commoner_church === 0
        }
      );
    } else if (player.faction === 'Nobles') {
      buildings.push(
        { 
          type: 'noble_manor', 
          name: 'Manor', 
          cost: 2, 
          built: region.buildings.noble_manor > 0,
          canBuild: region.buildings.noble_manor === 0
        },
        { 
          type: 'noble_monastery', 
          name: 'Monastery', 
          cost: 2, 
          built: region.buildings.noble_monastery > 0,
          canBuild: region.buildings.noble_monastery === 0
        }
      );
    } else if (player.faction === 'Merchants') {
      if (gameState.selectedRegion === 'pskov') {
        buildings.push(
          { 
            type: 'merchant_mansion', 
            name: 'Mansion', 
            cost: 2, 
            built: region.buildings.merchant_mansion,
            canBuild: region.buildings.merchant_mansion < 7
          },
          { 
            type: 'merchant_church', 
            name: 'Church', 
            cost: 2, 
            built: region.buildings.merchant_church,
            canBuild: region.buildings.merchant_church < 7
          }
        );
      }
    }

    return buildings;
  };

  const buildBuilding = (buildingType) => {
    setGameState(prev => {
      const newRegions = { ...prev.regions };
      const newPlayers = [...prev.players];
      const newConstructionActions = [...prev.constructionActions];

      if (newPlayers[prev.currentPlayer].money >= 2) {
        newPlayers[prev.currentPlayer].money -= 2;
        newPlayers[prev.currentPlayer].improvements += 1;
        newConstructionActions[prev.currentPlayer].improvement = true;

        if (buildingType.startsWith('merchant_')) {
          newRegions[prev.selectedRegion].buildings[buildingType] += 1;
        } else {
          newRegions[prev.selectedRegion].buildings[buildingType] = 1;
        }
      }

      return {
        ...prev,
        regions: newRegions,
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  const nextPhase = () => {
    setGameState(prev => {
      const currentPhaseIndex = phases.indexOf(prev.phase);
      const isLastPhase = currentPhaseIndex === phases.length - 1;
      const isResourcesPhase = prev.phase === 'resources';
      const isConstructionPhase = prev.phase === 'construction';

      let newState = { ...prev };

      // Auto-calculate income during resources phase
      if (isResourcesPhase) {
        const republicRegions = Object.values(prev.regions).filter(r => r.controller === 'republic').length;
        newState.players = prev.players.map(player => ({
          ...player,
          money: player.money + 0.5 + (republicRegions * 0.25) + (player.improvements * 0.25)
        }));
      }

      // Reset current player and construction actions when leaving construction
      if (isConstructionPhase) {
        newState.currentPlayer = 0;
        newState.selectedRegion = 'pskov';
        newState.constructionActions = [
          { improvement: false, equipment: false },
          { improvement: false, equipment: false },
          { improvement: false, equipment: false }
        ];
      }

      return {
        ...newState,
        phase: isLastPhase ? phases[0] : phases[currentPhaseIndex + 1],
        turn: isLastPhase ? prev.turn + 1 : prev.turn
      };
    });
  };

  const nextPlayer = () => {
    setGameState(prev => {
      const nextPlayerIndex = prev.currentPlayer + 1;
      if (nextPlayerIndex >= 3) {
        // All players done, advance to next phase
        const currentPhaseIndex = phases.indexOf(prev.phase);
        const isLastPhase = currentPhaseIndex === phases.length - 1;

        return {
          ...prev,
          currentPlayer: 0,
          selectedRegion: 'pskov',
          constructionActions: [
            { improvement: false, equipment: false },
            { improvement: false, equipment: false },
            { improvement: false, equipment: false }
          ],
          phase: isLastPhase ? phases[0] : phases[currentPhaseIndex + 1],
          turn: isLastPhase ? prev.turn + 1 : prev.turn
        };
      } else {
        // Next player's turn
        return {
          ...prev,
          currentPlayer: nextPlayerIndex
        };
      }
    });
  };

  const buyItem = (playerIndex, item, cost) => {
    setGameState(prev => {
      const newPlayers = [...prev.players];
      const newConstructionActions = [...prev.constructionActions];

      if (newPlayers[playerIndex].money >= cost) {
        newPlayers[playerIndex].money -= cost;
        newPlayers[playerIndex][item] += 1;

        if (item === 'weapons' || item === 'armor') {
          newConstructionActions[playerIndex].equipment = true;
        }
      }
      return { 
        ...prev, 
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  const resetGame = () => {
    setGameState({
      turn: 1,
      phase: 'resources',
      currentPlayer: 0,
      selectedRegion: 'pskov',
      constructionActions: [
        { improvement: false, equipment: false },
        { improvement: false, equipment: false },
        { improvement: false, equipment: false }
      ],
      regions: {
        pskov: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0,
            merchant_mansion: 0,
            merchant_church: 0
          }
        },
        ostrov: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        izborsk: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        skrynnitsy: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        gdov: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        pechory: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        }
      },
      players: [
        { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
        { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
        { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 }
      ]
    });
  };

  const getPhaseDescription = (phase) => {
    const descriptions = {
      resources: 'Players receive income from controlled regions and improvements',
      construction: 'Players can build improvements, fortresses, and buy equipment',
      events: 'Draw and resolve an event card',
      veche: 'Council meeting to make collective decisions',
      military: 'Resolve any military conflicts with the Teutonic Order'
    };
    return descriptions[phase];
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-amber-50 min-h-screen">
      <div className="bg-amber-900 text-amber-100 p-4 rounded-lg mb-6">
        <h1 className="text-3xl font-bold text-center">Medieval Pskov</h1>
        <p className="text-center mt-2">Defend your city from the Teutonic Order</p>
      </div>

      {/* Game Status */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Turn {gameState.turn} / 20</h2>
          <div className="text-lg">
            <span className="font-medium">Current Phase: </span>
            <span className="bg-amber-200 px-3 py-1 rounded font-semibold">
              {phaseNames[gameState.phase]}
            </span>
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded">
          <p className="text-gray-700">{getPhaseDescription(gameState.phase)}</p>
        </div>
      </div>

      {/* Players */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {gameState.players.map((player, index) => (
          <div key={index} className={`bg-white rounded-lg p-4 shadow ${
            gameState.phase === 'construction' && gameState.currentPlayer === index 
              ? 'ring-4 ring-amber-400' 
              : ''
          }`}>
            <h3 className="text-lg font-semibold mb-2">
              {player.faction}
              {gameState.phase === 'construction' && gameState.currentPlayer === index && (
                <span className="text-amber-600 ml-2">(Your Turn)</span>
              )}
            </h3>
            <div className="space-y-1 text-sm">
              <div>Money: {player.money} ○</div>
              <div>Improvements: {player.improvements}</div>
              <div>Weapons: {player.weapons}</div>
              <div>Armor: {player.armor}</div>
              <div className="text-gray-600">
                {player.faction === 'Nobles' && 'Base Strength: 40'}
                {player.faction === 'Merchants' && 'Base Strength: 15'}
                {player.faction === 'Commoners' && 'Base Strength: 25'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Construction Phase Interface */}
      {gameState.phase === 'construction' && (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="text-lg font-semibold mb-3">
            {gameState.players[gameState.currentPlayer].faction} - Construction Turn
          </h3>

          {/* Region Selection */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Select Region:</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.keys(gameState.regions).map(regionName => {
                const isAvailable = gameState.players[gameState.currentPlayer].faction !== 'Merchants' || regionName === 'pskov';
                return (
                  <button
                    key={regionName}
                    onClick={() => setGameState(prev => ({ ...prev, selectedRegion: regionName }))}
                    disabled={!isAvailable}
                    className={`p-2 rounded text-sm border ${
                      gameState.selectedRegion === regionName
                        ? 'bg-amber-500 text-white border-amber-600'
                        : isAvailable
                        ? 'bg-gray-100 hover:bg-gray-200 border-gray-300'
                        : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {regionName.charAt(0).toUpperCase() + regionName.slice(1)}
                    {!isAvailable && (
                      <>
                        <br />
                        <span className="text-xs">(Merchants only)</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            {gameState.players[gameState.currentPlayer].faction === 'Merchants' && gameState.selectedRegion !== 'pskov' && (
              <p className="text-sm text-orange-600 mt-2">Merchants can only build in Pskov!</p>
            )}
          </div>

          {/* Available Buildings */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Available Buildings in {gameState.selectedRegion.charAt(0).toUpperCase() + gameState.selectedRegion.slice(1)}:</h4>
            <div className="grid grid-cols-2 gap-3">
              {getAvailableBuildings().map(building => (
                <button
                  key={building.type}
                  onClick={() => buildBuilding(building.type)}
                  disabled={
                    !building.canBuild || 
                    gameState.players[gameState.currentPlayer].money < building.cost ||
                    gameState.constructionActions[gameState.currentPlayer].improvement
                  }
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white p-3 rounded text-sm"
                >
                  <div className="font-medium">{building.name}</div>
                  <div className="text-xs">
                    {building.type.startsWith('merchant_') 
                      ? `Built: ${building.built}/7`
                      : building.built ? 'Already built' : 'Not built'
                    }
                  </div>
                  <div className="text-xs">Cost: {building.cost}○</div>
                </button>
              ))}
              {getAvailableBuildings().length === 0 && (
                <p className="text-gray-500 col-span-2 text-center py-4">
                  {gameState.players[gameState.currentPlayer].faction === 'Merchants' && gameState.selectedRegion !== 'pskov'
                    ? 'Merchants can only build in Pskov'
                    : 'No buildings available in this region'
                  }
                </p>
              )}
            </div>
          </div>

          {/* Equipment */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Equipment (Choose 1 per turn):</h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => buyItem(gameState.currentPlayer, 'weapons', 1)}
                disabled={
                  gameState.players[gameState.currentPlayer].money < 1 || 
                  gameState.constructionActions[gameState.currentPlayer].equipment ||
                  gameState.players[gameState.currentPlayer].weapons >= 2
                }
                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white p-2 rounded text-sm"
              >
                <div>Buy Weapon (1○)</div>
                <div className="text-xs">
                  {gameState.constructionActions[gameState.currentPlayer].equipment ? 'Equipment bought' :
                   gameState.players[gameState.currentPlayer].weapons >= 2 ? 'Max weapons (2)' :
                   `Owned: ${gameState.players[gameState.currentPlayer].weapons}/2`}
                </div>
              </button>
              <button
                onClick={() => buyItem(gameState.currentPlayer, 'armor', 1)}
                disabled={
                  gameState.players[gameState.currentPlayer].money < 1 || 
                  gameState.constructionActions[gameState.currentPlayer].equipment ||
                  gameState.players[gameState.currentPlayer].armor >= 2
                }
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 rounded text-sm"
              >
                <div>Buy Armor (1○)</div>
                <div className="text-xs">
                  {gameState.constructionActions[gameState.currentPlayer].equipment ? 'Equipment bought' :
                   gameState.players[gameState.currentPlayer].armor >= 2 ? 'Max armor (2)' :
                   `Owned: ${gameState.players[gameState.currentPlayer].armor}/2`}
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={nextPlayer}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
          >
            {gameState.currentPlayer === 2 ? 'End Construction' : 'Next Player'}
          </button>
        </div>
      )}

      {/* Regions Status */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <h3 className="text-lg font-semibold mb-3">Republic Regions ({Object.values(gameState.regions).filter(r => r.controller === 'republic').length}/6)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(gameState.regions).map(([name, region]) => {
            const totalBuildings = Object.values(region.buildings).reduce((sum, count) => sum + count, 0);
            return (
              <div key={name} className={`p-3 rounded border ${
                region.controller === 'republic' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <h4 className="font-medium">{name.charAt(0).toUpperCase() + name.slice(1)}</h4>
                <div className="text-sm text-gray-600">
                  {totalBuildings} building{totalBuildings !== 1 ? 's' : ''}
                  {name === 'pskov' && region.buildings.merchant_mansion > 0 && (
                    <span className="block">Merchants: {region.buildings.merchant_mansion + region.buildings.merchant_church} buildings</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase Progress */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <h3 className="text-lg font-semibold mb-3">Phase Progress</h3>
        <div className="flex space-x-2">
          {phases.map((phase, index) => (
            <div
              key={phase}
              className={`flex-1 text-center py-2 px-1 rounded text-sm ${
                phase === gameState.phase
                  ? 'bg-amber-500 text-white font-semibold'
                  : index < phases.indexOf(gameState.phase)
                  ? 'bg-green-200 text-green-800'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {phaseNames[phase]}
            </div>
          ))}
        </div>
      </div>

      {/* Game Controls */}
      <div className="bg-white rounded-lg p-4 shadow">
        <div className="flex justify-between items-center">
          <button
            onClick={resetGame}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors"
          >
            Reset Game
          </button>

          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              {gameState.turn >= 20 ? 'Game Complete! Check results below.' : 
               gameState.phase === 'construction' ? 'Players take turns in construction phase' :
               'Click to advance to next phase'}
            </p>
            <button
              onClick={nextPhase}
              disabled={gameState.turn > 20 || gameState.phase === 'construction'}
              className={`px-6 py-3 rounded font-semibold transition-colors ${
                gameState.turn > 20 || gameState.phase === 'construction'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {gameState.turn > 20 ? 'Game Complete' : 
               gameState.phase === 'construction' ? 'Use Construction Panel Above' :
               'Next Phase'}
            </button>
          </div>

          <div className="text-right">
            <p className="text-sm text-gray-600">Game will end after</p>
            <p className="font-semibold">Turn 20</p>
          </div>
        </div>
      </div>

      {/* Game End */}
      {gameState.turn > 20 && (
        <div className="bg-green-100 border border-green-400 rounded-lg p-6 mt-4">
          <h3 className="text-xl font-bold text-green-800 mb-4">🏆 Game Complete!</h3>
          {(() => {
            const result = getGameResult();
            return (
              <div>
                <div className="bg-yellow-100 border border-yellow-400 rounded p-4 mb-4">
                  <h4 className="font-bold text-lg">Winner: {result.winner.faction}</h4>
                  <p className="text-sm">
                    {result.winner.victoryPoints} Victory Points • {result.winner.money} ○
                  </p>
                </div>

                <h4 className="font-semibold mb-2">Final Rankings:</h4>
                <div className="space-y-2">
                  {result.rankings.map((player, rank) => (
                    <div 
                      key={player.index} 
                      className={`p-3 rounded ${rank === 0 ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">
                          #{rank + 1} {player.faction}
                          {rank === 0 && ' 👑'}
                        </span>
                        <span className="text-sm">
                          {player.victoryPoints} ♦ • {player.money} ○
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-blue-50 rounded">
                  <h5 className="font-medium text-blue-800">Victory Conditions:</h5>
                  <ul className="text-sm text-blue-700 mt-1">
                    <li>• Each improvement built = 1 Victory Point ♦</li>
                    <li>• Highest Victory Points wins</li>
                    <li>• Ties broken by most money ○</li>
                  </ul>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Progress to Game End */}
      {gameState.turn <= 20 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <h4 className="font-medium text-blue-800 mb-2">Progress to Victory</h4>
          <div className="w-full bg-blue-200 rounded-full h-3 mb-2">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
              style={{ width: `${(gameState.turn / 20) * 100}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-blue-700">
            <span>Turn {gameState.turn} of 20</span>
            <span>{20 - gameState.turn} turns remaining</span>
          </div>

          <div className="mt-3">
            <h5 className="font-medium text-blue-800 mb-1">Current Victory Points:</h5>
            <div className="flex justify-between text-sm">
              {gameState.players.map((player, index) => (
                <span key={index} className="text-blue-700">
                  {player.faction}: {calculateVictoryPoints(player)} ♦
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PskovGame;