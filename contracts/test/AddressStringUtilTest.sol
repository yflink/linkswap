pragma solidity 0.6.6;

import "../libraries/AddressStringUtil.sol";

contract AddressStringUtilTest {
    function toAsciiString(address addr, uint256 len) external pure returns (string memory) {
        return AddressStringUtil.toAsciiString(addr, len);
    }
}
