// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "forge-std/Test.sol";

import "./weiroll.sol";

import "../contracts/test/TestableVM.sol";
import "../contracts/test/Sender.sol";
import "../contracts/Libraries/Events.sol";
import "../contracts/Libraries/Math.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract TestWeiVMDeployed is Test {
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    ISwapRouter public constant swapRouter =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    uint24 public constant poolFee = 3000;

    TestableVM weiVM;
    Sender sender;
    Events events;
    Math math;

    function setUp() public {
        vm.createSelectFork("mainnet");

        weiVM = new TestableVM();
        sender = new Sender();
        events = new Events();
        math = new Math();
    }

    function testUniswapV3Swap() public {
        assertEq(IERC20(DAI).balanceOf(address(this)), 0);
        assertEq(IERC20(WETH9).balanceOf(address(this)), 0);

        deal(DAI, address(this), 1 ether);
        IERC20(DAI).approve(address(swapRouter), 1 ether);

        assertEq(IERC20(DAI).balanceOf(address(this)), 1 ether);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: DAI,
                tokenOut: WETH9,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: 1 ether,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        bytes32[] memory commands = new bytes32[](2);

        commands[0] = WeirollPlanner.buildCommand(
            swapRouter.exactInputSingle.selector,
            0x41, // call with ext bit set
            0x000000000000, // ignored and instead use the following bytes32 in commands
            0x08, // store fixed size result at index 8 of state
            address(swapRouter)
        );

        // extended in indices
        commands[1] = 0x0001020304050607ffffffffffffffffffffffffffffffffffffffffffffffff;

        bytes[] memory state = new bytes[](9);
        bytes memory paramBytes = abi.encode(params);

        // Slice the Uniswap struct into the state bytes array
        for (uint256 i; i < paramBytes.length / 32; ) {
            {
                bytes32 extracted;
                /// @solidity memory-safe-assembly
                assembly {
                    extracted := mload(add(paramBytes, mul(0x20, add(i, 1))))
                }
                state[i] = abi.encodePacked(extracted);
            }

            unchecked {
                ++i;
            }
        }

        (bool success, bytes memory data) = address(weiVM)
            .delegatecall(
                abi.encodeWithSelector(weiVM.execute.selector, commands, state)
            );

        assertTrue(success);

        assertLt(IERC20(DAI).balanceOf(address(this)), 1 ether);
        assertGt(IERC20(WETH9).balanceOf(address(this)), 0);

        bytes[] memory returnedState = abi.decode(data, (bytes[]));

        uint256 amountOut = uint256(bytes32(returnedState[8]));
        assertEq(amountOut, IERC20(WETH9).balanceOf(address(this)));
    }
}
