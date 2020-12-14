# LinkSwap

# Local Development

The following assumes the use of `node@>=10`.

## Install Dependencies

`yarn`

## Compile Contracts

`yarn compile` / `yarn c`

## Run Tests

`yarn test` / `yarn t`

or to skip contract recompiling:
`yarn quicktest` / `yarn qt`

# Contract Deployment Order

1. yYFL
2. LinkswapPriceOracle
3. LinkswapFactory
4. LinkswapRouter
5. PairNamer
6. YFLPurchaser

# Contract Summaries

## yYFL

- Governance and staking contract.
- YFL can be staked to participate in voting or make proposals (arbitrary code execution).
- Anyone can execute a successful proposal.
- Any tokens sent to this contract can be converted to YFL using `convertTokensToYfl` (anyone can call this function). All YFL is distributed proportionally to YFL stakers.

## LinkswapPriceOracle

- Provides USD pricing for ETH, LINK, and YFL.
- Provides token amounts for ETH or LINK, given a USD amount.
- Based on Uniswap's `ExampleOracleSimple`.
- Used by `LinkswapFactory` for listing fee calculation and minimum listing lockup amount calculation.
- Can be swapped out via a governance proposal later if necessary.

## LinkswapFactory

- Handles the creation of new pairs, and stores variables that apply to new and existing pairs.
- All variables can be changed via a governance proposal.

## LinkswapPair

- Contract created via `LinkswapFactory` for each pair.
- Based on `UniswapV2Pair`, with added functionality of timelocking liquidity and a circuit-breaker that prevents slippage of prices beyond a certain percent in either direction in a certain timeframe.
- Fees are customizable per-pair via a governance proposal.

## LinkswapRouter

- Contract based on `UniswapV2Router` and used for convenience by front-end.
- Has been modified to account for dynamic fees (set in `LinkswapPair`).
- New function is `createPairUsingETH`.

## YFLPurchaser

- Contract that handles the conversion of non-YFL tokens to YFL, and then sends all tokens back to the `yYFL` governance contract.
