import chai, {expect} from 'chai'
import {createFixtureLoader, deployContract, MockProvider, solidity} from 'ethereum-waffle'
import {ecsign} from 'ethereumjs-util'
import {Contract} from 'ethers'
import {AddressZero, MaxUint256} from 'ethers/constants'
import {BigNumber, bigNumberify} from 'ethers/utils'
import DeflatingLinkswapERC20Test from '../build/DeflatingLinkswapERC20Test.json'
import ILinkswapPair from '../build/ILinkswapPair.json'
import {routerFixture} from './shared/fixtures'
import {expandTo18Decimals, getApprovalDigest, MINIMUM_LIQUIDITY} from './shared/utilities'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

describe('LinkswapRouter', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet, other])

  let token0: Contract
  let token1: Contract
  let weth: Contract
  let link: Contract
  let router: Contract
  let factory: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(routerFixture)
    token0 = fixture.token0
    token1 = fixture.token1
    weth = fixture.weth
    link = fixture.link
    router = fixture.router
    factory = fixture.factory
  })

  it('createPairUsingETH:wethPair', async () => {
    await factory.setWethListingFeeInUsd(0)
    const wethAmount = expandTo18Decimals(25)
    expect(await token0.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    expect(await weth.balanceOf(wallet.address)).to.eq(0)

    const pair = await router.createPairUsingETH(token0.address, 0, weth.address, 0, 0, link.address, {
      ...overrides,
      value: wethAmount,
    })

    expect(pair).to.not.be.null
    expect(await token0.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    expect(await weth.balanceOf(wallet.address)).to.eq(wethAmount)
    expect(await weth.balanceOf(other.address)).to.eq(expandTo18Decimals(4164360))
  })

  it('createPairUsingETH:ethListingFee', async () => {
    const listingFeeTokenAmount = expandTo18Decimals(20)
    await factory.setWethListingFeeInUsd(listingFeeTokenAmount)
    await factory.setTreasury(other.address)
    await factory.setTreasuryListingFeeShare(1000000) // 100%
    const wethAmount = expandTo18Decimals(25)
    expect(await token0.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    expect(await link.balanceOf(wallet.address)).to.eq(0)
    expect(await weth.balanceOf(wallet.address)).to.eq(0)

    const pair = await router.createPairUsingETH(token0.address, 0, link.address, 0, 0, weth.address, {
      ...overrides,
      value: wethAmount,
    })

    expect(pair).to.not.be.null
    expect(await token0.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    expect(await link.balanceOf(wallet.address)).to.eq(0)
    expect(await weth.balanceOf(wallet.address)).to.eq(wethAmount.sub(listingFeeTokenAmount))
    expect(await weth.balanceOf(other.address)).to.eq(expandTo18Decimals(4164360).add(listingFeeTokenAmount))
  })

  it('createPairUsingETH:ethPairAndEthListingFee', async () => {
    const listingFeeTokenAmount = expandTo18Decimals(20)
    await factory.setWethListingFeeInUsd(listingFeeTokenAmount)
    await factory.setTreasury(other.address)
    await factory.setTreasuryListingFeeShare(1000000) // 100%
    const wethAmount = expandTo18Decimals(25)
    expect(await token0.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    expect(await weth.balanceOf(wallet.address)).to.eq(0)

    const pair = await router.createPairUsingETH(token0.address, 0, weth.address, 0, 0, weth.address, {
      ...overrides,
      value: wethAmount,
    })

    expect(pair).to.not.be.null
    expect(await token0.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    expect(await weth.balanceOf(wallet.address)).to.eq(wethAmount.sub(listingFeeTokenAmount))
    expect(await weth.balanceOf(other.address)).to.eq(expandTo18Decimals(4164360).add(listingFeeTokenAmount))
  })

  it('quote', async () => {
    expect(await router.quote(bigNumberify(1), bigNumberify(100), bigNumberify(200))).to.eq(bigNumberify(2))
    expect(await router.quote(bigNumberify(2), bigNumberify(200), bigNumberify(100))).to.eq(bigNumberify(1))
    await expect(router.quote(bigNumberify(0), bigNumberify(100), bigNumberify(200))).to.be.revertedWith(
      'LinkswapLibrary: INSUFFICIENT_AMOUNT'
    )
    await expect(router.quote(bigNumberify(1), bigNumberify(0), bigNumberify(200))).to.be.revertedWith(
      'LinkswapLibrary: INSUFFICIENT_LIQUIDITY'
    )
    await expect(router.quote(bigNumberify(1), bigNumberify(100), bigNumberify(0))).to.be.revertedWith(
      'LinkswapLibrary: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountOut', async () => {
    expect(await router.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(100), bigNumberify(3000))).to.eq(
      bigNumberify(1)
    )
    await expect(
      router.getAmountOut(bigNumberify(0), bigNumberify(100), bigNumberify(100), bigNumberify(3000))
    ).to.be.revertedWith('LinkswapLibrary: INSUFFICIENT_INPUT_AMOUNT')
    await expect(
      router.getAmountOut(bigNumberify(2), bigNumberify(0), bigNumberify(100), bigNumberify(3000))
    ).to.be.revertedWith('LinkswapLibrary: INSUFFICIENT_LIQUIDITY')
    await expect(
      router.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(0), bigNumberify(3000))
    ).to.be.revertedWith('LinkswapLibrary: INSUFFICIENT_LIQUIDITY')
  })

  it('getAmountIn', async () => {
    expect(await router.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(100), bigNumberify(3000))).to.eq(
      bigNumberify(2)
    )
    await expect(
      router.getAmountIn(bigNumberify(0), bigNumberify(100), bigNumberify(100), bigNumberify(3000))
    ).to.be.revertedWith('LinkswapLibrary: INSUFFICIENT_OUTPUT_AMOUNT')
    await expect(
      router.getAmountIn(bigNumberify(1), bigNumberify(0), bigNumberify(100), bigNumberify(3000))
    ).to.be.revertedWith('LinkswapLibrary: INSUFFICIENT_LIQUIDITY')
    await expect(
      router.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(0), bigNumberify(3000))
    ).to.be.revertedWith('LinkswapLibrary: INSUFFICIENT_LIQUIDITY')
  })

  it('getAmountsOut', async () => {
    await token0.approve(router.address, MaxUint256)
    await token1.approve(router.address, MaxUint256)
    await router.addLiquidity(
      token0.address,
      token1.address,
      bigNumberify(10000),
      bigNumberify(10000),
      0,
      0,
      wallet.address,
      MaxUint256,
      overrides
    )
    await expect(router.getAmountsOut(bigNumberify(2), [token0.address])).to.be.revertedWith(
      'LinkswapLibrary: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    expect(await router.getAmountsOut(bigNumberify(2), path)).to.deep.eq([bigNumberify(2), bigNumberify(1)])
  })

  it('getAmountsIn', async () => {
    await token0.approve(router.address, MaxUint256)
    await token1.approve(router.address, MaxUint256)
    await router.addLiquidity(
      token0.address,
      token1.address,
      bigNumberify(10000),
      bigNumberify(10000),
      0,
      0,
      wallet.address,
      MaxUint256,
      overrides
    )
    await expect(router.getAmountsIn(bigNumberify(1), [token0.address])).to.be.revertedWith(
      'LinkswapLibrary: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    expect(await router.getAmountsIn(bigNumberify(1), path)).to.deep.eq([bigNumberify(2), bigNumberify(1)])
  })
})

describe('fee-on-transfer tokens', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet, other])

  // DTT = Deflating Test Token
  let dtt: Contract
  let weth: Contract
  let router: Contract
  let pair: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(routerFixture)

    weth = fixture.weth
    router = fixture.router

    dtt = await deployContract(wallet, DeflatingLinkswapERC20Test, [expandTo18Decimals(10000)])

    // make a DTT<>WETH pair
    await fixture.factory.approvePairViaGovernance(dtt.address, weth.address)
    await fixture.factory.connect(other).createPair(dtt.address, 0, weth.address, 0, 0, AddressZero)
    const pairAddress = await fixture.factory.getPair(dtt.address, weth.address)
    pair = new Contract(pairAddress, JSON.stringify(ILinkswapPair.abi), provider).connect(wallet)
  })

  afterEach(async () => {
    expect(await provider.getBalance(router.address)).to.eq(0)
  })

  async function addLiquidity(dttAmount: BigNumber, wethAmount: BigNumber) {
    await dtt.approve(router.address, MaxUint256)
    await router.addLiquidityETH(dtt.address, dttAmount, dttAmount, wethAmount, wallet.address, MaxUint256, {
      ...overrides,
      value: wethAmount,
    })
  }

  it('removeLiquidityETHSupportingFeeOnTransferTokens', async () => {
    const dttAmount = expandTo18Decimals(1)
    const ethAmount = expandTo18Decimals(4)
    await addLiquidity(dttAmount, ethAmount)

    const dttInPair = await dtt.balanceOf(pair.address)
    const wethInPair = await weth.balanceOf(pair.address)
    const liquidity = await pair.balanceOf(wallet.address)
    const totalSupply = await pair.totalSupply()
    const naiveDttExpected = dttInPair.mul(liquidity).div(totalSupply)
    const wethExpected = wethInPair.mul(liquidity).div(totalSupply)

    await pair.approve(router.address, MaxUint256)
    await router.removeLiquidityETHSupportingFeeOnTransferTokens(
      dtt.address,
      liquidity,
      naiveDttExpected,
      wethExpected,
      wallet.address,
      MaxUint256,
      overrides
    )
  })

  it('removeLiquidityETHWithPermitSupportingFeeOnTransferTokens', async () => {
    const dttAmount = expandTo18Decimals(1).mul(100).div(99)
    const ethAmount = expandTo18Decimals(4)
    await addLiquidity(dttAmount, ethAmount)

    const expectedLiquidity = expandTo18Decimals(2)

    const nonce = await pair.nonces(wallet.address)
    const digest = await getApprovalDigest(
      pair,
      {owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY)},
      nonce,
      MaxUint256
    )
    const {v, r, s} = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    const dttInPair = await dtt.balanceOf(pair.address)
    const wethInPair = await weth.balanceOf(pair.address)
    const liquidity = await pair.balanceOf(wallet.address)
    const totalSupply = await pair.totalSupply()
    const naiveDttExpected = dttInPair.mul(liquidity).div(totalSupply)
    const wethExpected = wethInPair.mul(liquidity).div(totalSupply)

    await pair.approve(router.address, MaxUint256)
    await router.removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
      dtt.address,
      liquidity,
      naiveDttExpected,
      wethExpected,
      wallet.address,
      MaxUint256,
      false,
      v,
      r,
      s,
      overrides
    )
  })

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const dttAmount = expandTo18Decimals(5).mul(100).div(99)
    const ethAmount = expandTo18Decimals(10)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(dttAmount, ethAmount)
    })

    it('DTT -> WETH', async () => {
      await dtt.approve(router.address, MaxUint256)
      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [dtt.address, weth.address],
        wallet.address,
        MaxUint256,
        overrides
      )
    })

    // WETH -> DTT
    it('WETH -> DTT', async () => {
      await weth.connect(other).deposit({value: amountIn}) // mint WETH
      await weth.connect(other).approve(router.address, MaxUint256)
      await router
        .connect(other)
        .swapExactTokensForTokensSupportingFeeOnTransferTokens(
          amountIn,
          0,
          [weth.address, dtt.address],
          wallet.address,
          MaxUint256,
          overrides
        )
    })
  })

  // ETH -> DTT
  it('swapExactETHForTokensSupportingFeeOnTransferTokens', async () => {
    const dttAmount = expandTo18Decimals(10).mul(100).div(99)
    const ethAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)
    await addLiquidity(dttAmount, ethAmount)

    await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [weth.address, dtt.address],
      wallet.address,
      MaxUint256,
      {
        ...overrides,
        value: swapAmount,
      }
    )
  })

  // DTT -> ETH
  it('swapExactTokensForETHSupportingFeeOnTransferTokens', async () => {
    const dttAmount = expandTo18Decimals(5).mul(100).div(99)
    const ethAmount = expandTo18Decimals(10)
    const swapAmount = expandTo18Decimals(1)

    await addLiquidity(dttAmount, ethAmount)
    await dtt.approve(router.address, MaxUint256)

    await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      swapAmount,
      0,
      [dtt.address, weth.address],
      wallet.address,
      MaxUint256,
      overrides
    )
  })
})

