pragma solidity 0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IYFLPurchaser.sol";

contract YFLPurchaser is IYFLPurchaser, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    address public immutable governance;
    address public immutable link;
    address public immutable weth;
    address public immutable yfl;
    address public immutable linkWethPair;
    address public immutable yflWethPair;

    modifier onlyGovernance() {
        require(msg.sender == governance, "YFLPurchaser: FORBIDDEN");
        _;
    }

    constructor(
        address _governance,
        address _link,
        address _weth,
        address _yfl,
        address _linkWethPair,
        address _yflWethPair
    ) public {
        require(
            _governance != address(0) &&
                _link != address(0) &&
                _weth != address(0) &&
                _yfl != address(0) &&
                _linkWethPair != address(0) &&
                _yflWethPair != address(0),
            "YFLPurchaser: ZERO_ADDRESS"
        );
        governance = _governance;
        link = _link;
        weth = _weth;
        yfl = _yfl;
        linkWethPair = _linkWethPair;
        yflWethPair = _yflWethPair;
    }

    // transfers all tokens back to governance address
    function emergencyWithdraw(address[] calldata tokens) external onlyGovernance {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            token.safeTransfer(governance, token.balanceOf(address(this)));
        }
    }

    // Converts LINK or WETH to YFL via Uniswap V2 - no other tokens accepted for this implementation.
    function purchaseYfl(address[] calldata tokens) external override onlyGovernance nonReentrant {
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] == link || tokens[i] == weth, "YFLPurchaser: INVALID_TOKEN");
            if (tokens[i] == link) {
                IERC20 linkToken = IERC20(link);
                uint256 linkBalance = linkToken.balanceOf(address(this));
                // only swaps LINK for WETH if > 10 LINK to save gas
                if (linkBalance > 1e19) {
                    linkToken.safeTransfer(linkWethPair, linkBalance);
                    _swap(link, linkBalance, weth, linkWethPair);
                }
            } else if (tokens[i] == weth) {
                _convertWethToYfl();
            }
        }
        _convertWethToYfl();
        // transfer all tokens back
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            token.safeTransfer(governance, token.balanceOf(address(this)));
        }
    }

    function _convertWethToYfl() private {
        IERC20 wethToken = IERC20(weth);
        uint256 wethBalance = wethToken.balanceOf(address(this));
        // only swaps WETH for YFL if > 0.1 ETH to save gas
        if (wethBalance > 1e17) {
            wethToken.safeTransfer(yflWethPair, wethBalance);
            _swap(weth, wethBalance, yfl, yflWethPair);
            IERC20 yflToken = IERC20(yfl);
            uint256 yflBalance = yflToken.balanceOf(address(this));
            // only transfers if > 0.01 YFL to save gas
            if (yflBalance > 1e16) {
                yflToken.safeTransfer(governance, yflBalance);
            }
        }
    }

    // requires the initial amount to have already been sent to the pair
    function _swap(
        address inputToken,
        uint256 inputAmount,
        address outputToken,
        address pair
    ) private {
        address token0 = inputToken < outputToken ? inputToken : outputToken;
        uint256 amountOut;
        {
            (uint256 token0Reserve, uint256 token1Reserve, ) = IUniswapV2Pair(pair).getReserves();
            (uint256 reserveIn, uint256 reserveOut) = inputToken == token0
                ? (token0Reserve, token1Reserve)
                : (token1Reserve, token0Reserve);
            uint256 amountInWithFee = inputAmount.mul(997);
            uint256 numerator = amountInWithFee.mul(reserveOut);
            uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
            amountOut = numerator / denominator;
        }
        (uint256 amount0Out, uint256 amount1Out) = inputToken == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));
        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, pair, new bytes(0));
    }
}
