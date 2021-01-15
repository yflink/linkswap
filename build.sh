#!/usr/bin/env bash
echo 'set cwd..'
cd "$(dirname "$0")"
rm -rf cache
rm -rf artifacts
echo 'flattening StakingRewardsFactory...'
npx truffle-flattener contracts/YFLink.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened-contracts/YFLink.sol
npx truffle-flattener contracts/YFLPurchaser.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened-contracts/YFLPurchaser.sol
npx truffle-flattener contracts/yYFL.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened-contracts/yYFL.sol
npx truffle-flattener contracts/LinkswapFactory.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened-contracts/LinkswapFactory.sol
npx truffle-flattener contracts/LinkswapPair.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened-contracts/LinkswapPair.sol
npx truffle-flattener contracts/LinkswapPriceOracle.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened-contracts/LinkswapPriceOracle.sol
npx truffle-flattener contracts/LinkswapRouter.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened-contracts/LinkswapRouter.sol
cd flattened-contracts
echo 'Compiling flattened contracts...'
yarn compile
echo "Copying artifacts to Prodartifacts..."
cp -rf ./artifacts/contracts/YFLink.sol/YFLink.json prodartifacts/YFLink.json
cp -rf ./artifacts/contracts/YFLPurchaser.sol/YFLPurchaser.json prodartifacts/YFLPurchaser.json
cp -rf ./artifacts/contracts/yYFL.sol/yYFL.json prodartifacts/yYFL.json
cp -rf ./artifacts/contracts/LinkswapFactory.sol/LinkswapFactory.json prodartifacts/LinkswapFactory.json
cp -rf ./artifacts/contracts/LinkswapPair.sol/LinkswapPair.json prodartifacts/LinkswapPair.json
cp -rf ./artifacts/contracts/LinkswapPriceOracle.sol/LinkswapPriceOracle.json prodartifacts/LinkswapPriceOracle.json
cp -rf ./artifacts/contracts/LinkswapRouter.sol/LinkswapRouter.json prodartifacts/LinkswapRouter.json
echo 'done!'