describe('fee-on-transfer tokens: reloaded', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet, other])

  let dtt: Contract
  let dtt2: Contract
  let router: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(routerFixture)

    router = fixture.router

    dtt = await deployContract(wallet, DeflatingLinkswapERC20Test, [expandTo18Decimals(10000)])
    dtt2 = await deployContract(wallet, DeflatingLinkswapERC20Test, [expandTo18Decimals(10000)])

    // make a DTT<>WETH pair
    await fixture.factory.approvePairViaGovernance(dtt.address, dtt2.address)
    await fixture.factory.connect(other).createPair(dtt.address, 0, dtt2.address, 0, 0, AddressZero)
    await fixture.factory.getPair(dtt.address, dtt2.address)
  })

  afterEach(async () => {
    expect(await provider.getBalance(router.address)).to.eq(0)
  })

  async function addLiquidity(dttAmount: BigNumber, dtt2Amount: BigNumber) {
    await dtt.approve(router.address, MaxUint256)
    await dtt2.approve(router.address, MaxUint256)
    await router.addLiquidity(
      dtt.address,
      dtt2.address,
      dttAmount,
      dtt2Amount,
      dttAmount,
      dtt2Amount,
      wallet.address,
      MaxUint256,
      overrides
    )
  }

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const dttAmount = expandTo18Decimals(5).mul(100).div(99)
    const dtt2Amount = expandTo18Decimals(5)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(dttAmount, dtt2Amount)
    })

    it('DTT -> DTT2', async () => {
      await dtt.approve(router.address, MaxUint256)
      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [dtt.address, dtt2.address],
        wallet.address,
        MaxUint256,
        overrides
      )
    })
  })
})
