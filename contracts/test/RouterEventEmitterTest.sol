pragma solidity 0.6.6;

import "../interfaces/ILinkswapRouter.sol";

contract RouterEventEmitterTest {
    event Amounts(uint256[] amounts);

    receive() external payable {}

    function swapExactTokensForTokens(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) =
            router.delegatecall(
                abi.encodeWithSelector(
                    ILinkswapRouter(router).swapExactTokensForTokens.selector,
                    amountIn,
                    amountOutMin,
                    path,
                    to,
                    deadline
                )
            );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapTokensForExactTokens(
        address router,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) =
            router.delegatecall(
                abi.encodeWithSelector(
                    ILinkswapRouter(router).swapTokensForExactTokens.selector,
                    amountOut,
                    amountInMax,
                    path,
                    to,
                    deadline
                )
            );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapExactETHForTokens(
        address router,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        (bool success, bytes memory returnData) =
            router.delegatecall(
                abi.encodeWithSelector(
                    ILinkswapRouter(router).swapExactETHForTokens.selector,
                    amountOutMin,
                    path,
                    to,
                    deadline
                )
            );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapTokensForExactETH(
        address router,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) =
            router.delegatecall(
                abi.encodeWithSelector(
                    ILinkswapRouter(router).swapTokensForExactETH.selector,
                    amountOut,
                    amountInMax,
                    path,
                    to,
                    deadline
                )
            );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapExactTokensForETH(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        (bool success, bytes memory returnData) =
            router.delegatecall(
                abi.encodeWithSelector(
                    ILinkswapRouter(router).swapExactTokensForETH.selector,
                    amountIn,
                    amountOutMin,
                    path,
                    to,
                    deadline
                )
            );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }

    function swapETHForExactTokens(
        address router,
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        (bool success, bytes memory returnData) =
            router.delegatecall(
                abi.encodeWithSelector(
                    ILinkswapRouter(router).swapETHForExactTokens.selector,
                    amountOut,
                    path,
                    to,
                    deadline
                )
            );
        assert(success);
        emit Amounts(abi.decode(returnData, (uint256[])));
    }
}
