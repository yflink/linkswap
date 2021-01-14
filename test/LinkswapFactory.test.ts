import chai, {expect} from 'chai'
import {createFixtureLoader, MockProvider, solidity} from 'ethereum-waffle'
import {Contract} from 'ethers'
import {AddressZero} from 'ethers/constants'
import {bigNumberify} from 'ethers/utils'
import LinkswapPair from '../build/LinkswapPair.json'
import {factoryFixture} from './shared/fixtures'
import {expandTo18Decimals, getCreate2Address, MINIMUM_LIQUIDITY} from './shared/utilities'

chai.use(solidity)

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
]

describe('LinkswapFactory', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet, other])

  let factory: Contract
  let link: Contract
  let weth: Contract
  let yfl: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(factoryFixture)
    factory = fixture.factory
    link = fixture.link
    weth = fixture.weth
    yfl = fixture.yfl
  })

  it('initial values', async () => {
    expect(await factory.LINK()).to.eq(link.address)
    expect(await factory.WETH()).to.eq(weth.address)
    expect(await factory.YFL()).to.eq(yfl.address)
    expect(await factory.governance()).to.eq(wallet.address)
    expect(await factory.treasury()).to.eq(wallet.address)
    expect(await factory.linkListingFeeInUsd()).to.eq(0)
    expect(await factory.wethListingFeeInUsd()).to.eq(0)
    expect(await factory.yflListingFeeInUsd()).to.eq(0)
    expect(await factory.treasuryListingFeeShare()).to.eq(bigNumberify(100000))
    expect(await factory.minListingLockupAmountInUsd()).to.eq(0)
    expect(await factory.targetListingLockupAmountInUsd()).to.eq(0)
    expect(await factory.minListingLockupPeriod()).to.eq(0)
    expect(await factory.targetListingLockupPeriod()).to.eq(0)
    expect(await factory.lockupAmountListingFeeDiscountShare()).to.eq(100000)
    expect(await factory.defaultLinkTradingFeePercent()).to.eq(2500)
    expect(await factory.defaultNonLinkTradingFeePercent()).to.eq(3000)
    expect(await factory.treasuryProtocolFeeShare()).to.eq(1000000)
    expect(await factory.protocolFeeFractionInverse()).to.eq(0)
    expect(await factory.maxSlippagePercent()).to.eq(0)
    expect(await factory.maxSlippageBlocks()).to.eq(1)
    expect(await factory.allPairsLength()).to.eq(0)
  })

  async function createPairViaGovernance(tokens: [string, string]) {
    const bytecode = `0x${LinkswapPair.evm.bytecode.object}`
    const create2Address = getCreate2Address(factory.address, tokens, bytecode)
    await expect(factory.connect(other).createPair(tokens[0], 0, tokens[1], 0, 0, AddressZero))
      .to.emit(factory, 'PairCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, bigNumberify(1))

    await expect(factory.connect(other).createPair(tokens[0], 0, tokens[1], 0, 0, AddressZero)).to.be.reverted
    await expect(factory.connect(other).createPair(tokens[1], 0, tokens[0], 0, 0, AddressZero)).to.be.reverted
    expect(await factory.getPair(...tokens)).to.eq(create2Address)
    expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = new Contract(create2Address, JSON.stringify(LinkswapPair.abi), provider)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  it('approvePairViaGovernance:notGovernance', async () => {
    await expect(factory.connect(other).approvePairViaGovernance(...TEST_ADDRESSES)).to.be.reverted
  })

  it('approvePairViaGovernance:identicalAddresses', async () => {
    await expect(factory.approvePairViaGovernance(link.address, link.address)).to.be.reverted
  })

  it('approvePairViaGovernance:zeroAddress', async () => {
    await expect(factory.approvePairViaGovernance(AddressZero, link.address)).to.be.reverted
    await expect(factory.approvePairViaGovernance(link.address, AddressZero)).to.be.reverted
  })

  it('approvePairViaGovernance:success', async () => {
    expect(await factory.approvedPair(...TEST_ADDRESSES)).to.be.false
    await factory.approvePairViaGovernance(...TEST_ADDRESSES)
    expect(await factory.approvedPair(...TEST_ADDRESSES)).to.be.true
  })

  it('approvePairViaGovernance:reverse', async () => {
    expect(await factory.approvedPair(...TEST_ADDRESSES)).to.be.false
    await factory.approvePairViaGovernance(TEST_ADDRESSES[1], TEST_ADDRESSES[0])
    expect(await factory.approvedPair(...TEST_ADDRESSES)).to.be.true
  })

  it('createPairViaGovernance', async () => {
    expect(await factory.approvedPair(...TEST_ADDRESSES)).to.be.false
    await factory.approvePairViaGovernance(...TEST_ADDRESSES)
    expect(await factory.approvedPair(...TEST_ADDRESSES)).to.be.true
    await createPairViaGovernance(TEST_ADDRESSES)
  })

  it('createPair:identicalAddresses', async () => {
    await expect(factory.connect(other).createPair(link.address, 0, link.address, 0, 0, AddressZero)).to.be.reverted
  })

  it('createPair:zeroAddress', async () => {
    await expect(factory.connect(other).createPair(AddressZero, 0, link.address, 0, 0, AddressZero)).to.be.reverted
    await expect(factory.connect(other).createPair(link.address, 0, AddressZero, 0, 0, AddressZero)).to.be.reverted
  })

  it('createPair:governance', async () => {
    await expect(factory.createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, AddressZero)).to.be.reverted
  })

  it('createPair:linkPair', async () => {
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, weth.address)
  })

  it('createPair:linkWethPair', async () => {
    await factory.connect(other).createPair(link.address, 0, weth.address, 0, 0, weth.address)
  })

  it('createPair:wethPair', async () => {
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, weth.address, 0, 0, weth.address)
  })

  it('createPair:linkPair:feeChanged', async () => {
    await factory.setDefaultLinkTradingFeePercent(2000)
    await factory.setDefaultNonLinkTradingFeePercent(10000)
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, weth.address)

    const bytecode = `0x${LinkswapPair.evm.bytecode.object}`
    const create2Address = getCreate2Address(factory.address, [TEST_ADDRESSES[0], link.address], bytecode)
    const pair = new Contract(create2Address, JSON.stringify(LinkswapPair.abi), provider)
    expect(await pair.tradingFeePercent()).to.eq(2000)
  })

  it('createPair:nonLinkPair:feeChanged', async () => {
    await factory.setDefaultLinkTradingFeePercent(2000)
    await factory.setDefaultNonLinkTradingFeePercent(10000)
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, weth.address, 0, 0, weth.address)

    const bytecode = `0x${LinkswapPair.evm.bytecode.object}`
    const create2Address = getCreate2Address(factory.address, [TEST_ADDRESSES[0], weth.address], bytecode)
    const pair = new Contract(create2Address, JSON.stringify(LinkswapPair.abi), provider)
    expect(await pair.tradingFeePercent()).to.eq(10000)
  })

  it('createPair:linkListingFee', async () => {
    const listingFeeTokenAmount = expandTo18Decimals(1)
    // the test price oracle will return the same token amount as the usd amount
    await factory.setLinkListingFeeInUsd(listingFeeTokenAmount)
    expect(await link.balanceOf(other.address)).to.eq(expandTo18Decimals(1000000000))
    await link.connect(other).approve(factory.address, listingFeeTokenAmount)
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, link.address)
    expect(await link.balanceOf(other.address)).to.eq(expandTo18Decimals(1000000000 - 1))
  })

  it('createPair:wethListingFee', async () => {
    const listingFeeTokenAmount = expandTo18Decimals(1)
    // the test price oracle will return the same token amount as the usd amount
    await factory.setWethListingFeeInUsd(listingFeeTokenAmount)
    expect(await weth.balanceOf(other.address)).to.eq(expandTo18Decimals(4164360))
    await weth.connect(other).approve(factory.address, listingFeeTokenAmount)
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, weth.address)
    expect(await weth.balanceOf(other.address)).to.eq(expandTo18Decimals(4164360).sub(listingFeeTokenAmount))
  })

  it('createPair:yflListingFee', async () => {
    const listingFeeTokenAmount = expandTo18Decimals(1)
    // the test price oracle will return the same token amount as the usd amount
    await factory.setYflListingFeeInUsd(listingFeeTokenAmount)
    expect(await yfl.balanceOf(other.address)).to.eq(expandTo18Decimals(52000))
    await yfl.connect(other).approve(factory.address, listingFeeTokenAmount)
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, yfl.address)
    expect(await yfl.balanceOf(other.address)).to.eq(expandTo18Decimals(52000).sub(listingFeeTokenAmount))
  })

  it('createPair:listingFee:split', async () => {
    const listingFeeTokenAmount = expandTo18Decimals(1)
    await factory.setTreasury(other.address)
    await factory.setTreasuryListingFeeShare(123456) // 12.3456%
    // the test price oracle will return the same token amount as the usd amount
    await factory.setLinkListingFeeInUsd(listingFeeTokenAmount)
    expect(await link.balanceOf(other.address)).to.eq(expandTo18Decimals(1000000000))
    await link.connect(other).approve(factory.address, listingFeeTokenAmount)
    await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, link.address)
    const feeAmountToTreasury = listingFeeTokenAmount.mul(bigNumberify(123456)).div(1000000)
    const feeAmountToGovernance = listingFeeTokenAmount.sub(feeAmountToTreasury)
    // 'other' is treasury and lister
    expect(await link.balanceOf(other.address)).to.eq(
      expandTo18Decimals(1000000000).sub(listingFeeTokenAmount).add(feeAmountToTreasury)
    )
    expect(await link.balanceOf(wallet.address)).to.eq(feeAmountToGovernance)
  })

  it('createPair:transferFromFailed', async () => {
    await factory.setLinkListingFeeInUsd(1000)
    try {
      await factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, yfl.address)
    } catch (error) {
      expect(error).to.not.be.null
      expect(error.message).to.contain('TransferHelper: TRANSFER_FROM_FAILED')
    }
    expect(await factory.getPair(TEST_ADDRESSES[0], TEST_ADDRESSES[1])).to.eq(AddressZero)
    expect(await factory.getPair(TEST_ADDRESSES[1], TEST_ADDRESSES[0])).to.eq(AddressZero)
  })

  it('createPair:invalidPair', async () => {
    await expect(factory.connect(other).createPair(TEST_ADDRESSES[0], 0, TEST_ADDRESSES[1], 0, 0, AddressZero)).to.be
      .reverted
    await expect(factory.connect(other).createPair(TEST_ADDRESSES[0], 0, yfl.address, 0, 0, AddressZero)).to.be.reverted
  })

  it('createPair:invalidListingFeeToken', async () => {
    await expect(factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, AddressZero)).to.be
      .reverted
  })

  it('createPair:invalidListingLockupAmount:link', async () => {
    await factory.setTargetListingLockupAmountInUsd(1000)
    await factory.setMinListingLockupAmountInUsd(1000)
    await expect(factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, weth.address)).to.be
      .reverted
  })

  it('createPair:invalidListingLockupAmount:weth', async () => {
    await factory.setTargetListingLockupAmountInUsd(1000)
    await factory.setMinListingLockupAmountInUsd(1000)
    await expect(factory.connect(other).createPair(TEST_ADDRESSES[0], 0, weth.address, 0, 0, weth.address)).to.be
      .reverted
  })

  it('createPair:invalidListingLockupPeriod', async () => {
    await factory.setTargetListingLockupPeriod(1)
    await factory.setMinListingLockupPeriod(1)
    await expect(factory.connect(other).createPair(TEST_ADDRESSES[0], 0, link.address, 0, 0, weth.address)).to.be
      .reverted
  })

  it('createPair:lockup:zeroListingFee', async () => {
    const lockupPeriod = 604800 // 3 days
    const lockupAmount = bigNumberify(8000)
    await factory.setTargetListingLockupPeriod(lockupPeriod)
    await factory.setMinListingLockupPeriod(lockupPeriod)
    await factory.setTargetListingLockupAmountInUsd(lockupAmount)
    await factory.setMinListingLockupAmountInUsd(lockupAmount)
    await link.connect(other).approve(factory.address, 1000)
    await weth.connect(other).approve(factory.address, lockupAmount.add(MINIMUM_LIQUIDITY))
    await factory
      .connect(other)
      .createPair(link.address, 1000, weth.address, lockupAmount.add(MINIMUM_LIQUIDITY), lockupPeriod, weth.address)

    const bytecode = `0x${LinkswapPair.evm.bytecode.object}`
    const create2Address = getCreate2Address(factory.address, [link.address, weth.address], bytecode)
    expect(await factory.getPair(link.address, weth.address)).to.eq(create2Address)
    expect(await factory.getPair(weth.address, link.address)).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = new Contract(create2Address, JSON.stringify(LinkswapPair.abi), provider)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(link.address)
    expect(await pair.token1()).to.eq(weth.address)

    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    // sqrt((8000+1000)*1000) = 3000
    const expectedLiquidity = bigNumberify(3000)
    expect(await pair.addressToLockupExpiry(other.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(other.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await pair.balanceOf(other.address)).to.eq(0)
    expect(await pair.balanceOf(AddressZero)).to.eq(MINIMUM_LIQUIDITY)
    expect(await pair.balanceOf(pair.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  it('createPair:lockup:withDiscountedListingFee', async () => {
    await factory.setTargetListingLockupAmountInUsd(2000)
    await factory.setMinListingLockupAmountInUsd(1000)
    await factory.setTargetListingLockupPeriod(5)
    await factory.setMinListingLockupPeriod(1)
    await factory.setLockupAmountListingFeeDiscountShare(600000)
    const wethTokenAmount = bigNumberify(1001)
    const lockupTokenAmount = bigNumberify(1250)
    const lockupPeriod = 4
    const listingFeeTokenAmount = expandTo18Decimals(1)
    // 60% * (250/1000) + 40% * (3/4) = 45% discount
    const discountedListingFeeTokenAmount = expandTo18Decimals(1).mul(55).div(100)
    // the test price oracle will return the same token amount as the usd amount
    await factory.setLinkListingFeeInUsd(listingFeeTokenAmount)
    expect(await weth.balanceOf(other.address)).to.eq(expandTo18Decimals(4164360))
    expect(await link.balanceOf(other.address)).to.eq(expandTo18Decimals(1000000000))
    await weth.connect(other).approve(factory.address, wethTokenAmount)
    await link.connect(other).approve(factory.address, listingFeeTokenAmount.add(lockupTokenAmount))
    await factory
      .connect(other)
      .createPair(weth.address, wethTokenAmount, link.address, lockupTokenAmount, lockupPeriod, link.address)
    expect(await weth.balanceOf(other.address)).to.eq(expandTo18Decimals(4164360).sub(wethTokenAmount))
    expect(await link.balanceOf(other.address)).to.eq(
      expandTo18Decimals(1000000000).sub(discountedListingFeeTokenAmount).sub(lockupTokenAmount)
    )

    const bytecode = `0x${LinkswapPair.evm.bytecode.object}`
    const create2Address = getCreate2Address(factory.address, [link.address, weth.address], bytecode)
    expect(await factory.getPair(link.address, weth.address)).to.eq(create2Address)
    expect(await factory.getPair(weth.address, link.address)).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = new Contract(create2Address, JSON.stringify(LinkswapPair.abi), provider)
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(link.address)
    expect(await pair.token1()).to.eq(weth.address)

    const expiryTimestamp = bigNumberify((await provider.getBlock('latest')).timestamp).add(lockupPeriod)
    // sqrt(1250*1001) = 1118.59 (rounded down to 1118)
    const expectedLiquidity = bigNumberify(1118)
    expect(await pair.addressToLockupExpiry(other.address)).to.eq(expiryTimestamp)
    expect(await pair.addressToLockupAmount(other.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await pair.balanceOf(other.address)).to.eq(0)
    expect(await pair.balanceOf(AddressZero)).to.eq(MINIMUM_LIQUIDITY)
    expect(await pair.balanceOf(pair.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  it('setPriceOracle', async () => {
    await expect(factory.connect(other).setPriceOracle(other.address)).to.be.reverted
    await factory.setPriceOracle(other.address)
    expect(await factory.priceOracle()).to.eq(other.address)
    await factory.setPriceOracle(wallet.address)
    expect(await factory.priceOracle()).to.eq(wallet.address)
  })

  it('setTreasury', async () => {
    await expect(factory.connect(other).setTreasury(other.address)).to.be.reverted
    await factory.setTreasury(other.address)
    expect(await factory.treasury()).to.eq(other.address)
    await factory.setTreasury(wallet.address)
    expect(await factory.treasury()).to.eq(wallet.address)
  })

  it('setGovernance', async () => {
    await expect(factory.connect(other).setGovernance(other.address)).to.be.reverted
    await factory.setGovernance(other.address)
    expect(await factory.governance()).to.eq(other.address)
    await expect(factory.setGovernance(wallet.address)).to.be.reverted
  })

  it('setTreasuryProtocolFeeShare', async () => {
    expect(await factory.treasuryProtocolFeeShare()).to.be.eq(bigNumberify(1000000))
    await expect(factory.connect(other).setTreasuryProtocolFeeShare(bigNumberify(2000))).to.be.reverted
    // >100% share
    await expect(factory.setTreasuryProtocolFeeShare(bigNumberify(1000001))).to.be.reverted
    // Same share (100%)
    await factory.setTreasuryProtocolFeeShare(bigNumberify(1000000))
    expect(await factory.treasuryProtocolFeeShare()).to.be.eq(bigNumberify(1000000))
    // 12.345% share
    await factory.setTreasuryProtocolFeeShare(bigNumberify(12345))
    expect(await factory.treasuryProtocolFeeShare()).to.be.eq(bigNumberify(12345))
    // 0% share
    await factory.setTreasuryProtocolFeeShare(bigNumberify(0))
    expect(await factory.treasuryProtocolFeeShare()).to.be.eq(bigNumberify(0))
  })

  it('setProtocolFeeFractionInverse', async () => {
    expect(await factory.protocolFeeFractionInverse()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setProtocolFeeFractionInverse(bigNumberify(2000))).to.be.reverted
    // >50% fraction
    await expect(factory.setProtocolFeeFractionInverse(bigNumberify(1999))).to.be.reverted
    // Same fraction (0)
    await factory.setProtocolFeeFractionInverse(bigNumberify(0))
    expect(await factory.protocolFeeFractionInverse()).to.be.eq(bigNumberify(0))
    // 50% fraction
    await factory.setProtocolFeeFractionInverse(bigNumberify(2000))
    expect(await factory.protocolFeeFractionInverse()).to.be.eq(bigNumberify(2000))
    // 1/1000 fraction
    await factory.setProtocolFeeFractionInverse(bigNumberify(1000000))
    expect(await factory.protocolFeeFractionInverse()).to.be.eq(bigNumberify(1000000))
    // 9/22 fraction
    await factory.setProtocolFeeFractionInverse(bigNumberify(2444))
    expect(await factory.protocolFeeFractionInverse()).to.be.eq(bigNumberify(2444))
  })

  it('setLinkListingFeeInUsd', async () => {
    expect(await factory.linkListingFeeInUsd()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setLinkListingFeeInUsd(bigNumberify(0))).to.be.reverted
    // Same amount
    await factory.setLinkListingFeeInUsd(bigNumberify(0))
    expect(await factory.linkListingFeeInUsd()).to.be.eq(bigNumberify(0))
    // $1234.12345678
    await factory.setLinkListingFeeInUsd(bigNumberify('123412345678'))
    expect(await factory.linkListingFeeInUsd()).to.be.eq(bigNumberify('123412345678'))
  })

  it('setWethListingFeeInUsd', async () => {
    expect(await factory.wethListingFeeInUsd()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setWethListingFeeInUsd(bigNumberify(0))).to.be.reverted
    // Same amount
    await factory.setWethListingFeeInUsd(bigNumberify(0))
    expect(await factory.wethListingFeeInUsd()).to.be.eq(bigNumberify(0))
    // $1234.12345678
    await factory.setWethListingFeeInUsd(bigNumberify('123412345678'))
    expect(await factory.wethListingFeeInUsd()).to.be.eq(bigNumberify('123412345678'))
  })

  it('setYflListingFeeInUsd', async () => {
    expect(await factory.yflListingFeeInUsd()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setYflListingFeeInUsd(bigNumberify(0))).to.be.reverted
    // Same amount
    await factory.setYflListingFeeInUsd(bigNumberify(0))
    expect(await factory.yflListingFeeInUsd()).to.be.eq(bigNumberify(0))
    // $1234.12345678
    await factory.setYflListingFeeInUsd(bigNumberify('123412345678'))
    expect(await factory.yflListingFeeInUsd()).to.be.eq(bigNumberify('123412345678'))
  })

  it('setTreasuryListingFeeShare', async () => {
    expect(await factory.treasuryListingFeeShare()).to.be.eq(bigNumberify(100000))
    await expect(factory.connect(other).setTreasuryListingFeeShare(bigNumberify(0))).to.be.reverted
    // >100% share
    await expect(factory.setTreasuryListingFeeShare(bigNumberify(1010000))).to.be.reverted
    // Same amount
    await factory.setTreasuryListingFeeShare(bigNumberify(100000))
    expect(await factory.treasuryListingFeeShare()).to.be.eq(bigNumberify(100000))
    // Zero share
    await factory.setTreasuryListingFeeShare(bigNumberify(0))
    expect(await factory.treasuryListingFeeShare()).to.be.eq(bigNumberify(0))
    // 12.3456% share
    await factory.setTreasuryListingFeeShare(bigNumberify(123456))
    expect(await factory.treasuryListingFeeShare()).to.be.eq(bigNumberify(123456))
    // 100% share
    await factory.setTreasuryListingFeeShare(bigNumberify(1000000))
    expect(await factory.treasuryListingFeeShare()).to.be.eq(bigNumberify(1000000))
  })

  it('setMinListingLockupAmountInUsd', async () => {
    expect(await factory.minListingLockupAmountInUsd()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setMinListingLockupAmountInUsd(bigNumberify(0))).to.be.reverted
    await expect(factory.setMinListingLockupAmountInUsd(bigNumberify(1))).to.be.reverted
    await expect(factory.setMinListingLockupAmountInUsd(bigNumberify(1000))).to.be.reverted

    // Min amount
    await factory.setTargetListingLockupAmountInUsd(bigNumberify(1000))
    await factory.setMinListingLockupAmountInUsd(bigNumberify(1000))
    expect(await factory.minListingLockupAmountInUsd()).to.be.eq(bigNumberify(1000))
    // Same amount
    await factory.setMinListingLockupAmountInUsd(bigNumberify(1000))
    expect(await factory.minListingLockupAmountInUsd()).to.be.eq(bigNumberify(1000))
    // Zero amount
    await factory.setMinListingLockupAmountInUsd(bigNumberify(0))
    expect(await factory.minListingLockupAmountInUsd()).to.be.eq(bigNumberify(0))
    // $1234.12345678
    await factory.setTargetListingLockupAmountInUsd(bigNumberify('123412345678'))
    await factory.setMinListingLockupAmountInUsd(bigNumberify('123412345678'))
    expect(await factory.minListingLockupAmountInUsd()).to.be.eq(bigNumberify('123412345678'))
  })

  it('setTargetListingLockupAmountInUsd', async () => {
    expect(await factory.targetListingLockupAmountInUsd()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setTargetListingLockupAmountInUsd(bigNumberify(0))).to.be.reverted
    // Same amount
    await factory.setTargetListingLockupAmountInUsd(bigNumberify(0))
    expect(await factory.targetListingLockupAmountInUsd()).to.be.eq(bigNumberify(0))
    // $1234.12345678
    await factory.setTargetListingLockupAmountInUsd(bigNumberify('123412345678'))
    expect(await factory.targetListingLockupAmountInUsd()).to.be.eq(bigNumberify('123412345678'))
  })

  it('setTargetListingLockupAmountInUsd:lessThanMin', async () => {
    await factory.setTargetListingLockupAmountInUsd(bigNumberify(1000))
    await factory.setMinListingLockupAmountInUsd(bigNumberify(1000))
    await expect(factory.setTargetListingLockupAmountInUsd(bigNumberify(0))).to.be.reverted
  })

  it('setMinListingLockupPeriod', async () => {
    expect(await factory.minListingLockupPeriod()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setMinListingLockupPeriod(bigNumberify(0))).to.be.reverted
    // Zero period
    await factory.setMinListingLockupPeriod(bigNumberify(0))
    expect(await factory.minListingLockupPeriod()).to.be.eq(bigNumberify(0))

    await expect(factory.setMinListingLockupPeriod(bigNumberify('123412345678'))).to.be.reverted

    // 123412345678 seconds
    await factory.setTargetListingLockupPeriod(bigNumberify('123412345679'))
    await factory.setMinListingLockupPeriod(bigNumberify('123412345678'))
    expect(await factory.minListingLockupPeriod()).to.be.eq(bigNumberify('123412345678'))
  })

  it('setTargetListingLockupPeriod', async () => {
    expect(await factory.targetListingLockupPeriod()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setTargetListingLockupPeriod(bigNumberify(0))).to.be.reverted
    // Same period
    await factory.setTargetListingLockupPeriod(bigNumberify(0))
    expect(await factory.targetListingLockupPeriod()).to.be.eq(bigNumberify(0))
    // 123412345678 seconds
    await factory.setTargetListingLockupPeriod(bigNumberify('123412345678'))
    expect(await factory.targetListingLockupPeriod()).to.be.eq(bigNumberify('123412345678'))
  })

  it('setTargetListingLockupPeriod:lessThanMin', async () => {
    await factory.setTargetListingLockupPeriod(bigNumberify(1))
    await factory.setMinListingLockupPeriod(bigNumberify(1))
    await expect(factory.setTargetListingLockupPeriod(bigNumberify(0))).to.be.reverted
  })

  it('setLockupAmountListingFeeDiscountShare', async () => {
    expect(await factory.lockupAmountListingFeeDiscountShare()).to.be.eq(bigNumberify(100000))
    await expect(factory.connect(other).setLockupAmountListingFeeDiscountShare(bigNumberify(0))).to.be.reverted
    // >100% share
    await expect(factory.setLockupAmountListingFeeDiscountShare(bigNumberify(1010000))).to.be.reverted
    // Same amount
    await factory.setLockupAmountListingFeeDiscountShare(bigNumberify(100000))
    expect(await factory.lockupAmountListingFeeDiscountShare()).to.be.eq(bigNumberify(100000))
    // Zero share
    await factory.setLockupAmountListingFeeDiscountShare(bigNumberify(0))
    expect(await factory.lockupAmountListingFeeDiscountShare()).to.be.eq(bigNumberify(0))
    // 12.3456% share
    await factory.setLockupAmountListingFeeDiscountShare(bigNumberify(123456))
    expect(await factory.lockupAmountListingFeeDiscountShare()).to.be.eq(bigNumberify(123456))
    // 100% share
    await factory.setLockupAmountListingFeeDiscountShare(bigNumberify(1000000))
    expect(await factory.lockupAmountListingFeeDiscountShare()).to.be.eq(bigNumberify(1000000))
  })

  it('setDefaultLinkTradingFeePercent', async () => {
    expect(await factory.defaultLinkTradingFeePercent()).to.be.eq(bigNumberify(2500))
    await expect(factory.connect(other).setDefaultLinkTradingFeePercent(bigNumberify(0))).to.be.reverted
    // >1% fee
    await expect(factory.setDefaultLinkTradingFeePercent(bigNumberify(10001))).to.be.reverted
    // Same fee
    await factory.setDefaultLinkTradingFeePercent(bigNumberify(2500))
    expect(await factory.defaultLinkTradingFeePercent()).to.be.eq(bigNumberify(2500))
    // 0% fee
    await factory.setDefaultLinkTradingFeePercent(bigNumberify(0))
    expect(await factory.defaultLinkTradingFeePercent()).to.be.eq(bigNumberify(0))
    // 1% fee
    await factory.setDefaultLinkTradingFeePercent(bigNumberify(10000))
    expect(await factory.defaultLinkTradingFeePercent()).to.be.eq(bigNumberify(10000))
  })

  it('setDefaultNonLinkTradingFeePercent', async () => {
    expect(await factory.defaultNonLinkTradingFeePercent()).to.be.eq(bigNumberify(3000))
    await expect(factory.connect(other).setDefaultNonLinkTradingFeePercent(bigNumberify(0))).to.be.reverted
    // >1% fee
    await expect(factory.setDefaultNonLinkTradingFeePercent(bigNumberify(10001))).to.be.reverted
    // Same fee
    await factory.setDefaultNonLinkTradingFeePercent(bigNumberify(2500))
    expect(await factory.defaultNonLinkTradingFeePercent()).to.be.eq(bigNumberify(2500))
    // 0% fee
    await factory.setDefaultNonLinkTradingFeePercent(bigNumberify(0))
    expect(await factory.defaultNonLinkTradingFeePercent()).to.be.eq(bigNumberify(0))
    // 1% fee
    await factory.setDefaultNonLinkTradingFeePercent(bigNumberify(10000))
    expect(await factory.defaultNonLinkTradingFeePercent()).to.be.eq(bigNumberify(10000))
  })

  it('setMaxSlippagePercent', async () => {
    expect(await factory.maxSlippagePercent()).to.be.eq(bigNumberify(0))
    await expect(factory.connect(other).setMaxSlippagePercent(bigNumberify(0))).to.be.reverted
    // 0%
    await factory.setMaxSlippagePercent(bigNumberify(0))
    expect(await factory.maxSlippagePercent()).to.be.eq(bigNumberify(0))
    // 100%
    await factory.setMaxSlippagePercent(bigNumberify(100))
    expect(await factory.maxSlippagePercent()).to.be.eq(bigNumberify(100))
    // >100%
    await expect(factory.setMaxSlippagePercent(bigNumberify(101))).to.be.reverted
    // 21% fee
    await factory.setMaxSlippagePercent(bigNumberify(21))
    expect(await factory.maxSlippagePercent()).to.be.eq(bigNumberify(21))
    // Same % (21%)
    await factory.setMaxSlippagePercent(bigNumberify(21))
    expect(await factory.maxSlippagePercent()).to.be.eq(bigNumberify(21))
  })

  it('setMaxSlippageBlocks', async () => {
    expect(await factory.maxSlippageBlocks()).to.be.eq(bigNumberify(1))
    await expect(factory.connect(other).setMaxSlippageBlocks(bigNumberify(1))).to.be.reverted
    // 0 blocks
    await expect(factory.setMaxSlippageBlocks(bigNumberify(0))).to.be.reverted
    // 1 block
    await factory.setMaxSlippageBlocks(bigNumberify(1))
    expect(await factory.maxSlippageBlocks()).to.be.eq(bigNumberify(1))
    // 40320 blocks
    await factory.setMaxSlippageBlocks(bigNumberify(40320))
    expect(await factory.maxSlippageBlocks()).to.be.eq(bigNumberify(40320))
    // >40320 blocks
    await expect(factory.setMaxSlippageBlocks(bigNumberify(40321))).to.be.reverted
  })
})
