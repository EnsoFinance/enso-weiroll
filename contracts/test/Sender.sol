// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.16;

contract Sender {
    function sender() public view returns (address) {
        return msg.sender;
    }
}
