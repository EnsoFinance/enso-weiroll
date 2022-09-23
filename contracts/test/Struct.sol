// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../Libraries/Events.sol";

contract Struct is Events {
    struct StringStruct {
      string a;
      string b;
    }

    struct MixedStruct {
      uint256 a;
      address b;
    }

    struct DataStruct {
      bytes32 id;
      uint256 category;
      address from;
      address to;
      uint256 amount;
      bytes data;
    }

    struct UserStruct {
      address from;
      bool approvedTo;
      address to;
      bool approvedFrom;
    }

    struct MultiStruct {
      address a;
      address b;
      DataStruct d;
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
        returns (string memory, uint256, address)
    {
        emit LogString(param);
        emit LogUint(values.a);
        emit LogAddress(values.b);
        return (param, values.a, values.b);
    }

    function returnComplexStruct(
        DataStruct memory dataStruct,
        UserStruct memory userStruct,
        uint256 amount,
        uint256 timestamp
    )
        external
        returns (bytes32)
    {
        return dataStruct.id;
    }

    function returnMultiStructArray(
        MultiStruct[] memory multiStructs
    ) external returns (uint256, bytes32){
        return (multiStructs.length, multiStructs[0].d.id);
    }
}
