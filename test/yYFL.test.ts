import {toUtf8String} from '@ethersproject/strings'
import chai, {expect} from 'chai'
import {createFixtureLoader, deployContract, MockProvider, solidity} from 'ethereum-waffle'
import {Contract} from 'ethers'
import {AddressZero} from 'ethers/constants'
import {bigNumberify, toUtf8Bytes} from 'ethers/utils'
import YFLPurchaserTest from '../build/YFLPurchaserTest.json'
import yYFL from '../build/yYFL.json'
import {factoryFixture} from './shared/fixtures'
import {encodeParameters, expandTo18Decimals, expandToDecimals, mineBlock} from './shared/utilities'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

describe('yYFL', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999,
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [other, wallet])

  let factory: Contract
  let link: Contract
  let weth: Contract
  let yfl: Contract
  let yyfl: Contract
  let yflPurchaser: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(factoryFixture)
    factory = fixture.factory
    link = fixture.link
    weth = fixture.weth
    yfl = fixture.yfl
    yyfl = await deployContract(wallet, yYFL, [yfl.address, other.address, 10, 10, 10], overrides)
    yflPurchaser = await deployContract(wallet, YFLPurchaserTest, [yyfl.address, yfl.address], overrides)
  })

  it('initial values', async () => {
    expect(await yyfl.MAX_OPERATIONS()).to.eq(10)
    expect(await yyfl.YFL()).to.eq(yfl.address)
    expect(await yyfl.blocksForNoWithdrawalFee()).to.eq(10)
    expect(await yyfl.earlyWithdrawalFeePercent()).to.eq(10000)
    expect(await yyfl.treasury()).to.eq(other.address)
    expect(await yyfl.treasuryEarlyWithdrawalFeeShare()).to.eq(800000)
    expect(await yyfl.yflPurchaser()).to.eq(AddressZero)
    expect(await yyfl.proposalCount()).to.eq(0)
    expect(await yyfl.votingPeriodBlocks()).to.eq(10)
    expect(await yyfl.minYflForProposal()).to.eq(expandToDecimals(1, 17))
    expect(await yyfl.quorumPercent()).to.eq(200000)
    expect(await yyfl.voteThresholdPercent()).to.eq(500000)
    expect(await yyfl.executionPeriodBlocks()).to.eq(10)
  })

  it('stake:zero', async () => {
    await expect(yyfl.stake(0)).to.be.revertedWith('yYFL: ZERO')
  })

  it('stake:insufficientYfl', async () => {
    expect(await yfl.balanceOf(other.address)).to.eq(0)
    try {
      await yyfl.stake(1)
    } catch (error) {
      expect(error).to.not.be.null
      expect(error.message).to.contain('ERC20: transfer amount exceeds allowance')
    }
  })

  it('stake:success', async () => {
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000'))
    expect(await yyfl.balanceOf(wallet.address)).to.eq(0)
    expect(await yyfl.totalSupply()).to.be.eq(0)
    expect(await yyfl.earlyWithdrawalFeeExpiry(wallet.address)).to.eq(0)
    const currentBlock = (await provider.getBlock('latest')).number
    const stakeAmount = expandToDecimals(1, 12) // 0.000001 YFL

    await yfl.approve(yyfl.address, stakeAmount)
    await expect(yyfl.stake(stakeAmount))
      .to.emit(yfl, 'Transfer')
      .withArgs(wallet.address, yyfl.address, stakeAmount)
      .to.emit(yfl, 'Approval')
      .withArgs(wallet.address, yyfl.address, 0)
      .to.emit(yyfl, 'Transfer')
      .withArgs(AddressZero, wallet.address, stakeAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000').sub(stakeAmount))
    expect(await yfl.balanceOf(yyfl.address)).to.eq(stakeAmount)
    expect(await yyfl.balanceOf(wallet.address)).to.eq(stakeAmount)
    expect(await yyfl.totalSupply()).to.eq(stakeAmount)
    // add 2 due to blocks incremented by approve and stake
    expect(await yyfl.earlyWithdrawalFeeExpiry(wallet.address)).to.eq(
      bigNumberify(10).add(bigNumberify(currentBlock)).add(2)
    )
    expect(await yyfl.getPricePerFullShare()).to.eq(expandTo18Decimals(1))
    expect(await yyfl.getStakeYflValue(wallet.address)).to.be.eq(stakeAmount)

    // stake again after shares become more valuable
    await yfl.transfer(yyfl.address, stakeAmount)
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000').sub(stakeAmount.mul(3)))
    expect(await yfl.balanceOf(yyfl.address)).to.eq(stakeAmount.mul(3))
    const newMintedAmount = stakeAmount.mul(stakeAmount).div(stakeAmount.mul(2))
    expect(await yyfl.balanceOf(wallet.address)).to.eq(stakeAmount.add(newMintedAmount))
    expect(await yyfl.totalSupply()).to.eq(stakeAmount.add(newMintedAmount))
    // add another 3 due to blocks incremented by transfer/approve/stake
    expect(await yyfl.earlyWithdrawalFeeExpiry(wallet.address)).to.eq(
      bigNumberify(10).add(bigNumberify(currentBlock)).add(2).add(3)
    )
    expect(await yyfl.getPricePerFullShare()).to.eq(
      stakeAmount.mul(3).mul(expandTo18Decimals(1)).div(stakeAmount.add(newMintedAmount))
    )
    expect(await yyfl.getStakeYflValue(wallet.address)).to.be.eq(stakeAmount.mul(3))
  })

  it('stake:maintainYflValue', async () => {
    // first staker maintains yfl value
    const stakeAmountA = expandToDecimals(1, 12) // 0.000001 YFL
    await yfl.approve(yyfl.address, stakeAmountA)
    await yyfl.stake(stakeAmountA)
    expect(await yyfl.getStakeYflValue(wallet.address)).to.be.eq(stakeAmountA)

    // someone else stakes and both stakers maintains yfl value
    const stakeAmountB = expandToDecimals(3, 12) // 0.000003 YFL
    await yfl.transfer(other.address, stakeAmountB)
    await yfl.connect(other).approve(yyfl.address, stakeAmountB)
    await yyfl.connect(other).stake(stakeAmountB)
    expect(await yyfl.getStakeYflValue(wallet.address)).to.be.eq(stakeAmountA)
    expect(await yyfl.getStakeYflValue(other.address)).to.be.eq(stakeAmountB)

    // yyfl earns interest and value is split
    const interestAmount = expandToDecimals(2, 12)
    await yfl.transfer(yyfl.address, interestAmount)
    const interestAmountA = interestAmount
      .mul(bigNumberify(await yyfl.balanceOf(wallet.address)))
      .div(await yyfl.totalSupply())
    const interestAmountB = interestAmount
      .mul(bigNumberify(await yyfl.balanceOf(other.address)))
      .div(await yyfl.totalSupply())
    expect(interestAmountA.add(interestAmountB)).to.eq(interestAmount)
    const newYflValueA = stakeAmountA.add(interestAmountA)
    const newYflValueB = stakeAmountB.add(interestAmountB)
    expect(await yyfl.getStakeYflValue(wallet.address)).to.be.eq(newYflValueA)
    expect(await yyfl.getStakeYflValue(other.address)).to.be.eq(newYflValueB)

    // A stakes again but B's value is unaffected
    await yfl.approve(yyfl.address, stakeAmountA)
    await yyfl.stake(stakeAmountA)
    // 1 lost in rounding
    const finalYflValueA = newYflValueA.add(stakeAmountA).sub(1)
    expect(await yyfl.getStakeYflValue(wallet.address)).to.be.eq(finalYflValueA)
    expect(await yyfl.getStakeYflValue(other.address)).to.be.eq(newYflValueB)

    // these final values can be withdrawn successfully
    const balanceA = await yfl.balanceOf(wallet.address)
    const balanceB = await yfl.balanceOf(other.address)
    // 10 blocks to avoid early withdrawal fee
    for (let i = 0; i < 10; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await yyfl.withdraw(await yyfl.balanceOf(wallet.address))
    await yyfl.connect(other).withdraw(await yyfl.balanceOf(other.address))
    expect(await yfl.balanceOf(wallet.address)).to.eq(balanceA.add(finalYflValueA))
    // 1 gained in rounding
    expect(await yfl.balanceOf(other.address)).to.eq(balanceB.add(newYflValueB).add(1))
  })

  it('getPricePerFullShare:zero', async () => {
    try {
      await yyfl.getPricePerFullShare()
    } catch (error) {
      expect(error).to.not.be.null
      expect(error.message).to.contain('SafeMath: division by zero')
    }
  })

  it('getStakeYflValue:zero', async () => {
    try {
      await yyfl.getStakeYflValue(wallet.address)
    } catch (error) {
      expect(error).to.not.be.null
      expect(error.message).to.contain('SafeMath: division by zero')
    }
  })

  it('withdraw:zero', async () => {
    await expect(yyfl.withdraw(0)).to.be.revertedWith('yYFL: ZERO')

    const stakeAmount = expandToDecimals(1, 12) // 0.000001 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)

    await expect(yyfl.withdraw(0)).to.be.revertedWith('yYFL: ZERO')
  })

  it('withdraw:insufficientBalance', async () => {
    const stakeAmount = expandToDecimals(1, 12) // 0.000001 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)

    await expect(yyfl.withdraw(stakeAmount.add(1))).to.be.revertedWith('yYFL: INSUFFICIENT_BALANCE')
  })

  it('withdraw:checkVoteExpiry', async () => {
    // stake first
    const stakeAmount = expandTo18Decimals(1) // 1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    const initialBlock = (await provider.getBlock('latest')).number
    const voteAmount = stakeAmount.div(2)
    await yyfl.vote(0, true, voteAmount)
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(voteAmount)
    expect(await yyfl.voteLockExpiry(wallet.address)).to.eq(initialBlock + 10)
    // 1 block already mined from stake + 9 = 10
    // this period is long enough to unlock stake locked for voting and to get rid of early withdrawal fee
    for (let i = 0; i < 9; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)

    await expect(yyfl.withdraw(stakeAmount))
      .to.emit(yyfl, 'Transfer')
      .withArgs(wallet.address, AddressZero, stakeAmount)
      .to.emit(yfl, 'Transfer')
      .withArgs(yyfl.address, wallet.address, stakeAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000'))
    expect(await yfl.balanceOf(yyfl.address)).to.eq(0)
    expect(await yfl.balanceOf(other.address)).to.eq(0)
    expect(await yyfl.balanceOf(wallet.address)).to.eq(0)
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(0)
    expect(await yyfl.voteLockExpiry(wallet.address)).to.eq(0)
  })

  it('withdraw:early', async () => {
    // stake first
    const stakeAmount = expandToDecimals(1, 12) // 0.000001 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000').sub(stakeAmount))

    const feeAmount = stakeAmount.mul(10000).div(1000000)
    const stakeAmountAfterEarlyWithdrawalFee = stakeAmount.sub(feeAmount)
    await expect(yyfl.withdraw(stakeAmount))
      .to.emit(yyfl, 'Transfer')
      .withArgs(wallet.address, AddressZero, stakeAmount)
      .to.emit(yfl, 'Transfer')
      .withArgs(yyfl.address, other.address, feeAmount.mul(800000).div(1000000))
      .to.emit(yfl, 'Transfer')
      .withArgs(yyfl.address, wallet.address, stakeAmountAfterEarlyWithdrawalFee)
    expect(await yfl.balanceOf(wallet.address)).to.eq(
      bigNumberify('52000000000000000000000').sub(stakeAmount).add(stakeAmountAfterEarlyWithdrawalFee)
    )
    expect(await yfl.balanceOf(yyfl.address)).to.eq(feeAmount.mul(200000).div(1000000))
    expect(await yfl.balanceOf(other.address)).to.eq(feeAmount.mul(800000).div(1000000))
    expect(await yyfl.balanceOf(wallet.address)).to.eq(0)
  })

  it('withdraw:notEarly', async () => {
    // stake first
    const stakeAmount = expandToDecimals(1, 12) // 0.000001 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    await yyfl.stake(stakeAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000').sub(stakeAmount))
    // 1 block already mined from stake + 9 = 10
    for (let i = 0; i < 9; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)

    await expect(yyfl.withdraw(stakeAmount))
      .to.emit(yyfl, 'Transfer')
      .withArgs(wallet.address, AddressZero, stakeAmount)
      .to.emit(yfl, 'Transfer')
      .withArgs(yyfl.address, wallet.address, stakeAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000'))
    expect(await yfl.balanceOf(yyfl.address)).to.eq(0)
    expect(await yfl.balanceOf(other.address)).to.eq(0)
    expect(await yyfl.balanceOf(wallet.address)).to.eq(0)
  })

  it('withdraw:partial', async () => {
    // stake first
    const stakeAmount = expandToDecimals(1, 12) // 0.000001 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    await yyfl.stake(stakeAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(bigNumberify('52000000000000000000000').sub(stakeAmount))
    // 1 block already mined from stake + 9 = 10
    for (let i = 0; i < 9; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)

    const withdrawAmount = stakeAmount.div(3)
    await expect(yyfl.withdraw(withdrawAmount))
      .to.emit(yyfl, 'Transfer')
      .withArgs(wallet.address, AddressZero, withdrawAmount)
      .to.emit(yfl, 'Transfer')
      .withArgs(yyfl.address, wallet.address, withdrawAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(
      bigNumberify('52000000000000000000000').sub(stakeAmount).add(withdrawAmount)
    )
    expect(await yfl.balanceOf(yyfl.address)).to.eq(stakeAmount.sub(withdrawAmount))
    expect(await yyfl.balanceOf(wallet.address)).to.eq(stakeAmount.sub(withdrawAmount))
  })

  it('withdraw:voteLock', async () => {
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([false, bigNumberify(0)])
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(0)
    await yyfl.vote(0, true, stakeAmount.sub(1))

    await expect(yyfl.withdraw(stakeAmount)).to.be.revertedWith('yYFL: INSUFFICIENT_BALANCE')
    const withdrawAmount = 1
    await expect(yyfl.withdraw(withdrawAmount))
      .to.emit(yyfl, 'Transfer')
      .withArgs(wallet.address, AddressZero, withdrawAmount)
      .to.emit(yfl, 'Transfer')
      .withArgs(yyfl.address, wallet.address, withdrawAmount)
    expect(await yfl.balanceOf(wallet.address)).to.eq(
      bigNumberify('52000000000000000000000').sub(stakeAmount).add(withdrawAmount)
    )
    expect(await yfl.balanceOf(yyfl.address)).to.eq(stakeAmount.sub(withdrawAmount))
    expect(await yyfl.balanceOf(wallet.address)).to.eq(stakeAmount.sub(withdrawAmount))
  })

  it('propose:arityMismatch', async () => {
    await expect(yyfl.propose([yfl.address], [], [], [], 'description')).to.be.revertedWith('yYFL: ARITY_MISMATCH')
    await expect(yyfl.propose([], [0], [], [], 'description')).to.be.revertedWith('yYFL: ARITY_MISMATCH')
    await expect(yyfl.propose([], [], ['signature'], [], 'description')).to.be.revertedWith('yYFL: ARITY_MISMATCH')
    await expect(yyfl.propose([], [], [], [toUtf8Bytes('calldata')], 'description')).to.be.revertedWith(
      'yYFL: ARITY_MISMATCH'
    )
    await expect(
      yyfl.propose([yfl.address], [0, 1], ['signature'], [toUtf8Bytes('calldata')], 'description')
    ).to.be.revertedWith('yYFL: ARITY_MISMATCH')
  })

  it('propose:noActions', async () => {
    await expect(yyfl.propose([], [], [], [], 'description')).to.be.revertedWith('yYFL: NO_ACTIONS')
  })

  it('propose:tooManyActions', async () => {
    const calldata = toUtf8Bytes('calldata')
    await expect(
      yyfl.propose(
        [
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
          yfl.address,
        ],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [
          'signature',
          'signature',
          'signature',
          'signature',
          'signature',
          'signature',
          'signature',
          'signature',
          'signature',
          'signature',
          'signature',
        ],
        [calldata, calldata, calldata, calldata, calldata, calldata, calldata, calldata, calldata, calldata, calldata],
        'description'
      )
    ).to.be.revertedWith('yYFL: TOO_MANY_ACTIONS')
  })

  it('propose:insufficientYflForProposal', async () => {
    try {
      await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    } catch (error) {
      expect(error).to.not.be.null
      expect(error.message).to.contain('SafeMath: division by zero')
    }

    const stakeAmount = expandToDecimals(1, 12) // 0.000001 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await expect(
      yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    ).to.be.revertedWith('yYFL: INSUFFICIENT_YFL_FOR_PROPOSAL')
  })

  it('propose:success', async () => {
    expect(await yyfl.proposals(0)).to.eql([
      AddressZero,
      bigNumberify(0),
      bigNumberify(0),
      bigNumberify(0),
      bigNumberify(0),
      false,
    ])
    expect(await yyfl.proposalCount()).to.eq(0)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.false
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number + 1 // +1 because calling propose increments block
    const calldata = toUtf8Bytes('calldata')

    await expect(yyfl.propose([yfl.address], [0], ['signature'], [calldata], 'description'))
      .to.emit(yyfl, 'ProposalCreated')
      .withArgs(
        0,
        wallet.address,
        [yfl.address],
        [0],
        ['signature'],
        ['0x63616c6c64617461'],
        initialBlock,
        initialBlock + 10,
        'description'
      )
    expect(toUtf8String('0x63616c6c64617461')).to.eq(toUtf8String(calldata))
    expect(await yyfl.getProposalCalls(0)).to.eql([
      [yfl.address],
      [bigNumberify(0)],
      ['signature'],
      ['0x63616c6c64617461'],
    ])
    expect(await yyfl.proposals(0)).to.eql([
      wallet.address,
      bigNumberify(0),
      bigNumberify(0),
      stakeAmount.div(5), // quorum = 20% * totalSupply = stakeAmount/5
      bigNumberify(initialBlock + 10),
      false,
    ])
    expect(await yyfl.proposalCount()).to.eq(1)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.true
  })

  it('propose:pricePerFullShareAboveOne', async () => {
    const stakeAmount = expandToDecimals(5, 16) // 0.05 YFL
    await yfl.transfer(yyfl.address, expandToDecimals(5, 16)) // put in 0.05 YFL extra
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount) // 0.05 shares = 0.1 YFL = minYflForProposal
    expect(
      bigNumberify(await yyfl.balanceOf(wallet.address))
        .mul(bigNumberify(await yyfl.getPricePerFullShare()))
        .div(expandTo18Decimals(1))
    ).to.eq(expandToDecimals(1, 17))

    // shouldn't fail
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
  })

  it('propose:hasActiveProposal', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const calldata = toUtf8Bytes('calldata')
    await yyfl.propose([yfl.address], [0], ['signature'], [calldata], 'description')

    await expect(yyfl.propose([yfl.address], [0], ['signature'], [calldata], 'description')).to.be.revertedWith(
      'yYFL: HAS_ACTIVE_PROPOSAL'
    )
  })

  it('vote:invalidProposalId', async () => {
    await expect(yyfl.vote(0, true, 0)).to.be.revertedWith('yYFL: INVALID_PROPOSAL_ID')
  })

  it('vote:votingEnded', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    // 1 block already mined from propose + 9 = 10
    for (let i = 0; i < 9; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)

    await expect(yyfl.vote(0, true, 0)).to.be.revertedWith('yYFL: VOTING_ENDED')
  })

  it('vote:zero', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')

    await expect(yyfl.vote(0, true, 0)).to.be.revertedWith('yYFL: ZERO')
  })

  it('vote:insufficientBalance', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')

    await expect(yyfl.vote(0, true, stakeAmount.add(1))).to.be.revertedWith('yYFL: INSUFFICIENT_BALANCE')
  })

  it('vote:smallerVote', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    await yyfl.vote(0, true, stakeAmount)

    await expect(yyfl.vote(0, true, stakeAmount.sub(1))).to.be.revertedWith('yYFL: SMALLER_VOTE')
  })

  it('vote:sameVote', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    await yyfl.vote(0, true, stakeAmount)

    await expect(yyfl.vote(0, true, stakeAmount)).to.be.revertedWith('yYFL: SAME_VOTE')
  })

  it('vote:for:full', async () => {
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([false, bigNumberify(0)])
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')

    await expect(yyfl.vote(0, true, stakeAmount))
      .to.emit(yyfl, 'VoteCast')
      .withArgs(wallet.address, 0, true, stakeAmount)
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([true, stakeAmount])
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(stakeAmount)
  })

  it('vote:for:partial', async () => {
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([false, bigNumberify(0)])
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    const voteAmount = stakeAmount.div(2)

    await expect(yyfl.vote(0, true, voteAmount)).to.emit(yyfl, 'VoteCast').withArgs(wallet.address, 0, true, voteAmount)
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([true, voteAmount])
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(voteAmount)
    expect((await yyfl.proposals(0))[1]).to.eq(voteAmount) // for votes
    expect((await yyfl.proposals(0))[2]).to.eq(bigNumberify(0)) // against votes

    // voting more will override previous vote
    await expect(yyfl.vote(0, true, voteAmount.add(1)))
      .to.emit(yyfl, 'VoteCast')
      .withArgs(wallet.address, 0, true, voteAmount.add(1))
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([true, voteAmount.add(1)])
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(voteAmount.add(1))
    expect((await yyfl.proposals(0))[1]).to.eq(voteAmount.add(1)) // for votes
    expect((await yyfl.proposals(0))[2]).to.eq(bigNumberify(0)) // against votes
  })

  it('vote:for:changeSupport', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')

    await yyfl.vote(0, true, stakeAmount)
    expect((await yyfl.proposals(0))[1]).to.eq(stakeAmount) // for votes
    expect((await yyfl.proposals(0))[2]).to.eq(bigNumberify(0)) // against votes

    // smaller amount with support change will still fail
    await expect(yyfl.vote(0, false, stakeAmount.sub(1))).to.be.revertedWith('yYFL: SMALLER_VOTE')

    await expect(yyfl.vote(0, false, stakeAmount))
      .to.emit(yyfl, 'VoteCast')
      .withArgs(wallet.address, 0, false, stakeAmount)
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([false, stakeAmount])
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(stakeAmount)
    expect((await yyfl.proposals(0))[1]).to.eq(bigNumberify(0)) // for votes
    expect((await yyfl.proposals(0))[2]).to.eq(stakeAmount) // against votes
  })

  it('vote:checkVoteExpiry', async () => {
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([false, bigNumberify(0)])
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    expect(bigNumberify(await yyfl.getStakeYflValue(wallet.address))).to.eq(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(0)
    expect(await yyfl.voteLockExpiry(wallet.address)).to.eq(0)
    let initialBlock = (await provider.getBlock('latest')).number
    let voteAmount = stakeAmount.sub(1)

    await expect(yyfl.vote(0, true, voteAmount)).to.emit(yyfl, 'VoteCast').withArgs(wallet.address, 0, true, voteAmount)
    expect(await yyfl.getVotes(0, wallet.address)).to.eql([true, voteAmount])
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(voteAmount)
    expect(await yyfl.voteLockExpiry(wallet.address)).to.eq(initialBlock + 10)

    // a proposal by someone else
    await yfl.transfer(other.address, stakeAmount)
    await yfl.connect(other).approve(yyfl.address, stakeAmount)
    await yyfl.connect(other).stake(stakeAmount)
    expect(bigNumberify(await yyfl.getStakeYflValue(wallet.address))).to.eq(stakeAmount)
    expect(bigNumberify(await yyfl.getStakeYflValue(other.address))).to.eq(stakeAmount)
    await yyfl.connect(other).propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    initialBlock = (await provider.getBlock('latest')).number

    voteAmount = voteAmount.sub(1)
    await expect(yyfl.vote(1, true, voteAmount)).to.be.revertedWith('yYFL: SMALLER_VOTE')

    // 5 blocks already mined from vote/transfer/approve/stake/propose + 5 = 10
    for (let i = 0; i < 5; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await expect(yyfl.vote(1, true, voteAmount)).to.emit(yyfl, 'VoteCast').withArgs(wallet.address, 1, true, voteAmount)
    expect(await yyfl.getVotes(1, wallet.address)).to.eql([true, voteAmount])
    expect(await yyfl.voteLockAmount(wallet.address)).to.eq(voteAmount)
    expect(await yyfl.voteLockExpiry(wallet.address)).to.eq(initialBlock + 10)
  })

  it('executeProposal:invalidProposalId', async () => {
    await expect(yyfl.executeProposal(0)).to.be.revertedWith('yYFL: INVALID_PROPOSAL_ID')
  })

  it('executeProposal:proposalInVoting', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')

    await expect(yyfl.executeProposal(0)).to.be.revertedWith('yYFL: PROPOSAL_IN_VOTING')
  })

  it('executeProposal:proposalDidNotPass', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    await yyfl.propose(
      [yfl.address],
      [0],
      ['balanceOf(address)'],
      [encodeParameters(['address'], [wallet.address])],
      'get balance of wallet address'
    )
    await yyfl.vote(0, false, stakeAmount) // 100% of votes are against votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.true
    expect((await yyfl.proposals(0))[5]).to.be.false

    await expect(yyfl.executeProposal(0)).to.not.emit(yyfl, 'ProposalExecuted')
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.false
    expect((await yyfl.proposals(0))[5]).to.be.false // not executed
  })

  it('executeProposal:expired', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    await yyfl.propose(
      [yfl.address],
      [0],
      ['balanceOf(address)'],
      [encodeParameters(['address'], [wallet.address])],
      'get balance of wallet address'
    )
    await yyfl.vote(0, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 18 = 20
    for (let i = 0; i < 18; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 20)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.true
    expect((await yyfl.proposals(0))[5]).to.be.false

    await expect(yyfl.executeProposal(0)).to.not.emit(yyfl, 'ProposalExecuted')
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.false
    expect((await yyfl.proposals(0))[5]).to.be.false // not executed
  })

  it('executeProposal:failedExecution', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    // this action will fail to execute
    await yyfl.propose([yfl.address], [0], ['signature'], [toUtf8Bytes('calldata')], 'description')
    await yyfl.vote(0, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.true
    expect((await yyfl.proposals(0))[5]).to.be.false

    await expect(yyfl.executeProposal(0)).to.emit(yyfl, 'ProposalExecuted').withArgs(0, false)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.false
    expect((await yyfl.proposals(0))[5]).to.be.true // execution complete
  })

  it('executeProposal:success', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    await yyfl.propose(
      [yfl.address],
      [0],
      ['balanceOf(address)'],
      [encodeParameters(['address'], [wallet.address])],
      'get balance of wallet address'
    )
    await yyfl.vote(0, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.true
    expect((await yyfl.proposals(0))[5]).to.be.false

    await expect(yyfl.executeProposal(0)).to.emit(yyfl, 'ProposalExecuted').withArgs(0, true)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.false
    expect((await yyfl.proposals(0))[5]).to.be.true // execution complete

    await expect(yyfl.executeProposal(0)).to.be.revertedWith('yYFL: PROPOSAL_ALREADY_EXECUTED')
  })

  it('executeProposal:multiple', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    const initialBlock = (await provider.getBlock('latest')).number
    await yyfl.propose(
      [yfl.address, yyfl.address],
      [0, 0],
      ['balanceOf(address)', 'balanceOf(address)'],
      [encodeParameters(['address'], [wallet.address]), encodeParameters(['address'], [wallet.address])],
      'get balances of yfl and yyfl'
    )
    await yyfl.vote(0, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    expect((await provider.getBlock('latest')).number).to.eq(initialBlock + 10)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.true
    expect((await yyfl.proposals(0))[5]).to.be.false

    await expect(yyfl.executeProposal(0)).to.emit(yyfl, 'ProposalExecuted').withArgs(0, true)
    expect(await yyfl.hasActiveProposal(wallet.address)).to.be.false
    expect((await yyfl.proposals(0))[5]).to.be.true // execution successful
  })

  it('executeProposal:withValue', async () => {
    await executeProposal(weth.address, 1, 'deposit()', encodeParameters([''], ['']))
  })

  it('executeProposal:withValue:insufficientEth', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([weth.address], [1], ['deposit()'], [encodeParameters([''], [''])], 'description')
    await yyfl.vote(0, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await expect(
      yyfl.executeProposal(0, {
        ...overrides,
        value: 0,
      })
    ).to.be.revertedWith('yYFL: INSUFFICIENT_ETH')
  })

  it('convertTokensToYfl:invalidYflPurchaser', async () => {
    await expect(yyfl.convertTokensToYfl([link.address], [0])).to.be.revertedWith('yYFL: INVALID_YFL_PURCHASER')
  })

  it('convertTokensToYfl:arityMismatch', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setYflPurchaser(address)',
      encodeParameters(['address'], [yflPurchaser.address])
    )
    await expect(yyfl.convertTokensToYfl([link.address], [0, 1])).to.be.revertedWith('yYFL: ARITY_MISMATCH')
    await expect(yyfl.convertTokensToYfl([link.address, weth.address], [0])).to.be.revertedWith('yYFL: ARITY_MISMATCH')
  })

  it('convertTokensToYfl:alreadyConverted', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setYflPurchaser(address)',
      encodeParameters(['address'], [yflPurchaser.address])
    )
    await expect(yyfl.convertTokensToYfl([yfl.address], [0])).to.be.revertedWith('yYFL: ALREADY_CONVERTED')
    await expect(yyfl.convertTokensToYfl([link.address, yfl.address], [0, 0])).to.be.revertedWith(
      'yYFL: ALREADY_CONVERTED'
    )
  })

  it('convertTokensToYfl:noYflPurchased', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setYflPurchaser(address)',
      encodeParameters(['address'], [yflPurchaser.address])
    )
    await expect(yyfl.convertTokensToYfl([link.address], [0])).to.be.revertedWith('yYFL: NO_YFL_PURCHASED')
  })

  it('convertTokensToYfl', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setYflPurchaser(address)',
      encodeParameters(['address'], [yflPurchaser.address])
    )
    await yfl.transfer(yflPurchaser.address, 1)
    await yyfl.convertTokensToYfl([link.address], [0])
  })

  async function executeProposal(target: any, value: any, signature: any, calldata: any, id = 0) {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([target], [value], [signature], [calldata], 'description')
    await yyfl.vote(id, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await expect(
      yyfl.executeProposal(id, {
        ...overrides,
        value: value,
      })
    )
      .to.emit(yyfl, 'ProposalExecuted')
      .withArgs(id, true)
  }

  async function executeFailingProposal(target: any, value: any, signature: any, calldata: any, id = 0) {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([target], [value], [signature], [calldata], 'description')
    await yyfl.vote(id, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await expect(yyfl.executeProposal(id)).to.emit(yyfl, 'ProposalExecuted').withArgs(id, false)
  }

  it('setTreasury:forbidden', async () => {
    await expect(yyfl.setTreasury(wallet.address)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setTreasury', async () => {
    expect(await yyfl.treasury()).to.eq(other.address)
    await executeProposal(yyfl.address, 0, 'setTreasury(address)', encodeParameters(['address'], [wallet.address]))
    expect(await yyfl.treasury()).to.eq(wallet.address)
  })

  it('setTreasuryEarlyWithdrawalFeeShare:forbidden', async () => {
    await expect(yyfl.setTreasuryEarlyWithdrawalFeeShare(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setTreasuryEarlyWithdrawalFeeShare:0%', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setTreasuryEarlyWithdrawalFeeShare(uint256)',
      encodeParameters(['uint256'], [0])
    )
    expect(await yyfl.treasuryEarlyWithdrawalFeeShare()).to.eq(0)
  })

  it('setTreasuryEarlyWithdrawalFeeShare:12.3456%', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setTreasuryEarlyWithdrawalFeeShare(uint256)',
      encodeParameters(['uint256'], [123456])
    )
    expect(await yyfl.treasuryEarlyWithdrawalFeeShare()).to.eq(123456)
  })

  it('setTreasuryEarlyWithdrawalFeeShare:100%', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setTreasuryEarlyWithdrawalFeeShare(uint256)',
      encodeParameters(['uint256'], [1000000])
    )
    expect(await yyfl.treasuryEarlyWithdrawalFeeShare()).to.eq(1000000)
  })

  it('setTreasuryEarlyWithdrawalFeeShare:>100%', async () => {
    expect(await yyfl.treasuryEarlyWithdrawalFeeShare()).to.eq(800000)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setTreasuryEarlyWithdrawalFeeShare(uint256)',
      encodeParameters(['uint256'], [1000001])
    )
    expect(await yyfl.treasuryEarlyWithdrawalFeeShare()).to.eq(800000) // unchanged
  })

  it('setYflPurchaser:forbidden', async () => {
    await expect(yyfl.setYflPurchaser(wallet.address)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setYflPurchaser:zeroAddress', async () => {
    expect(await yyfl.yflPurchaser()).to.eq(AddressZero)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setYflPurchaser(address)',
      encodeParameters(['address'], [AddressZero])
    )
  })

  it('setYflPurchaser', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setYflPurchaser(address)',
      encodeParameters(['address'], [yflPurchaser.address])
    )
    expect(await yyfl.yflPurchaser()).to.eq(yflPurchaser.address)
  })

  it('setBlocksForNoWithdrawalFee:forbidden', async () => {
    await expect(yyfl.setBlocksForNoWithdrawalFee(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setBlocksForNoWithdrawalFee:0', async () => {
    await executeProposal(yyfl.address, 0, 'setBlocksForNoWithdrawalFee(uint256)', encodeParameters(['uint256'], [0]))
    expect(await yyfl.blocksForNoWithdrawalFee()).to.eq(0)
  })

  it('setBlocksForNoWithdrawalFee:345600', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setBlocksForNoWithdrawalFee(uint256)',
      encodeParameters(['uint256'], [345600])
    )
    expect(await yyfl.blocksForNoWithdrawalFee()).to.eq(345600)
  })

  it('setBlocksForNoWithdrawalFee:>345600', async () => {
    expect(await yyfl.blocksForNoWithdrawalFee()).to.eq(10)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setBlocksForNoWithdrawalFee(uint256)',
      encodeParameters(['uint256'], [345601])
    )
    expect(await yyfl.blocksForNoWithdrawalFee()).to.eq(10) // unchanged
  })

  it('setEarlyWithdrawalFeePercent:forbidden', async () => {
    await expect(yyfl.setEarlyWithdrawalFeePercent(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setEarlyWithdrawalFeePercent:0%', async () => {
    await executeProposal(yyfl.address, 0, 'setEarlyWithdrawalFeePercent(uint256)', encodeParameters(['uint256'], [0]))
    expect(await yyfl.earlyWithdrawalFeePercent()).to.eq(0)
  })

  it('setEarlyWithdrawalFeePercent:100%', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setEarlyWithdrawalFeePercent(uint256)',
      encodeParameters(['uint256'], [1000000])
    )
    expect(await yyfl.earlyWithdrawalFeePercent()).to.eq(1000000)
  })

  it('setEarlyWithdrawalFeePercent:>100%', async () => {
    expect(await yyfl.earlyWithdrawalFeePercent()).to.eq(10000)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setEarlyWithdrawalFeePercent(uint256)',
      encodeParameters(['uint256'], [1000001])
    )
    expect(await yyfl.earlyWithdrawalFeePercent()).to.eq(10000) // unchanged
  })

  it('setVotingPeriodBlocks:forbidden', async () => {
    await expect(yyfl.setVotingPeriodBlocks(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setVotingPeriodBlocks:<1920', async () => {
    expect(await yyfl.votingPeriodBlocks()).to.eq(10)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setVotingPeriodBlocks(uint256)',
      encodeParameters(['uint256'], [1919])
    )
    expect(await yyfl.votingPeriodBlocks()).to.eq(10) // unchanged
  })

  it('setVotingPeriodBlocks:1920', async () => {
    await executeProposal(yyfl.address, 0, 'setVotingPeriodBlocks(uint256)', encodeParameters(['uint256'], [1920]))
    expect(await yyfl.votingPeriodBlocks()).to.eq(1920)
  })

  it('setVotingPeriodBlocks:80640', async () => {
    await executeProposal(yyfl.address, 0, 'setVotingPeriodBlocks(uint256)', encodeParameters(['uint256'], [80640]))
    expect(await yyfl.votingPeriodBlocks()).to.eq(80640)
  })

  it('setVotingPeriodBlocks:>80640', async () => {
    expect(await yyfl.votingPeriodBlocks()).to.eq(10)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setVotingPeriodBlocks(uint256)',
      encodeParameters(['uint256'], [80641])
    )
    expect(await yyfl.votingPeriodBlocks()).to.eq(10) // unchanged
  })

  it('setMinYflForProposal:forbidden', async () => {
    await expect(yyfl.setMinYflForProposal(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setMinYflForProposal:<0.01', async () => {
    expect(await yyfl.minYflForProposal()).to.eq(expandToDecimals(1, 17))
    await executeFailingProposal(
      yyfl.address,
      0,
      'setMinYflForProposal(uint256)',
      encodeParameters(['uint256'], [expandToDecimals(1, 16).sub(1)])
    )
    expect(await yyfl.minYflForProposal()).to.eq(expandToDecimals(1, 17)) // unchanged
  })

  it('setMinYflForProposal:0.01', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setMinYflForProposal(uint256)',
      encodeParameters(['uint256'], [expandToDecimals(1, 16)])
    )
    expect(await yyfl.minYflForProposal()).to.eq(expandToDecimals(1, 16))
  })

  it('setMinYflForProposal:520', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setMinYflForProposal(uint256)',
      encodeParameters(['uint256'], [expandToDecimals(520, 18)])
    )
    expect(await yyfl.minYflForProposal()).to.eq(expandToDecimals(520, 18))
  })

  it('setMinYflForProposal:>520', async () => {
    expect(await yyfl.minYflForProposal()).to.eq(expandToDecimals(1, 17))
    await executeFailingProposal(
      yyfl.address,
      0,
      'setMinYflForProposal(uint256)',
      encodeParameters(['uint256'], [expandToDecimals(520, 18).add(1)])
    )
    expect(await yyfl.minYflForProposal()).to.eq(expandToDecimals(1, 17)) // unchanged
  })

  it('setQuorumPercent:forbidden', async () => {
    await expect(yyfl.setQuorumPercent(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setQuorumPercent:<10%', async () => {
    expect(await yyfl.quorumPercent()).to.eq(200000)
    await executeFailingProposal(yyfl.address, 0, 'setQuorumPercent(uint256)', encodeParameters(['uint256'], [99999]))
    expect(await yyfl.quorumPercent()).to.eq(200000) // unchanged
  })

  it('setQuorumPercent:10%', async () => {
    await executeProposal(yyfl.address, 0, 'setQuorumPercent(uint256)', encodeParameters(['uint256'], [100000]))
    expect(await yyfl.quorumPercent()).to.eq(100000)
  })

  it('setQuorumPercent:33%', async () => {
    await executeProposal(yyfl.address, 0, 'setQuorumPercent(uint256)', encodeParameters(['uint256'], [330000]))
    expect(await yyfl.quorumPercent()).to.eq(330000)
  })

  it('setQuorumPercent:>33%', async () => {
    expect(await yyfl.quorumPercent()).to.eq(200000)
    await executeFailingProposal(yyfl.address, 0, 'setQuorumPercent(uint256)', encodeParameters(['uint256'], [330001]))
    expect(await yyfl.quorumPercent()).to.eq(200000) // unchanged
  })

  it('setVoteThresholdPercent:forbidden', async () => {
    await expect(yyfl.setVoteThresholdPercent(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setVoteThresholdPercent:<50%', async () => {
    expect(await yyfl.voteThresholdPercent()).to.eq(500000)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setVoteThresholdPercent(uint256)',
      encodeParameters(['uint256'], [499999])
    )
    expect(await yyfl.voteThresholdPercent()).to.eq(500000) // unchanged
  })

  it('setVoteThresholdPercent:50%', async () => {
    await executeProposal(yyfl.address, 0, 'setVoteThresholdPercent(uint256)', encodeParameters(['uint256'], [500000]))
    expect(await yyfl.voteThresholdPercent()).to.eq(500000)
  })

  it('setVoteThresholdPercent:66%', async () => {
    await executeProposal(yyfl.address, 0, 'setVoteThresholdPercent(uint256)', encodeParameters(['uint256'], [660000]))
    expect(await yyfl.voteThresholdPercent()).to.eq(660000)
  })

  it('setVoteThresholdPercent:>66%', async () => {
    expect(await yyfl.voteThresholdPercent()).to.eq(500000)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setVoteThresholdPercent(uint256)',
      encodeParameters(['uint256'], [660001])
    )
    expect(await yyfl.voteThresholdPercent()).to.eq(500000) // unchanged
  })

  it('setExecutionPeriodBlocks:forbidden', async () => {
    await expect(yyfl.setExecutionPeriodBlocks(0)).to.be.revertedWith('yYFL: FORBIDDEN')
  })

  it('setExecutionPeriodBlocks:<1920', async () => {
    expect(await yyfl.executionPeriodBlocks()).to.eq(10)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setExecutionPeriodBlocks(uint256)',
      encodeParameters(['uint256'], [1919])
    )
    expect(await yyfl.executionPeriodBlocks()).to.eq(10) // unchanged
  })

  it('setExecutionPeriodBlocks:1920', async () => {
    await executeProposal(yyfl.address, 0, 'setExecutionPeriodBlocks(uint256)', encodeParameters(['uint256'], [1920]))
    expect(await yyfl.executionPeriodBlocks()).to.eq(1920)
  })

  it('setExecutionPeriodBlocks:172800', async () => {
    await executeProposal(yyfl.address, 0, 'setExecutionPeriodBlocks(uint256)', encodeParameters(['uint256'], [172800]))
    expect(await yyfl.executionPeriodBlocks()).to.eq(172800)
  })

  it('setExecutionPeriodBlocks:>172800', async () => {
    expect(await yyfl.executionPeriodBlocks()).to.eq(10)
    await executeFailingProposal(
      yyfl.address,
      0,
      'setExecutionPeriodBlocks(uint256)',
      encodeParameters(['uint256'], [172801])
    )
    expect(await yyfl.executionPeriodBlocks()).to.eq(10) // unchanged
  })

  it('stake:forbidden', async () => {
    await yfl.approve(yyfl.address, 1)
    await executeFailingProposal(yyfl.address, 0, 'stake(uint256 amount)', encodeParameters(['uint256'], [1]))
  })

  it('convertTokensToYfl:reentrancyLock', async () => {
    await executeProposal(
      yyfl.address,
      0,
      'setYflPurchaser(address)',
      encodeParameters(['address'], [yflPurchaser.address])
    )
    await yfl.transfer(yflPurchaser.address, 1)
    await executeFailingProposal(
      yyfl.address,
      0,
      'convertTokensToYfl(address[],uint256[])',
      encodeParameters(['address[]', 'uint256[]'], [[link.address], [0]]),
      1
    )
  })

  it('withdraw:forbidden', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose([yyfl.address], [0], ['withdraw(uint256)'], [encodeParameters(['uint256'], [1])], 'description')
    await yyfl.vote(0, true, stakeAmount.sub(1)) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await expect(yyfl.executeProposal(0)).to.emit(yyfl, 'ProposalExecuted').withArgs(0, false)
  })

  it('propose:reentrancyLock', async () => {
    await executeFailingProposal(
      yyfl.address,
      0,
      'propose(address[],uint256[],string[],bytes[],string)',
      encodeParameters(
        ['address[]', 'uint256[]', 'string[]', 'bytes[]', 'string'],
        [[yfl.address], [0], ['balanceOf(address)'], [yfl.address], 'description']
      )
    )
  })

  it('vote:reentrancyLock', async () => {
    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose(
      [yyfl.address],
      [0],
      ['vote(uint256,bool,uint256)'],
      [encodeParameters(['uint256', 'bool', 'uint256'], [0, true, 1])],
      'description'
    )
    await yyfl.vote(0, true, stakeAmount.sub(1)) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await expect(yyfl.executeProposal(0)).to.emit(yyfl, 'ProposalExecuted').withArgs(0, false)
  })

  it('executeProposal:reentrancyLock', async () => {
    await executeFailingProposal(yyfl.address, 0, 'executeProposal(uint256)', encodeParameters(['uint256'], [1]))
  })

  it('transfer:reentrancyLock', async () => {
    await executeFailingProposal(
      yyfl.address,
      0,
      'transfer(address,uint256)',
      encodeParameters(['address', 'uint256'], [wallet.address, 0])
    )
  })

  it('approve:reentrancyLock', async () => {
    await executeFailingProposal(
      yyfl.address,
      0,
      'approve(address,uint256)',
      encodeParameters(['address', 'uint256'], [wallet.address, 0])
    )
  })

  it('transferFrom:reentrancyLock', async () => {
    await executeFailingProposal(
      yyfl.address,
      0,
      'transferFrom(address,address,uint256)',
      encodeParameters(['address', 'address', 'uint256'], [yyfl.address, wallet.address, 0])
    )
  })

  it('increaseAllowance:reentrancyLock', async () => {
    await executeFailingProposal(
      yyfl.address,
      0,
      'increaseAllowance(address,uint256)',
      encodeParameters(['address', 'uint256'], [yyfl.address, 0])
    )
  })

  it('decreaseAllowance:reentrancyLock', async () => {
    await executeFailingProposal(
      yyfl.address,
      0,
      'decreaseAllowance(address,uint256)',
      encodeParameters(['address', 'uint256'], [yyfl.address, 0])
    )
  })

  it('factory:approvePairViaGovernance', async () => {
    await factory.setGovernance(yyfl.address)
    expect(await factory.governance()).to.eq(yyfl.address)
    const tokens: [string, string] = [
      '0x1000000000000000000000000000000000000000',
      '0x2000000000000000000000000000000000000000',
    ]
    expect(await factory.approvedPair(...tokens)).to.eq(false)
    expect(await factory.getPair(...tokens)).to.eq(AddressZero)
    expect(await factory.allPairsLength()).to.eq(0)

    const stakeAmount = expandToDecimals(1, 17) // 0.1 YFL
    await yfl.approve(yyfl.address, stakeAmount)
    await yyfl.stake(stakeAmount)
    await yyfl.propose(
      [factory.address],
      [0],
      ['approvePairViaGovernance(address,address)'], // space between parameters will cause failure
      [encodeParameters(['address', 'address'], [...tokens])],
      'description'
    )
    await yyfl.vote(0, true, stakeAmount) // 100% of votes are for votes
    // 2 blocks already mined from propose/vote + 8 = 10
    for (let i = 0; i < 8; i++) {
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp)
    }
    await expect(yyfl.executeProposal(0)).to.emit(yyfl, 'ProposalExecuted').withArgs(0, true)
    expect(await factory.approvedPair(...tokens)).to.eq(true)
    expect(await factory.getPair(...tokens)).to.eq(AddressZero)
    expect(await factory.allPairsLength()).to.eq(0)

    // anyone can manually create after approval (creating via governance costs too much gas and fails)
    await factory.connect(other).createPair(tokens[0], 0, tokens[1], 0, 0, AddressZero)
    expect(await factory.getPair(...tokens)).to.not.eq(AddressZero)
    expect(await factory.allPairsLength()).to.eq(1)
  })

  it('factory:setTreasury', async () => {
    await factory.setGovernance(yyfl.address)
    expect(await factory.treasury()).to.eq(other.address)
    await executeProposal(factory.address, 0, 'setTreasury(address)', encodeParameters(['address'], [wallet.address]))
    expect(await factory.treasury()).to.eq(wallet.address)
  })
})
