pragma solidity 0.6.6;

import "../interfaces/ILinkswapPriceOracle.sol";

contract LinkswapPriceOracleTest is ILinkswapPriceOracle {
    function update() external override {}

    function calculateTokenAmountFromUsdAmount(address, uint256 fakeReturnAmount)
        external
        view
        override
        returns (uint256 tokenAmount)
    {
        return fakeReturnAmount;
    }

    function calculateUsdAmountFromTokenAmount(address, uint256 fakeReturnAmount)
        external
        view
        override
        returns (uint256 usdAmount)
    {
        return fakeReturnAmount;
    }
}
