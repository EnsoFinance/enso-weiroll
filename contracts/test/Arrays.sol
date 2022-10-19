// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

contract Arrays {
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

    function returnStringArrayLength(string[] memory values)
        external
        pure
        returns (uint256)
    {
        return values.length;
    }
}
