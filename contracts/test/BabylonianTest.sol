pragma solidity 0.6.6;

import "../libraries/Math.sol";

contract BabylonianTest {
    function sqrt(uint256 num) public pure returns (uint256) {
        return Math.sqrt(num);
    }
}
