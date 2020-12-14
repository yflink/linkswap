pragma solidity 0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IYFLPurchaser.sol";

contract YFLPurchaserTest is IYFLPurchaser {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    address public immutable governance;
    IERC20 public immutable yfl;

    constructor(address _governance, address _yfl) public {
        governance = _governance;
        yfl = IERC20(_yfl);
    }

    function purchaseYfl(address[] calldata tokens) external override {
        if (yfl.balanceOf(address(this)) > 0) {
            // need to send this contract 1 yfl first
            yfl.safeTransfer(governance, 1);
        }
        // transfer all tokens back
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            token.safeTransfer(governance, token.balanceOf(address(this)));
        }
    }
}
