// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.16;

import "../StatelessVM.sol";

contract TestableStatelessVM is StatelessVM {
    function execute(bytes32[] calldata commands, bytes[] memory state)
        public
        payable
        returns (bytes[] memory)
    {
        return _execute(commands, state);
    }

    receive() external payable {}
}
