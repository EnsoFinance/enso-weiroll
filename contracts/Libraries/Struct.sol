// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract Struct {
    struct StringStruct {
      string a;
      string b;
    }

    struct MixedStruct {
      uint256 a;
      address b;
    }

    function returnStringStruct(StringStruct memory values)
        external
        pure
        returns (string memory, string memory)
    {
        return (values.a, values.b);
    }

    function returnMixedStruct(MixedStruct memory values)
        external
        pure
        returns (uint256, address)
    {
        return (values.a, values.b);
    }


    function returnParamAndStruct(uint256 param, MixedStruct memory values)
        external
        pure
        returns (uint256, uint256, address)
    {
        return (param, values.a, values.b);
    }

    function returnDynamicParamAndStruct(string memory param, MixedStruct memory values)
        external
        pure
        returns (string memory, uint256, address)
    {
        return (param, values.a, values.b);
    }
}
