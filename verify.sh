echo "Verifying contracts"
echo "⌛ Verifying YFLink Contract"
npx hardhat verify --network ropsten addr 'arg1' 
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