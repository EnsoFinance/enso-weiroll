// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

contract Revert {
    function fail() public pure {
        require(false, "Hello World!");
    }
}
