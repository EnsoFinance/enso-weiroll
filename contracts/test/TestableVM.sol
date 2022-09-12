// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "../VM.sol";

contract TestableVM is VM {
    function execute(bytes32[] calldata commands, bytes[] memory state)
        public
        payable
        returns (bytes[] memory)
    {
        return _execute(commands, state);
    }
}
