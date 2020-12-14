pragma solidity 0.6.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WETHTest is ERC20 {
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) public ERC20(name, symbol) {
        _mint(msg.sender, totalSupply);
        _setupDecimals(18);
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) public {
        require(balanceOf(msg.sender) >= wad);
        _burn(msg.sender, wad);
        msg.sender.transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }
}
