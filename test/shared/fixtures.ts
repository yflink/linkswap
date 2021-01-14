import {deployContract} from 'ethereum-waffle'
import {Contract, Wallet} from 'ethers'
import {AddressZero} from 'ethers/constants'
import {Web3Provider} from 'ethers/providers'
import ChainlinkOracleTest from '../../build/ChainlinkOracleTest.json'
import ERC20Test from '../../build/ERC20Test.json'
import ILinkswapPair from '../../build/ILinkswapPair.json'
import IUniswapV2Pair from '../../build/IUniswapV2Pair.json'
import LinkswapERC20Test from '../../build/LinkswapERC20Test.json'
import LinkswapFactory from '../../build/LinkswapFactory.json'
import LinkswapPair from '../../build/LinkswapPair.json'
import LinkswapPriceOracleTest from '../../build/LinkswapPriceOracleTest.json'
import LinkswapRouter from '../../build/LinkswapRouter.json'
import RouterEventEmitterTest from '../../build/RouterEventEmitterTest.json'
import WETHTest from '../../build/WETHTest.json'
import UniswapV2Factory from '../../uniswap-build/UniswapV2Factory.json'
import {expandTo18Decimals, expandToDecimals} from './utilities'

interface FactoryFixture {
  factory: Contract
  link: Contract
  weth: Contract
  yfl: Contract
}

const overrides = {
  gasLimit: 9999999,
}

export async function factoryFixture(_: Web3Provider, [wallet, other]: Wallet[]): Promise<FactoryFixture> {
  // https://etherscan.io/address/0x514910771af9ca656af840dff83e8264ecf986ca
  const link = await deployContract(
    other,
    ERC20Test,
    ['ChainLink Token', 'LINK', expandTo18Decimals(1000000000)],
    overrides
  )
  // https://etherscan.io/address/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  const weth = await deployContract(other, WETHTest, ['Wrapped Ether', 'WETH', expandTo18Decimals(4164360)], overrides)
  // https://etherscan.io/address/0x28cb7e841ee97947a86B06fA4090C8451f64c0be
  const yfl = await deployContract(other, ERC20Test, ['YFLink', 'YFL', expandTo18Decimals(52000)], overrides)
  const linkswapOracle = await deployContract(other, LinkswapPriceOracleTest, [], overrides)
  const factory = await deployContract(
    wallet,
    LinkswapFactory,
    [
      wallet.address,
      wallet.address,
      linkswapOracle.address,
      0,
      0,
      0,
      100000,
      0,
      0,
      0,
      0,
      100000,
      link.address,
      weth.address,
      yfl.address,
    ],
    overrides
  )
  return {factory, link, weth, yfl}
}

interface PairFixture extends FactoryFixture {
  token0: Contract
  token1: Contract
  pair: Contract
}

export async function pairFixture(provider: Web3Provider, [wallet, other]: Wallet[]): Promise<PairFixture> {
  const {factory, link, weth, yfl} = await factoryFixture(provider, [wallet, other])

  const tokenA = await deployContract(wallet, ERC20Test, ['tokenA', 'AAA', expandTo18Decimals(10000)], overrides)
  const tokenB = await deployContract(wallet, ERC20Test, ['tokenB', 'BBB', expandTo18Decimals(10000)], overrides)

  await factory.approvePairViaGovernance(tokenA.address, tokenB.address, overrides)
  await factory.connect(other).createPair(tokenA.address, 0, tokenB.address, 0, 0, AddressZero, overrides)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(LinkswapPair.abi), provider).connect(wallet)

  const token0Address = (await pair.token0()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    factory,
    link,
    weth,
    yfl,
    token0,
    token1,
    pair,
  }
}

interface RouterFixture {
  weth: Contract
  wethPartner: Contract
  link: Contract
  factory: Contract
  router: Contract
  routerEventEmitter: Contract
  token0: Contract
  token1: Contract
  pair: Contract
  wethPair: Contract
}

export async function routerFixture(provider: Web3Provider, [wallet, other]: Wallet[]): Promise<RouterFixture> {
  // deploy tokens
  const tokenA = await deployContract(wallet, LinkswapERC20Test, [expandTo18Decimals(10000)])
  const tokenB = await deployContract(wallet, LinkswapERC20Test, [expandTo18Decimals(10000)])
  const wethPartner = await deployContract(wallet, LinkswapERC20Test, [expandTo18Decimals(10000)])

  const {factory, weth, link} = await factoryFixture(provider, [wallet, other])
  const router = await deployContract(wallet, LinkswapRouter, [factory.address, weth.address], overrides)
  // event emitter for testing
  const routerEventEmitter = await deployContract(wallet, RouterEventEmitterTest, [])

  await factory.approvePairViaGovernance(tokenA.address, tokenB.address, overrides)
  await factory.connect(other).createPair(tokenA.address, 0, tokenB.address, 0, 0, AddressZero, overrides)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(ILinkswapPair.abi), provider).connect(wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await factory.approvePairViaGovernance(weth.address, wethPartner.address, overrides)
  await factory.connect(other).createPair(weth.address, 0, wethPartner.address, 0, 0, AddressZero, overrides)
  const wethPairAddress = await factory.getPair(weth.address, wethPartner.address)
  const wethPair = new Contract(wethPairAddress, JSON.stringify(ILinkswapPair.abi), provider).connect(wallet)

  return {
    token0,
    token1,
    weth,
    wethPartner,
    link,
    factory,
    router,
    routerEventEmitter,
    pair,
    wethPair,
  }
}

interface OracleFixture {
  link: Contract
  weth: Contract
  yfl: Contract
  uniswapV2Factory: Contract
  pair: Contract
  token0: Contract
  token1: Contract
  linkUsdOracle: Contract
  wethUsdOracle: Contract
}

export async function oracleFixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<OracleFixture> {
  const link = await deployContract(wallet, LinkswapERC20Test, [expandTo18Decimals(10000)], overrides)
  const weth = await deployContract(wallet, WETHTest, ['Wrapped Ether', 'WETH', expandTo18Decimals(4164360)], overrides)
  const yfl = await deployContract(wallet, LinkswapERC20Test, [expandTo18Decimals(10000)], overrides)

  const uniswapV2Factory = await deployContract(wallet, UniswapV2Factory, [wallet.address], overrides)
  await uniswapV2Factory.createPair(weth.address, yfl.address)
  const pairAddress = await uniswapV2Factory.getPair(weth.address, yfl.address)
  const pair = new Contract(pairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)
  const token0Address = await pair.token0()
  const token0 = weth.address === token0Address ? weth : yfl
  const token1 = weth.address === token0Address ? yfl : weth

  const linkUsdOracle = await deployContract(wallet, ChainlinkOracleTest, [expandToDecimals(50, 8)], overrides)
  const wethUsdOracle = await deployContract(wallet, ChainlinkOracleTest, [expandToDecimals(1000, 8)], overrides)

  return {
    link,
    weth,
    yfl,
    uniswapV2Factory,
    pair,
    token0,
    token1,
    linkUsdOracle,
    wethUsdOracle,
  }
}
