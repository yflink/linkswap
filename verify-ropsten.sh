echo "Verifying contracts"
echo "⌛ Verifying ChainlinkOracle Contract"
npx hardhat verify --network ropsten addr 'arg1' 
echo "⌛ Verifying YFLink Contract"
npx hardhat verify --network ropsten 0xbDF1Af73400CB3419050e896D86f34d42D5492Da
echo "⌛ Verifying yYFL Contract"
npx hardhat verify --network ropsten 0xE4754F7Bf142A630853DAD0E4D1a0050e789B74a '0xbDF1Af73400CB3419050e896D86f34d42D5492Da' '0xAD3e6614754f143a6e602E81086F1dB7afC81569' 172800 17280 17280
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