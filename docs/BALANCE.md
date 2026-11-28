# Balance baseline

All numbers come from `node simulate.js 6000 [flags]`: AI-vs-AI games through the
one rules engine in `src/game`, which solo, hot-seat and online all play. When Pskov
falls, everyone loses, so those games count as no one's win.

## Rules

- **Standard** (default): Glory and the Siege of Pskov. Merchant building VP ×0.6.
- **Classic** (the "Classic rules" option in game setup, `--classic`): neither, Merchant building VP ×0.5.

**Glory:** each coin paid toward a defence or a campaign that wins, or toward a
fortress that gets built, earns 1 VP (`GLORY_PER_COIN`). It is never halved for
Merchants and never lost. Event payments earn none.

**Siege:** the Order can attack Pskov as soon as it holds a region next to it
(Izborsk, Ostrov, Skrynnitsy). Before, it attacked Pskov only when it had no other target.

## Results (6,000 games per row; AI defaults for factions not named)

| Scenario | Nobles win | Merchants win | Commoners win | Pskov falls |
|---|---|---|---|---|
| Classic, everyone cooperates | 40.8% | 24.3% | 34.4% | 0.5% |
| Classic, Merchants never pay | 8.2% | 68.8% | 6.6% | 16.4% |
| Standard, everyone cooperates | 31.3% | 29.1% | 27.4% | 12.2% |
| Standard, Merchants never pay | 17.6% | 15.0% | 13.0% | 54.4% |
| Standard, Merchants pay only for defence | 34.2% | 18.4% | 26.5% | 21.0% |
| Standard, Nobles never pay | 0.1% | 12.5% | 0.3% | 87.2% |
| Standard, Commoners never pay | 2.9% | 28.8% | 0.0% | 68.3% |

"Never pay" means no defence, campaign, fortress, event costs or auction bids.

## Against the design targets

| Measure | Target | Standard rules |
|---|---|---|
| Each faction's win rate, everyone cooperating | 28–38% | 27–31% (Commoners just under) |
| Pskov falls, everyone cooperating | 5–15% | 12% |
| Pskov falls, one faction never pays | over 50% | 54–87% |
| Best "never pay" strategy vs cooperating, same faction | no more than +5 points | −11 to −29 points |

## Merchant multiplier

With Glory and the siege, everyone cooperating (6,000 games each):

| Merchant building VP | Nobles | Merchants | Commoners |
|---|---|---|---|
| ×0.5 | 40% | 15% | — |
| ×0.6 (chosen) | 31% | 29% | 27% |
| ×0.7 | 23% | 45% | — |

## Commands

```bash
npm test                     # unit tests + seeded snapshot of src/game
npm run test:worker          # the same snapshot against the worker's bundle of the engine
node simulate.js 6000        # standard rules
node simulate.js 6000 --classic --never-pay=Merchants
node simulate.js 6000 --merchant-vp=0.7 --glory=0.5   # try other tuning values
node simulate.js --record    # re-record the snapshot after an intended rule change
```
