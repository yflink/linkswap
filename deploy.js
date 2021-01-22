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
  linkWethPair,
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
  yflToken = '0x28cb7e841ee97947a86B06fA4090C8451f64c0be';
  linkToken = '0x514910771af9ca656af840dff83e8264ecf986ca';
  wethToken = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  linkUsdChainlinkOracle = '0x32dbd3214aC75223e27e575C53944307914F7a90';
  wethUsdChainlinkOracle = '0xF79D6aFBb6dA890132F9D7c355e3015f15F3406F';
  uniswapFactory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
  linkWethPair = '0x529410569eef63b2d73612f0f844a5133265af68';
} else if (process.env.NETWORK == 'ropsten') {
  provider = ethers.getDefaultProvider('ropsten');
  wethToken = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  yflToken = '0xbDF1Af73400CB3419050e896D86f34d42D5492Da'; // Deployed
  linkToken = '0x20fE562d797A42Dcb3399062AE9546cd06f63280'; // Chainlink Token on Ropsten: Need to confirm again
  linkWethPair = '0x98A608D3f29EebB496815901fcFe8eCcC32bE54a';
  yflWethPair = '0x6d46C94CF93487925cB14912AED99A7A22A34195';
  yYFLAddress = '0xE4754F7Bf142A630853DAD0E4D1a0050e789B74a'; // Deployed
  uniswapFactory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
  linkUsdChainlinkOracle = '0xcfbf4bc22271f4f56a67dda1dcb4549659d0821d'; // https://market.link/feeds/538142f9-a6be-4c9f-b5c4-9f41d80b2f74
  wethUsdChainlinkOracle = '0x4a504064996f695dd8add2452645046289c4811c'; // https://market.link/feeds/750c5ec1-d7ef-4979-90f6-48b2413b742c
  YFLPurchaserAddress = '0x05B3a8d48B7D3AaDeAD7fA494cEF68503052534C'; // Deployed
  LinkswapPairAddress = '0xC26D96e5455f50721a411960bcE372776EF70587'; // Deployed
  LinkswapPriceOracleAddress = '0x4Dae50eA09E2D07D5eCa1042b613560d9136c682'; // Deployed
  LinkswapFactoryAddress = '0x30b467615Aa126C143102531c977f7be9Cb36B28'; // Deployed
  LinkswapRouterAddress = '0xEF4f86Fa246bf8677E566c10Eaa59824660cD1E1';
}

wallet = Wallet.fromMnemonic(process.env.MNEMONIC);
connectedWallet = wallet.connect(provider);

// Test addresses
const governance = '0xAD3e6614754f143a6e602E81086F1dB7afC81569';
const treasury = '0xAD3e6614754f143a6e602E81086F1dB7afC81569';
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
    linkToken,
    wethToken,
    yflToken,
    linkWethPair,
    yflWethPair,
  ]);
  return;
}

if (!LinkswapPairAddress) {
  deploy(LinkswapPairArtifact);
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

if (!LinkswapFactoryAddress) {
  deploy(LinkswapFactoryArtifact, [
    governance,
    treasury,
    LinkswapPriceOracleAddress,
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
    wethToken,
    yflToken,
  ]);
  return;
}

if (!LinkswapRouterAddress) {
  deploy(LinkswapRouterArtifact, [LinkswapFactoryAddress, wethToken]);
  return;
}
