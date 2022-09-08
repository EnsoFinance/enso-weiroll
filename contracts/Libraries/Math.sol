// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

contract Math {
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }

    function sub(uint256 a, uint256 b) external pure returns (uint256) {
        return a - b;
    }

    function mul(uint256 a, uint256 b) external pure returns (uint256) {
        return a * b;
    }

    function div(uint256 a, uint256 b) external pure returns (uint256) {
        return a / b;
    }

    function sum(uint256[] calldata values)
        external
        pure
        returns (uint256 ret)
    {
        uint256 valuesLength = values.length;
        for (uint256 i; i < valuesLength; ++i) {
            ret += values[i];
        }
    }

    function sumAndMultiply(uint256[] calldata a, uint256[] calldata b)
        external
        pure
        returns (uint256 ret)
    {
        uint256 sumA;
        for (uint256 i = 0; i < a.length; i++) {
            sumA += a[i];
        }
        uint256 sumB;
        for (uint256 i = 0; i < b.length; i++) {
            sumB += b[i];
        }
        ret = sumA * sumB;
    }
}
