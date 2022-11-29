// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "forge-std/Test.sol";

import "./weiroll.sol";

import "../contracts/test/TestableVM.sol";
import "../contracts/test/Sender.sol";
import "../contracts/test/Struct.sol";
import "../contracts/Libraries/Events.sol";
import "../contracts/Libraries/Math.sol";

contract TestWeiVM is Test {
    event LogAddress(address message);

    TestableVM weiVM;
    Sender sender;
    Events events;
    Math math;
    Struct structer;

    function setUp() public {
        weiVM = new TestableVM();
        sender = new Sender();
        events = new Events();
        math = new Math();
        structer = new Struct();
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

    function testReturnStringStruct() public {
        Struct.StringStruct memory stringStruct = Struct.StringStruct({
            a: "Hello",
            b: "World"
        });

        bytes32[] memory commands = new bytes32[](1);

        commands[0] = WeirollPlanner.buildCommand(
            structer.returnStringStruct.selector,
            0x81, // call and set tup bit
            0x80ffffffffff, // use index 0 as variable input
            0x01, // store into index 1
            address(structer)
        );

        // state needs to be large enough to store the result at index 1
        bytes[] memory state = new bytes[](2);

        // abi encode
        bytes memory state0 = abi.encode(stringStruct);

        // strip the double abi encoding, not needed for arguments
        state[0] = new bytes(state0.length - 0x20);
        memcpy(state0, 0x20, state[0], 0, state0.length - 0x20);

        bytes[] memory returnedState = weiVM.execute(commands, state);

        // for some reason, we need to get rid of the first 32 bytes. What's in there?
        bytes memory returnedState1 = new bytes(returnedState[1].length - 0x20);
        memcpy(
            returnedState[1],
            0x20,
            returnedState1,
            0,
            returnedState[1].length - 0x20
        );

        (string memory a, ) = abi.decode(returnedState1, (string, string));
        assertEq(a, "Hello");
    }

    function testFuzzReturnStringStruct(string memory _a, string memory _b) public {
        Struct.StringStruct memory stringStruct = Struct.StringStruct({
            a: _a,
            b: _b
        });

        bytes32[] memory commands = new bytes32[](1);

        commands[0] = WeirollPlanner.buildCommand(
            structer.returnStringStruct.selector,
            0x81, // call and set tup bit
            0x80ffffffffff, // use index 0 as variable input
            0x01, // store into index 1
            address(structer)
        );

        // state needs to be large enough to store the result at index 1
        bytes[] memory state = new bytes[](2);

        // abi encode
        bytes memory state0 = abi.encode(stringStruct);

        // strip the double abi encoding, not needed for arguments
        state[0] = new bytes(state0.length - 0x20);
        memcpy(state0, 0x20, state[0], 0, state0.length - 0x20);

        bytes[] memory returnedState = weiVM.execute(commands, state);

        // for some reason, we need to get rid of the first 32 bytes. What's in there?
        bytes memory returnedState1 = new bytes(returnedState[1].length - 0x20);
        memcpy(
            returnedState[1],
            0x20,
            returnedState1,
            0,
            returnedState[1].length - 0x20
        );

        (string memory a, ) = abi.decode(returnedState1, (string, string));
        assertEq(a, _a);
    }

    function memcpy(
        bytes memory src,
        uint256 srcIdx,
        bytes memory dest,
        uint256 destIdx,
        uint256 len
    ) internal view {
        assembly {
            pop(
                staticcall(
                    gas(),
                    4,
                    add(add(src, 32), srcIdx),
                    len,
                    add(add(dest, 32), destIdx),
                    len
                )
            )
        }
    }
}
