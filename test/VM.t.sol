// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "forge-std/Test.sol";

import "./weiroll.sol";

import "../contracts/test/TestableVM.sol";
import "../contracts/test/Sender.sol";
import "../contracts/Libraries/Events.sol";
import "../contracts/Libraries/Math.sol";

contract TestWeiVM is Test {
    event LogAddress(address message);

    TestableVM weiVM;
    Sender sender;
    Events events;
    Math math;

    function setUp() public {
        weiVM = new TestableVM();
        sender = new Sender();
        events = new Events();
        math = new Math();
    }

    function testShouldReturnAndEmitMsgSender() public {
        bytes32[] memory commands = new bytes32[](2);

        commands[0] = WeirollPlanner.buildCommand(
            sender.sender.selector,
            0x00, // delegate call
            0xffffffffffff, // no inputs
            0x00, // store fixed size result at index 0 of state
            address(sender)
        );

        commands[1] = WeirollPlanner.buildCommand(
            events.logAddress.selector,
            0x00, // delegate call
            0x00ffffffffff, // use fixed size var at index 0 of state as input
            0xff, // no output
            address(events)
        );

        // only 1 value in state
        bytes[] memory state = new bytes[](1);

        // event is emitted
        vm.expectEmit(true, true, true, true);
        emit LogAddress(address(this));
        bytes[] memory returnedState = weiVM.execute(commands, state);

        // index 0 of state contains the correct address
        assertEq(
            address(uint160(uint256(bytes32(returnedState[0])))),
            address(this)
        );
    }

    function testShouldReturnMsgSenderAtIndex1() public {
        bytes32[] memory commands = new bytes32[](1);

        commands[0] = WeirollPlanner.buildCommand(
            sender.sender.selector,
            0x00, // delegate call
            0xffffffffffff, // no inputs
            0x01, // store fixed size result at index 1 of state
            address(sender)
        );

        // we only have 1 value in state, but we put it at index 1 so state needs to be sized for 2 bytes
        bytes[] memory state = new bytes[](2);

        bytes[] memory returnedState = weiVM.execute(commands, state);

        // index 0 of state should be empty
        assertEq(uint256(bytes32(returnedState[0])), 0);
        // index 1 of state contains the correct address
        assertEq(
            address(uint160(uint256(bytes32(returnedState[1])))),
            address(this)
        );
    }

    function testShouldReturnMsgSenderAtIndexFuzz(uint8 _index) public {
        bytes1 index = bytes1(uint8(bound(_index, 1, 127) - 1));
        bytes32[] memory commands = new bytes32[](1);

        commands[0] = WeirollPlanner.buildCommand(
            sender.sender.selector,
            0x00, // delegate call
            0xffffffffffff, // no inputs
            index, // store fixed size result at fuzzed index
            address(sender)
        );

        // state needs to be large enough to store the result at fuzzed index
        bytes[] memory state = new bytes[](uint8(index) + 1);

        bytes[] memory returnedState = weiVM.execute(commands, state);

        assertEq(
            address(uint160(uint256(bytes32(returnedState[uint8(index)])))),
            address(this)
        );
    }

    function testSimpleAdd() public {
        bytes32[] memory commands = new bytes32[](1);

        commands[0] = WeirollPlanner.buildCommand(
            math.add.selector,
            0x00, // delegate call
            0x0000ffffffff, // use index 0 and index 0 as inputs
            0x01, // store fixed size result at index 1 of state
            address(math)
        );

        // state needs to be large enough to store the result at index 1
        bytes[] memory state = new bytes[](2);
        state[0] = abi.encodePacked(uint256(1));

        bytes[] memory returnedState = weiVM.execute(commands, state);

        assertEq(uint256(bytes32(returnedState[1])), 2);
    }

    function testFuzzAdd(uint128 _a, uint128 _b) public {
        bytes32[] memory commands = new bytes32[](1);

        commands[0] = WeirollPlanner.buildCommand(
            math.add.selector,
            0x00, // delegate call
            0x0001ffffffff, // use index 0 and index 1 as inputs
            0x02, // store fixed size result at index 2 of state
            address(math)
        );

        // state needs to be large enough to store the result at index 2
        bytes[] memory state = new bytes[](3);
        state[0] = abi.encodePacked(uint256(_a));
        state[1] = abi.encodePacked(uint256(_b));

        bytes[] memory returnedState = weiVM.execute(commands, state);

        assertEq(uint256(bytes32(returnedState[2])), uint256(_a) + _b);
    }
}
