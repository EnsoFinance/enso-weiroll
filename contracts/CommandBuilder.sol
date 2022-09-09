// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

library CommandBuilder {
    uint256 constant IDX_VARIABLE_LENGTH = 0x80;
    uint256 constant IDX_VALUE_MASK = 0x7f;
    uint256 constant IDX_END_OF_ARGS = 0xff;
    uint256 constant IDX_USE_STATE = 0xfe;
    uint256 constant IDX_NO_OFFSET = 0xfd;
    uint256 constant IDX_POINTER = 0xfc;

    function buildInputs(
        bytes[] memory state,
        bytes4 selector,
        bytes32 indices
    ) internal view returns (bytes memory ret) {
        uint256 count; // Number of bytes in whole ABI encoded message
        uint256 free; // Pointer to first free byte in tail part of message
        uint256[] memory offsets; // Pointers for dynamic types
        bytes memory stateData; // Optionally encode the current state if the call requires it

        uint256 offsetsCount; // Keep track of the index for each offset
        uint256 offsetsLength; // Number of offsets
        uint256 indicesLength; // Number of indices

        uint256 idx = uint8(indices[0]);
        if (idx != IDX_NO_OFFSET) {
          offsetsLength = abi.decode(state[idx & IDX_VALUE_MASK], (uint256));
          if (offsetsLength > 0) {
            offsets = new uint256[](offsetsLength);
          }
        }

        // Determine the length of the encoded data
        for (uint256 i = 1; i < 32; ) { // i starts at 1 because the first index is reserved for the offset data
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
                    count += stateData.length;
                    unchecked {
                        free += 32;
                    }
                } else if (idx == IDX_POINTER) {
                    if (offsetsCount == 0) {
                        offsets[offsetsCount++] = offsetsLength * 32;
                    } else {
                        offsets[offsetsCount++] = free - offsets[offsetsCount - 1];
                    }
                    count += 32;
                } else {
                    // Add the size of the value, rounded up to the next word boundary, plus space for pointer and length
                    uint256 arglen = state[idx & IDX_VALUE_MASK].length;
                    require(
                        arglen % 32 == 0,
                        "Dynamic state variables must be a multiple of 32 bytes"
                    );
                    count += arglen + 32;
                    unchecked {
                        free += 32;
                    }
                }
            } else {
                require(
                    state[idx & IDX_VALUE_MASK].length == 32,
                    "Static state variables must be 32 bytes"
                );
                count += 32;
                unchecked {
                    free += 32;
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
        for (uint256 i; i < offsetsLength; ) {
            uint256 offset = offsets[i];
            assembly {
                mstore(add(add(ret, 36), count), offset)
            }
            count += 32;
            unchecked {
                ++i;
            }
        }
        for (uint256 i = 1; i < indicesLength; ) { // i starts at 1 because the first index is reserved for the offset data
            idx = uint8(indices[i]);
            if (idx & IDX_VARIABLE_LENGTH != 0) {
                if (idx == IDX_USE_STATE) {
                    assembly {
                        mstore(add(add(ret, 36), count), free)
                    }
                    memcpy(stateData, 32, ret, free + 4, stateData.length - 32);
                    free += stateData.length - 32;
                    unchecked {
                        count += 32;
                    }
                } else if (idx != IDX_POINTER) {
                    uint256 arglen = state[idx & IDX_VALUE_MASK].length;
                    uint256 offset = offsetsLength > 0 ? offsets[0] : 0;

                    // Variable length data; put a pointer in the slot and write the data at the end
                    assembly {
                        mstore(add(add(ret, 36), count), free)
                    }
                    memcpy(
                        state[idx & IDX_VALUE_MASK],
                        0,
                        ret,
                        free + offset + 4,
                        arglen
                    );
                    free += arglen;
                    unchecked {
                        count += 32;
                    }
                }
            } else {
                // Fixed length data; write it directly
                bytes memory statevar = state[idx & IDX_VALUE_MASK];
                assembly {
                    mstore(add(add(ret, 36), count), mload(add(statevar, 32)))
                }
                unchecked {
                    count += 32;
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
                uint256 argptr;
                assembly {
                    argptr := mload(add(output, 32))
                }
                require(
                    argptr == 32,
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
        uint256 srcidx,
        bytes memory dest,
        uint256 destidx,
        uint256 len
    ) internal view {
        assembly {
            pop(
                staticcall(
                    gas(),
                    4,
                    add(add(src, 32), srcidx),
                    len,
                    add(add(dest, 32), destidx),
                    len
                )
            )
        }
    }
}
