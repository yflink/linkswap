import chai, {expect} from 'chai'
import {deployContract, MockProvider, solidity} from 'ethereum-waffle'
import {Contract} from 'ethers'
import PairNamerTest from '../../build/PairNamerTest.json'
import PairNamerTestFakeToken from '../../build/PairNamerTestFakeToken.json'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

describe('PairNamer', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet] = provider.getWallets()

  let pairNamer: Contract
  before('deploy PairNamerTest', async () => {
    pairNamer = await deployContract(wallet, PairNamerTest, [], overrides)
  })

  describe('#pairName', () => {
    async function pairName(token0Name: string, token1Name: string, prefix: string, suffix: string): Promise<string> {
      const token0 = await deployContract(wallet, PairNamerTestFakeToken, [token0Name, ''], overrides)
      const token1 = await deployContract(wallet, PairNamerTestFakeToken, [token1Name, ''], overrides)
      return pairNamer.pairName(token0.address, token1.address, prefix, suffix)
    }

    it('concatenation', async () => {
      expect(await pairName('DAI Stable Coin', 'MKR Token', 'LinkSwap Liquidity Provider Share for ', '.')).to.eq(
        'LinkSwap Liquidity Provider Share for DAI Stable Coin:MKR Token.'
      )
    })
  })

  describe('#pairSymbol', () => {
    async function pairSymbol(token0Symbol: string, token1Symbol: string, suffix: string): Promise<string> {
      const token0 = await deployContract(wallet, PairNamerTestFakeToken, ['', token0Symbol], overrides)
      const token1 = await deployContract(wallet, PairNamerTestFakeToken, ['', token1Symbol], overrides)
      return pairNamer.pairSymbol(token0.address, token1.address, suffix)
    }

    it('concatenation', async () => {
      expect(await pairSymbol('DAI', 'MKR', '-v2')).to.eq('🔁DAI:MKR-v2')
    })
  })
})
