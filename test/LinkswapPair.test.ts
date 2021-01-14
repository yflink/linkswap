import chai, {expect} from 'chai'
import {createFixtureLoader, MockProvider, solidity} from 'ethereum-waffle'
import {Contract} from 'ethers'
import {AddressZero} from 'ethers/constants'
import {BigNumber, bigNumberify} from 'ethers/utils'
import {pairFixture} from './shared/fixtures'
import {encodePrice, expandTo18Decimals, expandToDecimals, mineBlock} from './shared/utilities'

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

describe('LinkswapPair', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet, other])

  let factory: Contract
  let linkAddress: string
  let wethAddress: string
  let token0: Contract
  let token1: Contract
  let pair: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(pairFixture)
    factory = fixture.factory
    linkAddress = fixture.link.address
    wethAddress = fixture.weth.address
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
  })

  async function lock(lockupPeriod: BigNumber, liquidityLockupAmount: BigNumber) {
    await addLiquidity(expandTo18Decimals(1), expandTo18Decimals(4))
    const totalLiquidity = expandTo18Decimals(2)
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(0)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(0)
    expect(await pair.totalSupply()).to.eq(totalLiquidity)
    expect(await pair.balanceOf(AddressZero)).to.eq(MINIMUM_LIQUIDITY)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await pair.balanceOf(pair.address)).to.eq(0)
    await pair.lock(lockupPeriod, liquidityLockupAmount)
  }

  it('lock:insufficientLiquidity', async () => {
    await addLiquidity(expandTo18Decimals(1), expandTo18Decimals(4))
    const lockupPeriod = 3600
    // fails because it doesn't subtract MINIMUM_LIQUIDITY
    const liquidityLockupAmount = expandTo18Decimals(2)

    await expect(pair.lock(lockupPeriod, liquidityLockupAmount)).to.be.revertedWith('ds-math-sub-underflow')
  })

  it('lock:lockAgain:zeroPeriodZeroAmount', async () => {
    const lockupPeriod = bigNumberify(3600)
    const totalLiquidity = expandTo18Decimals(2)
    const liquidityLockupAmount = totalLiquidity.sub(MINIMUM_LIQUIDITY)
    await lock(lockupPeriod, liquidityLockupAmount)

    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY).sub(liquidityLockupAmount))
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)

    await pair.lock(0, 0)

    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY).sub(liquidityLockupAmount))
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)
  })

  it('lock:lockAgain:zeroPeriodPositiveAmount', async () => {
    const lockupPeriod = bigNumberify(3600)
    const liquidityLockupAmount = expandTo18Decimals(2).sub(MINIMUM_LIQUIDITY)
    await lock(lockupPeriod, liquidityLockupAmount)

    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(0)
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)

    await addLiquidity(expandTo18Decimals(1), expandTo18Decimals(4))
    const secondLockupAmount = bigNumberify(100)
    await pair.lock(0, secondLockupAmount)

    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount.add(secondLockupAmount))
    expect(await pair.balanceOf(wallet.address)).to.eq(expandTo18Decimals(2).sub(secondLockupAmount))
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount.add(secondLockupAmount))
  })

  it('lock:lockAgain:positivePeriodZeroAmount', async () => {
    const lockupPeriod = bigNumberify(3600)
    const liquidityLockupAmount = expandTo18Decimals(2).sub(MINIMUM_LIQUIDITY)
    await lock(lockupPeriod, liquidityLockupAmount)

    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(0)
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)

    await addLiquidity(expandTo18Decimals(1), expandTo18Decimals(4))
    const secondLockupPeriod = bigNumberify(1)
    await pair.lock(secondLockupPeriod, 0)

    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp.add(secondLockupPeriod))
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(expandTo18Decimals(2))
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)
  })

  it('lock:lockAgain:positivePeriodPositiveAmount', async () => {
    const lockupPeriod = bigNumberify(3600)
    const liquidityLockupAmount = expandTo18Decimals(2).sub(MINIMUM_LIQUIDITY)
    await lock(lockupPeriod, liquidityLockupAmount)

    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(0)
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)

    await addLiquidity(expandTo18Decimals(1), expandTo18Decimals(4))
    const secondLockupPeriod = bigNumberify(1)
    const secondLockupAmount = bigNumberify(100)
    await pair.lock(secondLockupPeriod, secondLockupAmount)

    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp.add(secondLockupPeriod))
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount.add(secondLockupAmount))
    expect(await pair.balanceOf(wallet.address)).to.eq(expandTo18Decimals(2).sub(secondLockupAmount))
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount.add(secondLockupAmount))
  })

  it('lock:zeroPeriod', async () => {
    await expect(pair.lock(0, bigNumberify(1))).to.be.revertedWith('Pair: ZERO_LOCKUP_PERIOD')
  })

  it('lock:zeroAmount', async () => {
    await expect(pair.lock(bigNumberify(1), 0)).to.be.revertedWith('Pair: ZERO_LOCKUP_AMOUNT')
  })

  it('lock:zeroPeriodZeroAmount', async () => {
    const totalLiquidity = expandTo18Decimals(2)
    await lock(bigNumberify(0), bigNumberify(0))

    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(0)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(0)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await pair.balanceOf(pair.address)).to.eq(0)
  })

  it('unlock:alreadyUnlocked', async () => {
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(0)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(0)
    await pair.unlock()
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(0)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(0)
  })

  it('unlock:beforeExpiry', async () => {
    const lockupPeriod = bigNumberify(3600)
    const totalLiquidity = expandTo18Decimals(2)
    const liquidityLockupAmount = totalLiquidity.sub(MINIMUM_LIQUIDITY)
    await lock(lockupPeriod, liquidityLockupAmount)

    await expect(pair.unlock()).to.be.revertedWith('Pair: BEFORE_EXPIRY')
  })

  async function lockAndUnlock(lockupPeriod: BigNumber, liquidityLockupAmount: BigNumber) {
    await lock(lockupPeriod, liquidityLockupAmount)

    const totalLiquidity = expandTo18Decimals(2)
    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY).sub(liquidityLockupAmount))
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)

    await mineBlock(provider, expiryTimestamp.toNumber())
    await pair.unlock()

    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(0)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(0)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await pair.balanceOf(pair.address)).to.eq(0)
  }

  it('lock/unlock:allLiquidity', async () => {
    const lockupPeriod = bigNumberify(3600)
    const totalLiquidity = expandTo18Decimals(2)
    const liquidityLockupAmount = totalLiquidity.sub(MINIMUM_LIQUIDITY)
    await lockAndUnlock(lockupPeriod, liquidityLockupAmount)
  })

  it('lock/unlock:partialLiquidity', async () => {
    const lockupPeriod = bigNumberify(3600)
    const totalLiquidity = expandTo18Decimals(2)
    const liquidityLockupAmount = totalLiquidity.sub(MINIMUM_LIQUIDITY).div(2)
    await lock(lockupPeriod, liquidityLockupAmount)

    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(liquidityLockupAmount)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY).sub(liquidityLockupAmount))
    expect(await pair.balanceOf(pair.address)).to.eq(liquidityLockupAmount)

    await mineBlock(provider, expiryTimestamp.toNumber())
    await pair.unlock()

    expect(await pair.addressToLockupExpiry(wallet.address)).to.eq(0)
    expect(await pair.addressToLockupAmount(wallet.address)).to.eq(0)
    expect(await pair.balanceOf(wallet.address)).to.eq(totalLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await pair.balanceOf(pair.address)).to.eq(0)
  })

  it('mint', async () => {
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    // sqrt(1*4) = 2
    const expectedLiquidity = expandTo18Decimals(2)
    await expect(pair.mint(wallet.address, overrides))
      .to.emit(pair, 'Transfer')
      .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(pair, 'Transfer')
      .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount, token1Amount)
      .to.emit(pair, 'Mint')
      .withArgs(wallet.address, token0Amount, token1Amount)

    expect(await pair.totalSupply()).to.eq(expectedLiquidity)
    expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount)
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount)
    expect(reserves[1]).to.eq(token1Amount)
  })

  async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.mint(wallet.address, overrides)
  }
  const swapTestCases: BigNumber[][] = [
    [1, 5, 10, '1662497915624478906'],
    [1, 10, 5, '453305446940074565'],

    [2, 5, 10, '2851015155847869602'],
    [2, 10, 5, '831248957812239453'],

    [1, 10, 10, '906610893880149131'],
    [1, 100, 100, '987158034397061298'],
    [1, 1000, 1000, '996006981039903216'],
  ].map((a) => a.map((n) => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))
  swapTestCases.forEach((swapTestCase, i) => {
    it(`getInputPrice:${i}`, async () => {
      const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
      await addLiquidity(token0Amount, token1Amount)
      await token0.transfer(pair.address, swapAmount)
      await expect(pair.swap(0, expectedOutputAmount.add(1), wallet.address, '0x', overrides)).to.be.revertedWith(
        'Pair: K'
      )
      await pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)
    })
  })

  const optimisticTestCases: BigNumber[][] = [
    ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
    ['997000000000000000', 10, 5, 1],
    ['997000000000000000', 5, 5, 1],
    [1, 5, 5, '1003009027081243732'], // given amountOut, amountIn = ceiling(amountOut / .997)
  ].map((a) => a.map((n) => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))
  optimisticTestCases.forEach((optimisticTestCase, i) => {
    it(`optimistic:${i}`, async () => {
      const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
      await addLiquidity(token0Amount, token1Amount)
      await token0.transfer(pair.address, inputAmount)
      await expect(pair.swap(outputAmount.add(1), 0, wallet.address, '0x', overrides)).to.be.revertedWith('Pair: K')
      await pair.swap(outputAmount, 0, wallet.address, '0x', overrides)
    })
  })

  it('swap:feeChanged', async () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount)
    await pair.setTradingFeePercent(bigNumberify(1234)) // set fee to 0.1234%

    const swapAmount = expandTo18Decimals(1)
    // (1000000-1234)*swapAmount*token1Amount / ((1000000-1234)*swapAmount+1000000*token0Amount)
    const expectedOutputAmount = bigNumberify('1664952425215452644')
    await token0.transfer(pair.address, swapAmount)

    await expect(pair.swap(0, expectedOutputAmount.add(1), wallet.address, '0x', overrides)).to.be.revertedWith(
      'Pair: K'
    )

    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides))
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, wallet.address, expectedOutputAmount)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount.add(swapAmount))
    expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount))
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount))
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount))
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount))
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount))
  })

  async function upwardSlippageSetup() {
    const initialBlock = (await provider.getBlock('latest')).number
    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(token0Amount, token1Amount)
    await factory.setMaxSlippagePercent(1)
    await factory.setMaxSlippageBlocks(100)
    expect(await pair.lastSlippageBlocks()).to.eq(0)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(0)
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 5)

    // first trade sets initial priceAtLastSlippageBlocks ~= 1
    const swapAmount = bigNumberify(1000)
    await token0.transfer(pair.address, swapAmount)
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 6)
    // 0.997*swapAmount*token1Amount / (0.997*swapAmount+token0Amount)
    const expectedOutputAmount = bigNumberify(996)
    await pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 7)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 7)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(expandTo18Decimals(1).add(bigNumberify(1)))
  }

  it('swap:sliplock:tooMuchUpwardSlippage', async () => {
    await upwardSlippageSetup()

    const swapAmount = expandToDecimals(4996, 15) // >1% slippage
    const expectedOutputAmount = bigNumberify('4956324488248142135')
    await token0.transfer(pair.address, swapAmount)
    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)).to.be.revertedWith(
      'Pair: SlipLock'
    )
  })

  it('swap:sliplock:maxUpwardSlippage', async () => {
    const initialBlock = (await provider.getBlock('latest')).number
    await upwardSlippageSetup()

    let swapAmount = expandToDecimals(4995, 15) // slightly under 1% slippage
    let expectedOutputAmount = bigNumberify('4955337345688411515')
    await token0.transfer(pair.address, swapAmount)
    await pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 7)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(expandTo18Decimals(1).add(bigNumberify(1)))

    swapAmount = expandToDecimals(55, 12) // this amount will cause total slippage to exceed 1%
    expectedOutputAmount = bigNumberify('54292082149207')
    await token0.transfer(pair.address, swapAmount)
    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)).to.be.revertedWith(
      'Pair: SlipLock'
    )
    // will succeed after maxSlippageBlocks=100
    for (let i = 0; i < 100; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    }
    await pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 112)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(bigNumberify('1010000000556907965'))
  })

  it('swap:sliplock:maxUpwardSlippage:afterReset', async () => {
    const initialBlock = (await provider.getBlock('latest')).number
    await upwardSlippageSetup()

    let swapAmount = expandToDecimals(4995, 15) // slightly under 1% slippage
    let expectedOutputAmount = bigNumberify('4955337345688411515')
    await token0.transfer(pair.address, swapAmount)
    await pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 7)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(expandTo18Decimals(1).add(bigNumberify(1)))

    // after maxSlippageBlocks=100
    for (let i = 0; i < 100; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    }
    expect(await pair.lastSwapPrice()).to.eq(bigNumberify('1009999890174925002'))

    // this will fail (>1% away from lastSwapPrice)
    swapAmount = expandTo18Decimals(10)
    expectedOutputAmount = bigNumberify('9774322549707119474')
    await token0.transfer(pair.address, swapAmount)
    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides)).to.be.revertedWith(
      'Pair: SlipLock'
    )
  })

  async function downwardSlippageSetup() {
    const initialBlock = (await provider.getBlock('latest')).number
    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(token0Amount, token1Amount)
    await factory.setMaxSlippagePercent(1)
    await factory.setMaxSlippageBlocks(100)
    expect(await pair.lastSlippageBlocks()).to.eq(0)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(0)
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 5)

    // first trade sets initial priceAtLastSlippageBlocks ~= 1
    const swapAmount = bigNumberify(1000)
    await token1.transfer(pair.address, swapAmount)
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 6)
    // 0.997*swapAmount*token1Amount / (0.997*swapAmount+token0Amount)
    const expectedOutputAmount = bigNumberify(996)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 7)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 7)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(expandTo18Decimals(1).sub(bigNumberify(2)))
  }

  it('swap:sliplock:tooMuchDownwardSlippage', async () => {
    await downwardSlippageSetup()

    const swapAmount = expandToDecimals(5046, 15) // >1% slippage
    const expectedOutputAmount = bigNumberify('47898892803526643342')
    await token0.transfer(pair.address, swapAmount)
    await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)).to.be.revertedWith(
      'Pair: SlipLock'
    )
  })

  it('swap:sliplock:downwardSlippage', async () => {
    const initialBlock = (await provider.getBlock('latest')).number
    await downwardSlippageSetup()

    let swapAmount = expandToDecimals(5045, 15) // slightly under 1% slippage
    let expectedOutputAmount = bigNumberify('5004692074498701578')
    await token1.transfer(pair.address, swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 7)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(expandTo18Decimals(1).sub(bigNumberify(2)))

    swapAmount = expandToDecimals(27, 15) // this amount will cause total slippage to exceed 1%
    expectedOutputAmount = bigNumberify('26649116533566758')
    await token1.transfer(pair.address, swapAmount)
    await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)).to.be.revertedWith(
      'Pair: SlipLock'
    )
    // after maxSlippageBlocks=100
    for (let i = 0; i < 100; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    }

    // this will succeed (<1% away from lastSwapPrice)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 112)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(bigNumberify('989947644356790090'))
  })

  it('swap:sliplock:downwardSlippage:afterReset', async () => {
    const initialBlock = (await provider.getBlock('latest')).number
    await downwardSlippageSetup()

    let swapAmount = expandToDecimals(5045, 15) // slightly under 1% slippage
    let expectedOutputAmount = bigNumberify('5004692074498701578')
    await token1.transfer(pair.address, swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)
    expect(await pair.lastSlippageBlocks()).to.eq(initialBlock + 7)
    expect(await pair.priceAtLastSlippageBlocks()).to.eq(expandTo18Decimals(1).sub(bigNumberify(2)))

    // after maxSlippageBlocks=100
    for (let i = 0; i < 100; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    }

    // this will fail (>1% away from lastSwapPrice)
    swapAmount = expandTo18Decimals(100)
    expectedOutputAmount = bigNumberify('89795411792017596154')
    await token1.transfer(pair.address, swapAmount)
    await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)).to.be.revertedWith(
      'Pair: SlipLock'
    )
  })

  it('swap:token0', async () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bigNumberify('1662497915624478906')
    await token0.transfer(pair.address, swapAmount)
    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x', overrides))
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, wallet.address, expectedOutputAmount)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount.add(swapAmount))
    expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount))
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount))
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount))
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount))
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount))
  })

  it('swap:token1', async () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bigNumberify('453305446940074565')
    await token1.transfer(pair.address, swapAmount)
    await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides))
      .to.emit(token0, 'Transfer')
      .withArgs(pair.address, wallet.address, expectedOutputAmount)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount.sub(expectedOutputAmount), token1Amount.add(swapAmount))
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, 0, swapAmount, expectedOutputAmount, 0, wallet.address)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount))
    expect(reserves[1]).to.eq(token1Amount.add(swapAmount))
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount))
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount))
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount))
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(token1Amount).sub(swapAmount))
  })

  it('burn', async () => {
    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(token0Amount, token1Amount)

    const expectedLiquidity = expandTo18Decimals(3)
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await expect(pair.burn(wallet.address, overrides))
      .to.emit(pair, 'Transfer')
      .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(token0, 'Transfer')
      .withArgs(pair.address, wallet.address, token0Amount.sub(1000))
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, wallet.address, token1Amount.sub(1000))
      .to.emit(pair, 'Sync')
      .withArgs(1000, 1000)
      .to.emit(pair, 'Burn')
      .withArgs(wallet.address, token0Amount.sub(1000), token1Amount.sub(1000), wallet.address)

    expect(await pair.balanceOf(wallet.address)).to.eq(0)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
    expect(await token0.balanceOf(pair.address)).to.eq(1000)
    expect(await token1.balanceOf(pair.address)).to.eq(1000)
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(1000))
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(1000))
  })

  it('price{0,1}CumulativeLast', async () => {
    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(token0Amount, token1Amount)

    const blockTimestamp = (await pair.getReserves())[2]
    await mineBlock(provider, blockTimestamp + 1)
    await pair.sync(overrides)

    const initialPrice = encodePrice(token0Amount, token1Amount)
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 1)

    const swapAmount = expandTo18Decimals(3)
    await token0.transfer(pair.address, swapAmount)
    await mineBlock(provider, blockTimestamp + 10)
    // swap to a new price eagerly instead of syncing
    await pair.swap(0, expandTo18Decimals(1), wallet.address, '0x', overrides) // make the price nice

    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10))
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10))
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10)

    await mineBlock(provider, blockTimestamp + 20)
    await pair.sync(overrides)

    const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10).add(newPrice[0].mul(10)))
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10).add(newPrice[1].mul(10)))
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20)
  })

  it('protocolFee:off', async () => {
    await factory.setProtocolFeeFractionInverse(0)

    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bigNumberify('996006981039903216')
    await token1.transfer(pair.address, swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)

    const expectedLiquidity = expandTo18Decimals(1000)
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await pair.burn(wallet.address, overrides)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
  })

  it('protocolFee:on', async () => {
    await factory.setProtocolFeeFractionInverse(6000)
    await factory.setTreasury(other.address)

    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bigNumberify('996006981039903216')
    await token1.transfer(pair.address, swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)

    const expectedLiquidity = expandTo18Decimals(1000)
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await pair.burn(wallet.address, overrides)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add('249750499251388'))
    expect(await pair.balanceOf(other.address)).to.eq('249750499251388')

    // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
    // ...because the initial liquidity amounts were equal
    expect(await token0.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('249501683697445'))
    expect(await token1.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('250000187312969'))
  })

  it('protocolFee:on:changedAndSplit', async () => {
    await factory.setProtocolFeeFractionInverse(2000)
    await factory.setTreasuryProtocolFeeShare(250000)
    await factory.setTreasury(other.address)
    await factory.setGovernance(wallet.address)

    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bigNumberify('996006981039903216')
    await token1.transfer(pair.address, swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x', overrides)

    const expectedLiquidity = expandTo18Decimals(1000)
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await pair.burn(wallet.address, overrides)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add('749251872006221'))
    expect(await pair.balanceOf(other.address)).to.eq('187312968001555')
    expect(await pair.balanceOf(wallet.address)).to.eq('561938904004666')

    // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
    // ...because the initial liquidity amounts were equal
    expect(await token0.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('748505051092334'))
    expect(await token1.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('750000561938904'))
  })

  it('setTradingFeePercent', async () => {
    expect(await pair.tradingFeePercent()).to.be.eq(bigNumberify(3000))
    await expect(pair.connect(other).setTradingFeePercent(bigNumberify(0))).to.be.revertedWith('Pair: FORBIDDEN')
    // Same fee
    await pair.setTradingFeePercent(bigNumberify(3000))
    expect(await pair.tradingFeePercent()).to.be.eq(bigNumberify(3000))
    // Zero fee
    await pair.setTradingFeePercent(bigNumberify(0))
    expect(await pair.tradingFeePercent()).to.be.eq(bigNumberify(0))
    // 1% fee
    await pair.setTradingFeePercent(bigNumberify(10000))
    expect(await pair.tradingFeePercent()).to.be.eq(bigNumberify(10000))
    // 1.0001% fee (too high)
    await expect(pair.setTradingFeePercent(bigNumberify(10001))).to.be.revertedWith('Pair: INVALID_TRADING_FEE_PERCENT')
  })
})
