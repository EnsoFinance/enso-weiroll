// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library CommandBuilder {
    uint256 constant IDX_VARIABLE_LENGTH = 0x80;
    uint256 constant IDX_VALUE_MASK = 0x7f;
    uint256 constant IDX_END_OF_ARGS = 0xff;
    uint256 constant IDX_USE_STATE = 0xfe;
    uint256 constant IDX_DYNAMIC_START = 0xfd;
    uint256 constant IDX_DYNAMIC_END = 0xfc;

    struct OffsetData {
      uint8 idx;
      uint8 parentIdx;
      uint8 depth;
      uint232 length;
    }

    function buildInputs(
        bytes[] memory state,
        bytes4 selector,
        bytes32 indices
    ) internal view returns (bytes memory ret) {
        uint256 idx; // The current command index
        uint8 offsetIdx; // The index of the next free offset

        uint232 count; // Number of bytes in whole ABI encoded message
        uint232 free; // Pointer to first free byte in tail part of message

        OffsetData memory offset;
        OffsetData[] memory offsets = new OffsetData[](10); // Optionally store the length of all dynamic types (a command cannot fit more than 10 dynamic types)
        bytes memory stateData; // Optionally encode the current state if the call requires it

        uint256 indicesLength; // Number of indices

        // Determine the length of the encoded data
        for (uint256 i; i < 32; ) {
            idx = uint8(indices[i]);
            if (idx == IDX_END_OF_ARGS) {
                indicesLength = i;
                break;
            }
            if (idx & IDX_VARIABLE_LENGTH != 0) {
                if (idx == IDX_USE_STATE) {
                    if (stateData.length == 0) {
                        stateData = abi.encode(state);
                    }
                    unchecked {
                        free += 32;
                        count += uint232(stateData.length); // TODO: safecast
                    }
                } else if (idx == IDX_DYNAMIC_START) {
                    uint8 parentIdx;
                    uint8 depth;
                    if (offset.depth != 0) {
                      // Set parent idx and depth based on current offset
                      parentIdx = offset.idx;
                      unchecked {
                        depth = offset.depth + 1;
                      }
                      // Set current offset into the offsets array
                      offsets[parentIdx] = offset;
                      delete offset;
                    } else {
                      parentIdx = type(uint8).max;
                    }
                    offset.idx = offsetIdx;
                    offset.parentIdx = parentIdx;
                    offset.depth = depth;
                    unchecked {
                        offsetIdx++;
                    }
                } else if (idx == IDX_DYNAMIC_END) {
                    offsets[offset.idx] = offset;
                    if (offset.depth > 1) {
                      // Return to parent offset
                      offset = offsets[offset.parentIdx];
                    } else {
                      delete offset;
                    }
                    // Increase count and free for dynamic type pointer
                    unchecked {
                        free += 32;
                        count += 32;
                    }
                } else {
                    // Add the size of the value, rounded up to the next word boundary, plus space for pointer and length
                    uint232 argLen = uint232(state[idx & IDX_VALUE_MASK].length); // TODO: safecast
                    require(
                        argLen % 32 == 0,
                        "Dynamic state variables must be a multiple of 32 bytes"
                    );
                    unchecked {
                        count += argLen + 32;
                    }
                    if (offset.depth != 0) {
                        // Increase offset size
                        unchecked {
                            offset.length += 32;
                        }
                    } else {
                        // Progress next free slot
                        unchecked {
                            free += 32;
                        }
                    }
                }
            } else {
                require(
                    state[idx & IDX_VALUE_MASK].length == 32,
                    "Static state variables must be 32 bytes"
                );
                unchecked {
                    count += 32;
                }
                if (offset.depth != 0) {
                    unchecked {
                        offset.length += 32;
                    }
                } else {
                    unchecked {
                        free += 32;
                    }
                }
            }
            unchecked {
                ++i;
            }
        }

        // Encode it
        ret = new bytes(count + 4);
        assembly {
            mstore(add(ret, 32), selector)
        }
        count = 0;
        offsetIdx = 0;
        for (uint256 i; i < indicesLength; ) {
            idx = uint8(indices[i]);
            if (idx & IDX_VARIABLE_LENGTH != 0) {
                if (idx == IDX_USE_STATE) {
                    assembly {
                        mstore(add(add(ret, 36), count), free)
                    }
                    memcpy(stateData, 32, ret, free + 4, stateData.length - 32);
                    unchecked {
                        free += uint232(stateData.length) - 32;
                        count += 32;
                    }
                } else if (idx == IDX_DYNAMIC_START) {
                    // Start of dynamic type, put pointer in current slot
                    assembly {
                        mstore(add(add(ret, 36), count), free)
                    }
                    offset = offsets[offsetIdx];
                    unchecked {
                        offset.length += free;
                        count += 32;
                        offsetIdx++;
                    }
                } else if (idx == IDX_DYNAMIC_END) {
                    if (offset.depth > 1) {
                      // Return to parent offset
                      offset = offsets[offset.parentIdx];
                      // TODO: Check if this is needed and/or if there is a better way to do it
                      unchecked {
                          offset.length += free;
                      }
                    } else {
                      delete offset;
                    }
                } else {
                    // Variable length data
                    uint232 argLen = uint232(state[idx & IDX_VALUE_MASK].length); // TODO: safecast

                    if (offset.depth != 0) {
                        // Part of dynamic type; put a pointer in the first free slot and write the data to the offset free slot
                        uint232 pointer = offsets[offset.idx].length;
                        assembly {
                            mstore(add(add(ret, 36), free), pointer)
                        }
                        unchecked {
                            free += 32;
                        }
                        memcpy(
                            state[idx & IDX_VALUE_MASK],
                            0,
                            ret,
                            offset.length + 4,
                            argLen
                        );
                        unchecked {
                            offsets[offset.idx].length += argLen;
                            offset.length += argLen;
                        }
                    } else {
                        // Put a pointer in the current slot and write the data to first free slot
                        assembly {
                            mstore(add(add(ret, 36), count), free)
                        }
                        memcpy(
                            state[idx & IDX_VALUE_MASK],
                            0,
                            ret,
                            free + 4,
                            argLen
                        );
                        unchecked {
                            free += argLen;
                            count += 32;
                        }
                    }
                }
            } else {
                // Fixed length data
                bytes memory stateVar = state[idx & IDX_VALUE_MASK];
                if (offset.depth != 0) {
                    // Part of dynamic type; write to first free slot
                    assembly {
                        mstore(add(add(ret, 36), free), mload(add(stateVar, 32)))
                    }
                    unchecked {
                        free += 32;
                    }
                } else {
                    // Write the data to current slot
                    assembly {
                        mstore(add(add(ret, 36), count), mload(add(stateVar, 32)))
                    }
                    unchecked {
                        count += 32;
                    }
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    function writeOutputs(
        bytes[] memory state,
        bytes1 index,
        bytes memory output
    ) internal pure returns (bytes[] memory) {
        uint256 idx = uint8(index);
        if (idx == IDX_END_OF_ARGS) return state;

        if (idx & IDX_VARIABLE_LENGTH != 0) {
            if (idx == IDX_USE_STATE) {
                state = abi.decode(output, (bytes[]));
            } else {
                // Check the first field is 0x20 (because we have only a single return value)
                uint256 argPtr;
                assembly {
                    argPtr := mload(add(output, 32))
                }
                require(
                    argPtr == 32,
                    "Only one return value permitted (variable)"
                );

                assembly {
                    // Overwrite the first word of the return data with the length - 32
                    mstore(add(output, 32), sub(mload(output), 32))
                    // Insert a pointer to the return data, starting at the second word, into state
                    mstore(
                        add(add(state, 32), mul(and(idx, IDX_VALUE_MASK), 32)),
                        add(output, 32)
                    )
                }
            }
        } else {
            // Single word
            require(
                output.length == 32,
                "Only one return value permitted (static)"
            );

            state[idx & IDX_VALUE_MASK] = output;
        }

        return state;
    }

    function writeTuple(
        bytes[] memory state,
        bytes1 index,
        bytes memory output
    ) internal view {
        uint256 idx = uint256(uint8(index));
        if (idx == IDX_END_OF_ARGS) return;

        bytes memory entry = state[idx] = new bytes(output.length + 32);
        memcpy(output, 0, entry, 32, output.length);
        assembly {
            let l := mload(output)
            mstore(add(entry, 32), l)
        }
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
