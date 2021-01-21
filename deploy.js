const { ethers, Wallet, ContractFactory } = require('ethers');
const fs = require('fs');
require('dotenv').config();

const yYFLArtifact = './prodartifacts/yYFL.json';
const YFLinkArtifact = './prodartifacts/YFLink.json';
const YFLPurchaserArtifact = './prodartifacts/YFLPurchaser.json';
const LinkswapRouterArtifact = './prodartifacts/LinkswapRouter.json';
const LinkswapPairArtifact = './prodartifacts/LinkswapPair.json';
const LinkswapPriceOracleArtifact = './prodartifacts/LinkswapPriceOracle.json';
const LinkswapFactoryArtifact = './prodartifacts/LinkswapFactory.json';

let wethToken,
  yflToken,
  uniswapFactory,
  yYFLAddress,
  linkUsdChainlinkOracle,
  wethUsdChainlinkOracle,
  YFLPurchaserAddress,
  LinkswapRouterAddress,
  LinkswapPriceOracleAddress,
  LinkswapPairAddress,
  LinkswapFactoryAddress;

let provider, wallet, connectedWallet;

if (process.env.NETWORK == 'mainnet') {
  provider = ethers.getDefaultProvider('homestead');

  wethToken = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  linkUsdChainlinkOracle = '0x32dbd3214aC75223e27e575C53944307914F7a90';
  wethUsdChainlinkOracle = '0xF79D6aFBb6dA890132F9D7c355e3015f15F3406F';

  yflToken = '0x28cb7e841ee97947a86B06fA4090C8451f64c0be';
  linkToken = '0x514910771af9ca656af840dff83e8264ecf986ca';
  uniswapFactory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
} else if (process.env.NETWORK == 'ropsten') {
  provider = ethers.getDefaultProvider('ropsten');

  wethToken = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  uniswapFactory = '0x9c83dCE8CA20E9aAF9D3efc003b2ea62aBC08351';
  yflToken = '0xbDF1Af73400CB3419050e896D86f34d42D5492Da';
  yYFLAddress = '';
  linkToken = '';

  linkUsdChainlinkOracle = '';
  wethUsdChainlinkOracle = '';
  YFLPurchaserAddress = '';
  LinkswapRouterAddress = '';
  LinkswapPriceOracleAddress = '';
  LinkswapPairAddress = '';
  LinkswapFactoryAddress = '';
}

wallet = Wallet.fromMnemonic(process.env.MNEMONIC);
connectedWallet = wallet.connect(provider);

// Test addresses
const governance = '0x0389d755C1833C9b350d4E8B619Eae16deFc1CbA';
const treasury = '0xE69A81b96FBF5Cb6CAe95d2cE5323Eff2bA0EAE4';

const linkListingFeeInUsd = 2500 * 100000000;
const wethListingFeeInUsd = 3000 * 100000000;
const yflListingFeeInUsd = 2000 * 100000000;
const treasuryListingFeeShare = 100000;
const minListingLockupAmountInUsd = 5000 * 100000000;
const targetListingLockupAmountInUsd = 25000 * 100000000;
const minListingLockupPeriod = 7 * 24 * 60 * 60;
const targetListingLockupPeriod = 30 * 24 * 60 * 60;
const lockupAmountListingFeeDiscountShare = 500000;

const blocksForNoWithdrawalFee = 30 * 24 * 60 * 4; //(30 days in blocks assuming block every 15 seconds)
const votingPeriodBlocks = 3 * 24 * 60 * 4; //(3 days in blocks)
const executionPeriodBlocks = 3 * 24 * 60 * 4; //(3 days in blocks)

const unpackArtifact = (artifactPath) => {
  let contractData = JSON.parse(fs.readFileSync(artifactPath));

  const contractBytecode = contractData['bytecode'];
  const contractABI = contractData['abi'];
  const constructorArgs = contractABI.filter((itm) => {
    return itm.type == 'constructor';
  });

  let constructorStr;
  if (constructorArgs.length < 1) {
    constructorStr = ' -- No constructor arguments -- ';
  } else {
    constructorJSON = constructorArgs[0].inputs;
    constructorStr = JSON.stringify(
      constructorJSON.map((c) => {
        return {
          name: c.name,
          type: c.type,
        };
      })
    );
  }

  return {
    abi: contractABI,
    bytecode: contractBytecode,
    contractName: contractData.contractName,
    constructor: constructorStr,
  };
};

const deployContract = async (
  contractABI,
  contractBytecode,
  wallet,
  provider,
  args = []
) => {
  const factory = new ContractFactory(
    contractABI,
    contractBytecode,
    wallet.connect(provider)
  );
  return await factory.deploy(...args);
};

const deploy = async (artifactPath, args) => {
  try {
    let tokenUnpacked = unpackArtifact(artifactPath);
    console.log(
      `${tokenUnpacked.contractName} \n Constructor: ${tokenUnpacked.constructor}`
    );
    const token = await deployContract(
      tokenUnpacked.abi,
      tokenUnpacked.bytecode,
      wallet,
      provider,
      args
    );
    console.log(`⌛ Deploying ${tokenUnpacked.contractName}...`);

    await connectedWallet.provider.waitForTransaction(
      token.deployTransaction.hash
    );
    console.log(
      `✅ Deployed ${tokenUnpacked.contractName} to ${token.address}`
    );
  } catch (err) {
    console.log('deploy ======>', err);
  }
};

// From here, all the args are to be determined.

if (!yflToken) {
  deploy(YFLinkArtifact);
  return;
}

if (!yYFLAddress) {
  deploy(yYFLArtifact, [
    yflToken,
    treasury,
    blocksForNoWithdrawalFee,
    votingPeriodBlocks,
    executionPeriodBlocks,
  ]);
  return;
}

if (!YFLPurchaserAddress) {
  deploy(YFLPurchaserArtifact, [
    governance,
    link,
    weth,
    yfl,
    linkWethPair,
    yflWethPair,
  ]);
  return;
}

if (!LinkswapPairAddress) {
  deploy(LinkswapPairArtifact);
  return;
}

if (!LinkswapFactoryAddress) {
  deploy(LinkswapFactoryArtifact, [
    governance,
    treasury,
    priceOracle,
    linkListingFeeInUsd,
    wethListingFeeInUsd,
    yflListingFeeInUsd,
    treasuryListingFeeShare,
    minListingLockupAmountInUsd,
    targetListingLockupAmountInUsd,
    minListingLockupPeriod,
    targetListingLockupPeriod,
    lockupAmountListingFeeDiscountShare,
    linkToken,
    WETH,
    yflToken,
  ]);
  return;
}

if (!LinkswapRouterAddress) {
  deploy(LinkswapRouterArtifact, [LinkswapFactoryAddress, _WETH]);
  return;
}

if (!LinkswapPriceOracleAddress) {
  deploy(LinkswapPriceOracleArtifact, [
    uniswapFactory,
    linkToken,
    wethToken,
    yflToken,
    linkUsdChainlinkOracle,
    wethUsdChainlinkOracle,
  ]);
  return;
}
