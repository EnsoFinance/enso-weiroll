// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract Type {
    function toInt256(uint256 a) external pure returns (int256) {
        return int256(a); // unsafe
    }
}
