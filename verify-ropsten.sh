echo "Verifying contracts"
echo "⌛ Verifying ChainlinkOracle Contract"
npx hardhat verify --network ropsten addr 'arg1' 
echo "⌛ Verifying YFLink Contract"
npx hardhat verify --network ropsten 0xbDF1Af73400CB3419050e896D86f34d42D5492Da
echo "⌛ Verifying yYFL Contract"
npx hardhat verify --network ropsten addr 'arg1'
echo "⌛ Verifying YFLPurchase Contract"
npx hardhat verify --network ropsten addr
echo "⌛ Verifying LinkswapRouter Contract"
npx hardhat verify --network ropsten addr
echo "⌛ Verifying LinkswapPriceOracle Contract"
npx hardhat verify --network ropsten addr
echo "⌛ Verifying LinkswapPair Contract"
npx hardhat verify --network ropsten addr
echo "⌛ Verifying LinkswapFactory Contract"
npx hardhat verify --network ropsten addr
echo "✅ Verification Done!"