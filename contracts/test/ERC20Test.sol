pragma solidity 0.6.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Test is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) public ERC20(name, symbol) {
        _mint(msg.sender, totalSupply);
        _setupDecimals(18);
    }
}
