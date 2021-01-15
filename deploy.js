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

const unpackArtifact = (artifactPath) => {
  let contractData = JSON.parse(fs.readFileSync(artifactPath));

  const contractBytecode = contractData['bytecode'];
  const contractABI = contractData['abi'];
  const constructorArgs = contractABI.filter((itm) => {
    return itm.type == 'constructor';
  });

  let constructorStr;
  if (constructorArgs.length < 1) {
    constructorStr = '    -- No constructor arguments -- ';
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

let provider;

if (process.env.NETWORK == 'mainnet') {
  provider = ethers.getDefaultProvider('homestead');
  wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
} else if (process.env.NETWORK == 'ropsten') {
  provider = ethers.getDefaultProvider('ropsten');
  wethAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
}

let wallet, connectedWallet;
wallet = Wallet.fromMnemonic(process.env.MNEMONIC);
connectedWallet = wallet.connect(provider);

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

// Ropsten testnet addresses
const yYFLAddress = '';
const YFLinkAddress = '';
const YFLPurchaserAddress = '';
const LinkswapRouterAddress = '';
const LinkswapPriceOracleAddress = '';
const LinkswapPairAddress = '';
const LinkswapFactoryAddress = '';

// From here, all the args are to be determined.
if (!YFLinkAddress) {
  deploy(YFLinkArtifact);
  return;
}

if (!yYFLAddress) {
  deploy(yYFLArtifact, [
    YFLinkAddress,
    _treasury,
    _blocksForNoWithdrawalFee,
    _votingPeriodBlocks,
    _executionPeriodBlocks,
  ]);
  return;
}

if (!YFLPurchaserAddress) {
  deploy(YFLPurchaserArtifact, [
    _governance,
    _link,
    _weth,
    _yfl,
    _linkWethPair,
    _yflWethPair,
  ]);
  return;
}

if (!LinkswapPairAddress) {
  deploy(LinkswapPairArtifact);
  return;
}

if (!LinkswapFactoryAddress) {
  deploy(LinkswapFactoryArtifact, [
    _governance,
    _treasury,
    _priceOracle,
    _linkListingFeeInUsd,
    _wethListingFeeInUsd,
    _yflListingFeeInUsd,
    _treasuryListingFeeShare,
    _minListingLockupAmountInUsd,
    _targetListingLockupAmountInUsd,
    _minListingLockupPeriod,
    _targetListingLockupPeriod,
    _lockupAmountListingFeeDiscountShare,
    _linkToken,
    _WETH,
    _yflToken,
  ]);
  return;
}

if (!LinkswapRouterAddress) {
  deploy(LinkswapRouterArtifact, [LinkswapFactoryAddress, _WETH]);
  return;
}

if (!LinkswapPriceOracleAddress) {
  deploy(LinkswapPriceOracleArtifact, [
    _factory,
    _linkToken,
    _wethToken,
    _yflToken,
    _linkUsdChainlinkOracle,
    _wethUsdChainlinkOracle,
  ]);
  return;
}
