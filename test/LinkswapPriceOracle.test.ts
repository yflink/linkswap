import chai, {expect} from 'chai'
import {createFixtureLoader, deployContract, MockProvider, solidity} from 'ethereum-waffle'
import {Contract} from 'ethers'
import {MaxUint256} from 'ethers/constants'
import {bigNumberify} from 'ethers/utils'
import ERC20Test from '../build/ERC20Test.json'
import LinkswapPriceOracle from '../build/LinkswapPriceOracle.json'
import {oracleFixture} from './shared/fixtures'
import {expandTo18Decimals, expandToDecimals, mineBlock} from './shared/utilities'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

describe('LinkswapPriceOracle', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  const token0Amount = expandTo18Decimals(5)
  const token1Amount = expandTo18Decimals(10)

  async function addLiquidity() {
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.sync()
  }

  let link: Contract
  let weth: Contract
  let yfl: Contract
  let factory: Contract
  let pair: Contract
  let token0: Contract
  let token1: Contract
  let linkUsdOracle: Contract
  let wethUsdOracle: Contract
  let linkswapPriceOracle: Contract
  beforeEach('deploy fixture', async () => {
    const fixture = await loadFixture(oracleFixture)
    link = fixture.link
    weth = fixture.weth
    yfl = fixture.yfl
    factory = fixture.uniswapV2Factory
    linkUsdOracle = fixture.linkUsdOracle
    wethUsdOracle = fixture.wethUsdOracle

    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    await addLiquidity()
    linkswapPriceOracle = await deployContract(
      wallet,
      LinkswapPriceOracle,
      [factory.address, link.address, weth.address, yfl.address, linkUsdOracle.address, wethUsdOracle.address],
      overrides
    )
  })

  describe('#calculateTokenAmountFromUsdAmount', () => {
    describe('yfl token', () => {
      it('success', async () => {
        expect(await linkswapPriceOracle.price0Average()).to.eq(0)
        expect(await linkswapPriceOracle.price1Average()).to.eq(0)
        expect(await linkswapPriceOracle.consult(token0.address, token0Amount)).to.eq(0)
        expect(await linkswapPriceOracle.consult(token1.address, token1Amount)).to.eq(0)
        const previousBlockTimestamp = (await pair.getReserves())[2]
        await linkswapPriceOracle.update(overrides)
        const blockTimestamp = previousBlockTimestamp + 4 * 3600
        await mineBlock(provider, blockTimestamp)
        await linkswapPriceOracle.update(overrides)
        // $1000 / $1000 * 10^18 * 5/10 = 5 * 10^17
        expect(
          await linkswapPriceOracle.calculateTokenAmountFromUsdAmount(yfl.address, expandToDecimals(1000, 8))
        ).to.eq(bigNumberify('500000000000000000'))
      })

      it('yfl token: no oracle update', async () => {
        try {
          await linkswapPriceOracle.calculateTokenAmountFromUsdAmount(yfl.address, expandToDecimals(1000, 8))
        } catch (error) {
          expect(error).to.not.be.null
          expect(error.message).to.contain('invalid opcode')
        }
      })

      it('yfl token: only one oracle update', async () => {
        await linkswapPriceOracle.update(overrides)
        try {
          await linkswapPriceOracle.calculateTokenAmountFromUsdAmount(yfl.address, expandToDecimals(1000, 8))
        } catch (error) {
          expect(error).to.not.be.null
          expect(error.message).to.contain('LinkswapPriceOracle: MISSING_HISTORICAL_OBSERVATION')
        }
      })
    })

    it('link token', async () => {
      // $3000 / $50 * 10^18 = 6 * 10^19
      expect(
        await linkswapPriceOracle.calculateTokenAmountFromUsdAmount(link.address, expandToDecimals(3000, 8))
      ).to.eq(bigNumberify('60000000000000000000'))
    })

    it('weth token', async () => {
      // $3500 / $1000 * 10^18 = 35 * 10^17
      expect(
        await linkswapPriceOracle.calculateTokenAmountFromUsdAmount(weth.address, expandToDecimals(3500, 8))
      ).to.eq(bigNumberify('3500000000000000000'))
    })

    it('max uint', async () => {
      // max uint value (2^255-1)
      try {
        await linkswapPriceOracle.calculateTokenAmountFromUsdAmount(weth.address, MaxUint256)
      } catch (error) {
        expect(error).to.not.be.null
        expect(error.message).to.contain('revert ds-math-mul-overflow')
      }
    })

    it('unexpected token', async () => {
      const unexpectedToken = await deployContract(
        wallet,
        ERC20Test,
        ['Test Token', 'TT', expandTo18Decimals(1000)],
        overrides
      )
      await expect(
        linkswapPriceOracle.calculateTokenAmountFromUsdAmount(unexpectedToken.address, 100)
      ).to.be.revertedWith('LinkswapPriceOracle: UNEXPECTED_TOKEN')
    })
  })

  describe('#calculateUsdAmountFromTokenAmount', () => {
    it('link token', async () => {
      // 12.3456789 LINK * $50/LINK = $617.283945
      expect(
        await linkswapPriceOracle.calculateUsdAmountFromTokenAmount(link.address, expandToDecimals(123456789, 11))
      ).to.eq(bigNumberify('61728394500'))
    })

    it('weth token', async () => {
      // 12.3456789 ETH * $1000/ETH = $12,345.6789
      expect(
        await linkswapPriceOracle.calculateUsdAmountFromTokenAmount(weth.address, expandToDecimals(123456789, 11))
      ).to.eq(bigNumberify('1234567890000'))
    })

    it('max uint', async () => {
      // max uint value (2^255-1)
      try {
        await linkswapPriceOracle.calculateUsdAmountFromTokenAmount(weth.address, MaxUint256)
      } catch (error) {
        expect(error).to.not.be.null
        expect(error.message).to.contain('revert ds-math-mul-overflow')
      }
    })

    it('unexpected yfl token', async () => {
      await expect(linkswapPriceOracle.calculateUsdAmountFromTokenAmount(yfl.address, 100)).to.be.revertedWith(
        'LinkswapPriceOracle: UNEXPECTED_TOKEN'
      )
    })

    it('unexpected token', async () => {
      const unexpectedToken = await deployContract(
        wallet,
        ERC20Test,
        ['Test Token', 'TT', expandTo18Decimals(1000)],
        overrides
      )
      await expect(
        linkswapPriceOracle.calculateUsdAmountFromTokenAmount(unexpectedToken.address, 100)
      ).to.be.revertedWith('LinkswapPriceOracle: UNEXPECTED_TOKEN')
    })
  })
})
