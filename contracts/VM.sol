// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "./CommandBuilder.sol";

abstract contract VM {
    using CommandBuilder for bytes[];

    uint256 constant FLAG_CT_DELEGATECALL = 0x00;
    uint256 constant FLAG_CT_CALL = 0x01;
    uint256 constant FLAG_CT_STATICCALL = 0x02;
    uint256 constant FLAG_CT_VALUECALL = 0x03;
    uint256 constant FLAG_CT_MASK = 0x03;
    uint256 constant FLAG_DATA = 0x20;
    uint256 constant FLAG_EXTENDED_COMMAND = 0x40;
    uint256 constant FLAG_TUPLE_RETURN = 0x80;

    uint256 constant SHORT_COMMAND_FILL =
        0x000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    error ExecutionFailed(
        uint256 command_index,
        address target,
        string message
    );

    function _execute(bytes32[] calldata commands, bytes[] memory state)
        internal
        returns (bytes[] memory)
    {
        bytes32 command;
        uint256 flags;
        bytes32 indices;

        bool success;
        bytes memory outData;

        uint256 commandsLength = commands.length;
        for (uint256 i; i < commandsLength; i = _uncheckedIncrement(i)) {
            command = commands[i];
            flags = uint256(uint8(bytes1(command << 32)));

            if (flags & FLAG_EXTENDED_COMMAND != 0) {
                i = _uncheckedIncrement(i);
                indices = commands[i];
            } else {
                indices = bytes32(uint256(command << 40) | SHORT_COMMAND_FILL);
            }

            if (flags & FLAG_CT_MASK == FLAG_CT_DELEGATECALL) {
                (success, outData) = address(uint160(uint256(command))) // target
                    .delegatecall(
                        // inputs
                        flags & FLAG_DATA == 0
                            ? state.buildInputs(
                                bytes4(command), // selector
                                indices
                            )
                            : state[
                                uint8(bytes1(indices)) &
                                CommandBuilder.IDX_VALUE_MASK
                            ]
                    );
            } else if (flags & FLAG_CT_MASK == FLAG_CT_CALL) {
                (success, outData) = address(uint160(uint256(command))).call( // target
                    // inputs
                    flags & FLAG_DATA == 0
                        ? state.buildInputs(
                            bytes4(command), // selector
                            indices
                        )
                        : state[
                            uint8(bytes1(indices)) &
                            CommandBuilder.IDX_VALUE_MASK
                        ]
                );
            } else if (flags & FLAG_CT_MASK == FLAG_CT_STATICCALL) {
                (success, outData) = address(uint160(uint256(command))) // target
                    .staticcall(
                        // inputs
                        flags & FLAG_DATA == 0
                            ? state.buildInputs(
                                bytes4(command), // selector
                                indices
                            )
                            : state[
                                uint8(bytes1(indices)) &
                                CommandBuilder.IDX_VALUE_MASK
                            ]
                    );
            } else if (flags & FLAG_CT_MASK == FLAG_CT_VALUECALL) {
                uint256 callEth;
                bytes memory v = state[
                    uint8(bytes1(indices)) &
                    CommandBuilder.IDX_VALUE_MASK
                ];
                assembly {
                    callEth := mload(add(v, 0x20))
                }
                (success, outData) = address(uint160(uint256(command))).call{ // target
                    value: callEth
                }(
                    // inputs
                    flags & FLAG_DATA == 0
                        ? state.buildInputs(
                            bytes4(command), // selector
                            indices << 8 // skip value input
                        )
                        : state[
                            uint8(bytes1(indices << 8)) & // first byte after value input
                            CommandBuilder.IDX_VALUE_MASK
                        ]
                );
            } else {
                revert("Invalid calltype");
            }

            if (!success) {
                string memory message = "Unknown";
                if (outData.length > 68) {
                    // This might be an error message, parse the outData
                    // Remove selector. First 32 bytes should be a pointer that indicates the start of data in memory
                    assembly {
                        outData := add(outData, 4)
                    }
                    uint256 pointer = uint256(bytes32(outData));
                    if (pointer == 32) {
                        // Remove pointer. If it is a string, the next 32 bytes will hold the size
                        assembly {
                            outData := add(outData, 32)
                        }
                        uint256 size = uint256(bytes32(outData));
                        // Remove size. The remaining data should be the string content
                        assembly {
                            outData := add(outData, 32)
                        }
                        // If the size variable is the same as the remaining bytes length, we can be fairly certain
                        // this is a dynamic string, so convert the bytes to a string and emit the message. While an
                        // error function with 3 static parameters is capable of producing a similar output, there is
                        // low risk of a contract unintentionally emitting a message.
                        if (size == outData.length) message = string(outData);
                    }
                }
                revert ExecutionFailed({
                    command_index: flags & FLAG_EXTENDED_COMMAND == 0
                        ? i
                        : i - 1,
                    target: address(uint160(uint256(command))),
                    message: message
                });
            }

            if (flags & FLAG_TUPLE_RETURN != 0) {
                state.writeTuple(bytes1(command << 88), outData);
            } else {
                state = state.writeOutputs(bytes1(command << 88), outData);
            }
        }
        return state;
    }

    function _uncheckedIncrement(uint256 i) private pure returns (uint256) {
        unchecked {
            ++i;
        }
        return i;
    }
}
